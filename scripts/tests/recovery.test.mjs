import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../onesa-mobile-backend/src/platform/store.ts';
import { AuthStore } from '../../onesa-mobile-backend/src/auth/store.ts';
import { encodeBase32, seal, totpAt, totpStep, unseal } from '../../onesa-mobile-backend/src/auth/crypto.ts';
import { createBackup, createRecoveryKey, readKeyFile, restoreBackup } from '../backup-lib.mjs';

async function fixture(t, mode = 'lab') {
  const root = await mkdtemp(join(tmpdir(), 'onesa-recovery-test-'));
  await chmod(root, 0o700);
  const database = join(root, 'live', 'onesa-mobile.sqlite');
  const keyPath = join(root, 'keys', 'backup.key');
  const archive = join(root, 'backups', 'pilot.omb');
  const target = join(root, 'restored', 'onesa-mobile.sqlite');
  await createRecoveryKey(keyPath);
  const config = { mode, databasePath: database, publicOrigin: 'https://mobile.example.invalid', allowedOrigins: ['https://mobile.example.invalid'], ...(mode === 'production' ? { encryptionKey: randomBytes(32).toString('hex') } : {}) };
  const store = new Store(database);
  const auth = new AuthStore(config);
  const totpSeed = encodeBase32(randomBytes(20));
  t.after(async () => { auth.close(); store.close(); await rm(root, { recursive: true, force: true }); });
  const actor = { subject: randomUUID(), role: 'admin', displayName: 'Synthetic recovery operator' };
  const record = store.idempotent(actor, randomBytes(16).toString('hex'), 'test.createSite', { area: 'Synthetic bench' }, () => {
    const item = store.insert('sites', actor.subject, { name: 'Synthetic recovery bench', area: 'Synthetic bench', purpose: 'device_bench' });
    store.audit(actor, 'test.createSite', item.id);
    return item;
  });
  if (mode === 'lab') {
    auth.db.prepare('INSERT INTO mobile_auth_users(id,username,display_name,role,password_hash,totp_secret,last_totp_counter) VALUES(?,?,?,?,?,?,?)')
      .run(actor.subject, 'synthetic-admin', actor.displayName, 'admin', 'synthetic-password-hash', seal(totpSeed, auth.key), 1);
  }
  auth.addSession({ id: randomUUID(), token_hash: randomBytes(32).toString('hex'), subject: actor.subject, source: mode === 'lab' ? 'lab' : 'onesa', csrf: randomBytes(24).toString('hex'), authenticated_at: 1, expires_at: 9999999999, user_revision: mode === 'lab' ? 1 : null, onesa_access_token: mode === 'production' ? seal('synthetic-provider-token', auth.key) : null, surface: 'staff' });
  auth.db.prepare('INSERT INTO mobile_auth_flows VALUES(?,?,?,?,?,?,?,?,?)').run('state-hash','cookie-hash','sealed-verifier','nonce','staff','/',9999999999,null,null);
  auth.db.prepare('INSERT INTO mobile_auth_handoffs VALUES(?,?,?,?,?)').run('code-hash','challenge','state','sealed-token',9999999999);
  return { root, database, keyPath, archive, target, store, auth, actor, record, config, totpSeed };
}

test('online WAL backup restores records, idempotency and audit while invalidating authentication state', async t => {
  const f = await fixture(t);
  assert.ok((await stat(f.database + '-wal')).size > 0, 'source has committed WAL data while open');
  const before = f.store.db.prepare('SELECT count(*) AS n FROM platform_records').get().n;
  const result = await createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'lab' });
  assert.equal(result.mode, 'lab');
  const encrypted = await readFile(f.archive);
  assert.equal(encrypted.includes(Buffer.from(f.auth.key.toString('hex'))), false, 'auth sidecar is encrypted');
  assert.equal(encrypted.includes(Buffer.from('Synthetic recovery bench')), false, 'records are encrypted');
  assert.equal((await stat(f.archive)).mode & 0o777, 0o600);
  const now = Date.now();
  const recovered = await restoreBackup({ inputPath: f.archive, databasePath: f.target, keyPath: f.keyPath, mode: 'lab', now });
  assert.equal(recovered.invalidatedSessions, 1);
  assert.equal(recovered.disabledLabUsers, 1);
  assert.equal((await stat(f.target)).mode & 0o777, 0o600);
  assert.equal((await stat(f.target + '.authkey')).mode & 0o777, 0o600);
  const store = new Store(f.target), auth = new AuthStore({ ...f.config, databasePath: f.target });
  try {
    assert.equal(store.get('sites', f.record.id).name, 'Synthetic recovery bench');
    assert.equal(store.verifyAudit(), true);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM platform_idempotency').get().n, 1);
    for (const table of ['mobile_auth_sessions', 'mobile_auth_flows', 'mobile_auth_handoffs']) assert.equal(auth.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
    const user = auth.userById(f.actor.subject);
    assert.equal(user.disabled, 1, 'restored historical credentials cannot resurrect revoked access');
    assert.equal(user.revision, 2, 'restored identity capabilities require a new revision');
    assert.equal(unseal(user.totp_secret, auth.key), f.totpSeed);
    assert.equal(user.last_totp_counter, Math.floor(now / 30000) + 1);
    const futureCode = totpAt(f.totpSeed, Math.floor(now / 1000) + 30);
    assert.equal(totpStep(f.totpSeed, futureCode, Math.floor(now / 1000), user.last_totp_counter), null, 'restore cannot replay an accepted future-skew code');
    assert.equal(auth.db.prepare("SELECT count(*) AS n FROM mobile_auth_events WHERE action='recovery.restore'").get().n, 1);
  } finally { store.close(); auth.close(); }
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM platform_records').get().n, before, 'source is unchanged');
  assert.equal(f.auth.db.prepare('SELECT count(*) AS n FROM mobile_auth_sessions').get().n, 1, 'source sessions are unchanged');
  assert.equal((await readdir(join(f.root, 'restored'))).some(name => name.startsWith('.onesa-restore-')), false);
});

