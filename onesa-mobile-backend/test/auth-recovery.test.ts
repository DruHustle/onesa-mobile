import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthService, AuthError, type LabCredentials } from '../src/auth/service.ts';
import { totpAt } from '../src/auth/crypto.ts';
const local = { mode: 'lab' as const, publicOrigin: 'http://localhost:5173', allowedOrigins: ['http://localhost:5173'] };

test('reissue requires explicit existing-role review, preserves subject and invalidates old credentials', async () => {
  const auth = new AuthService({ ...local, databasePath: ':memory:' });
  try {
    const first = await auth.createLabUser({ username: 'recover-customer', displayName: 'Synthetic recovery customer', role: 'customer' });
    const old = await auth.loginLab({ username: first.username, password: first.password }, 'recovery');
    auth.updateLabUserAccess(first.subject, { disabled: true });
    await assert.rejects(auth.reissueLabUser(first.username, 'admin'), (error: unknown) => error instanceof AuthError && error.code === 'LAB_ROLE_REVIEW_REQUIRED');
    await assert.rejects(auth.reissueLabUser(first.username, 'customer', () => { throw new Error('Synthetic protected-file failure'); }));
    assert.equal(auth.store.userById(first.subject)!.disabled, 1, 'file persistence failure must not enable the identity');
    const next = await auth.reissueLabUser(first.username, 'customer');
    assert.equal(next.subject, first.subject); assert.equal(next.role, first.role); assert.notEqual(next.password, first.password);
    assert.equal(await auth.authenticate({ authorization: 'Bearer ' + old.token }), null);
    await assert.rejects(auth.loginLab({ username: first.username, password: first.password }, 'recovery'));
    assert.equal((await auth.loginLab({ username: next.username, password: next.password }, 'recovery')).session.subject, first.subject);
  } finally { auth.close(); }
});

test('operator reissue CLI enables only the named lab user with a new private password and staff authenticator', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onesa-reissue-test-')), databasePath = join(directory, 'lab.sqlite'), output = join(directory, 'reissued.json');
  let auth: AuthService | undefined;
  try {
    auth = new AuthService({ ...local, databasePath });
    const staff = await auth.createLabUser({ username: 'recover-operations', displayName: 'Synthetic recovery operations', role: 'operations' });
    const other = await auth.createLabUser({ username: 'remain-disabled', displayName: 'Synthetic disabled account', role: 'customer' });
    auth.updateLabUserAccess(staff.subject, { disabled: true }); auth.updateLabUserAccess(other.subject, { disabled: true });
    auth.close(); auth = undefined;
    const args = ['src/auth/reissue-lab.ts', '--database', databasePath, '--username', staff.username, '--expected-role', 'operations', '--output', output];
    const env = { ...process.env, APP_MODE: 'lab', AUTH_MODE: 'lab', DEPLOYMENT_MODE: 'lab', PUBLIC_ORIGIN: local.publicOrigin };
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', env, timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    const reissued = (JSON.parse(readFileSync(output, 'utf8')) as { accounts: LabCredentials[] }).accounts[0]!;
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(reissued.subject, staff.subject); assert.equal(reissued.role, 'operations'); assert.notEqual(reissued.totpSecret, staff.totpSecret);
    assert.equal((result.stdout + result.stderr).includes(reissued.password), false); assert.equal((result.stdout + result.stderr).includes(reissued.totpSecret!), false);
    auth = new AuthService({ ...local, databasePath });
    assert.equal(auth.store.userById(other.subject)!.disabled, 1);
    const session = await auth.loginLab({ username: staff.username, password: reissued.password, totp: totpAt(reissued.totpSecret!, Math.floor(Date.now() / 1000)), surface: 'staff' }, 'reissued-staff');
    assert.equal(session.session.subject, staff.subject); assert.equal(session.session.mfa, true);
    const bytes = readFileSync(output), repeat = spawnSync(process.execPath, args, { encoding: 'utf8', env, timeout: 15000 });
    assert.notEqual(repeat.status, 0); assert.deepEqual(readFileSync(output), bytes);
    const production = spawnSync(process.execPath, [...args.slice(0, -1), join(directory, 'production-refused.json')], { encoding: 'utf8', env: { ...env, APP_MODE: 'production' }, timeout: 15000 });
    assert.notEqual(production.status, 0); assert.match(production.stderr, /disabled in production/);
  } finally { auth?.close(); rmSync(directory, { recursive: true, force: true }); }
});