test('wrong key, changed ciphertext and truncated archive fail before installing a database', async t => {
  const f = await fixture(t);
  await createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'lab' });
  const wrongKey = join(f.root, 'keys', 'wrong.key');
  await createRecoveryKey(wrongKey);
  await assert.rejects(restoreBackup({ inputPath: f.archive, databasePath: f.target, keyPath: wrongKey, mode: 'lab' }), /authentication failed/);
  await assert.rejects(lstat(f.target), { code: 'ENOENT' });
  const encrypted = await readFile(f.archive);
  encrypted[encrypted.length - 40] ^= 1;
  const tampered = join(f.root, 'backups', 'tampered.omb');
  await writeFile(tampered, encrypted, { mode: 0o600 });
  await assert.rejects(restoreBackup({ inputPath: tampered, databasePath: f.target, keyPath: f.keyPath, mode: 'lab' }), /authentication failed/);
  const truncated = join(f.root, 'backups', 'truncated.omb');
  await writeFile(truncated, encrypted.subarray(0, encrypted.length - 33), { mode: 0o600 });
  await assert.rejects(restoreBackup({ inputPath: truncated, databasePath: f.target, keyPath: f.keyPath, mode: 'lab' }), /authentication failed/);
  await assert.rejects(lstat(f.target), { code: 'ENOENT' });
  assert.deepEqual(await readdir(join(f.root, 'restored')), []);
});

test('backup, key generation and restore refuse to overwrite files or follow key symlinks', async t => {
  const f = await fixture(t);
  await createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'lab' });
  await assert.rejects(createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'lab' }), /already exists/);
  await assert.rejects(createRecoveryKey(f.keyPath), { code: 'EEXIST' });
  await mkdir(join(f.root, 'restored'), { mode: 0o700 });
  await writeFile(f.target + '-wal', 'do not overwrite');
  await assert.rejects(restoreBackup({ inputPath: f.archive, databasePath: f.target, keyPath: f.keyPath, mode: 'lab' }), /already exists/);
  assert.equal(await readFile(f.target + '-wal', 'utf8'), 'do not overwrite');
  const linked = join(f.root, 'keys', 'linked.key');
  await symlink(f.keyPath, linked);
  assert.throws(() => readKeyFile(linked));
  await chmod(f.keyPath, 0o644);
  assert.throws(() => readKeyFile(f.keyPath), /owner-only/);
});

test('lab archives cannot be promoted to production and a lab database cannot create a production archive', async t => {
  const f = await fixture(t);
  await createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'lab' });
  await assert.rejects(restoreBackup({ inputPath: f.archive, databasePath: f.target, keyPath: f.keyPath, mode: 'production' }), /mode does not match/);
  await assert.rejects(createBackup({ databasePath: f.database, outputPath: join(f.root, 'backups', 'production.omb'), keyPath: f.keyPath, mode: 'production' }), /lab authentication key/);
  await assert.rejects(lstat(f.target), { code: 'ENOENT' });
});

test('the backup refuses invalid audit history and unknown schema versions', async t => {
  const f = await fixture(t);
  f.store.db.exec("UPDATE platform_audit SET target='changed-after-audit'");
  await assert.rejects(createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'lab' }), /audit chain/);
  await assert.rejects(lstat(f.archive), { code: 'ENOENT' });
  f.store.db.exec('DELETE FROM platform_audit; UPDATE platform_schema SET version=2');
  await assert.rejects(createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'lab' }), /schema version 1/);
});

test('production recovery excludes the external authentication key and clears provider sessions', async t => {
  const f = await fixture(t, 'production');
  await createBackup({ databasePath: f.database, outputPath: f.archive, keyPath: f.keyPath, mode: 'production' });
  const encrypted = await readFile(f.archive);
  assert.equal(encrypted.includes(Buffer.from(f.config.encryptionKey)), false);
  await restoreBackup({ inputPath: f.archive, databasePath: f.target, keyPath: f.keyPath, mode: 'production' });
  await assert.rejects(lstat(f.target + '.authkey'), { code: 'ENOENT' });
  const auth = new AuthStore({ ...f.config, databasePath: f.target });
  try { assert.equal(auth.db.prepare('SELECT count(*) AS n FROM mobile_auth_sessions').get().n, 0); }
  finally { auth.close(); }
  const verify = new DatabaseSync(f.target, { readOnly: true });
  try { assert.equal(verify.prepare('SELECT count(*) AS n FROM platform_records').get().n, 1); }
  finally { verify.close(); }
});
