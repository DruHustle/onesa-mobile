import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants, createReadStream, createWriteStream, closeSync, fstatSync, openSync, readFileSync } from 'node:fs';
import { chmod, link, lstat, mkdir, mkdtemp, open, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync, backup } from 'node:sqlite';

const FORMAT = 'onesa-mobile-encrypted-backup';
const VERSION = 1;
const MAX_HEADER_BYTES = 1024;
const MAX_METADATA_BYTES = 4096;
const MAX_DATABASE_BYTES = 16 * 1024 ** 3;
const TAG_BYTES = 16;
const TABLES = [
  'platform_schema', 'platform_records', 'platform_audit', 'platform_idempotency',
  'mobile_auth_users', 'mobile_auth_sessions', 'mobile_auth_flows',
  'mobile_auth_handoffs', 'mobile_auth_limits', 'mobile_auth_events',
];

export class RecoveryError extends Error {}

function checkMode(mode) {
  if (mode !== 'lab' && mode !== 'production') throw new RecoveryError('Specify --mode lab or --mode production.');
}

async function regularFile(path, label, maxBytes = MAX_DATABASE_BYTES) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) {
    throw new RecoveryError(`${label} must be a regular, bounded file, not a symbolic link.`);
  }
  return info;
}

/** Secrets never appear in command arguments or console output. */
export function readKeyFile(path) {
  const fd = openSync(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 256 || (info.mode & 0o077) !== 0) {
      throw new RecoveryError('Key files must be regular files with owner-only permissions (chmod 600).');
    }
    const value = readFileSync(fd, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new RecoveryError('Key files must contain exactly 64 hexadecimal characters.');
    return Buffer.from(value, 'hex');
  } finally { closeSync(fd); }
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new RecoveryError('The destination directory must not be a symbolic link.');
  if ((info.mode & 0o077) !== 0) throw new RecoveryError('The destination directory must have owner-only permissions (chmod 700).');
}

async function mustNotExist(path) {
  try { await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new RecoveryError('The destination already exists. Restore to a new, empty destination.');
}

async function digestFile(path) {
  const hash = createHash('sha256');
  for await (const data of createReadStream(path)) hash.update(data);
  return hash.digest('hex');
}

function validateDatabase(path, mode) {
  const db = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') {
      throw new RecoveryError('Database integrity verification failed.');
    }
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (TABLES.some(table => !tables.has(table))) throw new RecoveryError('The database does not contain the complete Mobile platform and authentication schema.');
    const versions = db.prepare('SELECT version FROM platform_schema ORDER BY version').all();
    if (versions.length !== 1 || versions[0].version !== 1) throw new RecoveryError('This recovery tool supports Mobile platform schema version 1 only.');
    const invalidJson = db.prepare('SELECT count(*) AS n FROM platform_records WHERE json_valid(payload)=0').get();
    if (invalidJson.n !== 0) throw new RecoveryError('A platform record is not valid JSON.');
    let previousHash = 'GENESIS';
    for (const row of db.prepare('SELECT id,actor,role,action,target,at,previous_hash AS previousHash,hash FROM platform_audit ORDER BY sequence').iterate()) {
      const { hash, ...item } = row;
      const expected = createHash('sha256').update(JSON.stringify(item)).digest('hex');
      if (item.previousHash !== previousHash || expected !== hash) throw new RecoveryError('The platform audit chain did not verify.');
      previousHash = String(hash);
    }
    if (mode === 'production') {
      if (db.prepare('SELECT count(*) AS n FROM mobile_auth_users').get().n !== 0 ||
          db.prepare("SELECT count(*) AS n FROM mobile_auth_sessions WHERE source='lab'").get().n !== 0) {
        throw new RecoveryError('Production recovery refuses a database containing lab identities or lab sessions.');
      }
    }
  } finally { db.close(); }
}

async function syncFile(path) {
  const fd = await open(path, 'r');
  try { await fd.sync(); } finally { await fd.close(); }
}

async function syncDirectory(path) {
  const fd = await open(path, 'r');
  try { await fd.sync(); } finally { await fd.close(); }
}

/** SQLite's online-backup API includes committed WAL data without copying a live main file. */
export async function createBackup({ databasePath, outputPath, keyPath, mode }) {
  checkMode(mode);
  const database = resolve(databasePath), output = resolve(outputPath);
  const key = readKeyFile(keyPath);
  await regularFile(database, 'Database');
  await privateDirectory(dirname(output));
  await mustNotExist(output);
  const temporary = await mkdtemp(resolve(dirname(output), '.onesa-backup-'));
  await chmod(temporary, 0o700);
  const snapshot = resolve(temporary, 'snapshot.sqlite');
  let outputCreated = false;
  try {
    let labAuthKey;
    if (mode === 'lab') labAuthKey = readKeyFile(database + '.authkey').toString('hex');
    else {
      try { await lstat(database + '.authkey'); throw new RecoveryError('Production backups refuse a lab authentication key sidecar.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    // The directory is private before SQLite creates the temporary snapshot.
    const source = new DatabaseSync(database, { readOnly: true, timeout: 5000 });
    try { await backup(source, snapshot); } finally { source.close(); }
    await chmod(snapshot, 0o600);
    validateDatabase(snapshot, mode);
    const databaseBytes = (await regularFile(snapshot, 'Snapshot')).size;
    const metadata = Buffer.from(JSON.stringify({ databaseBytes, sha256: await digestFile(snapshot), ...(labAuthKey ? { labAuthKey } : {}) }));
    const metadataSize = Buffer.alloc(4);
    metadataSize.writeUInt32BE(metadata.length);
    const iv = randomBytes(12);
    const createdAt = new Date().toISOString();
    const header = Buffer.from(JSON.stringify({ format: FORMAT, version: VERSION, mode, createdAt, iv: iv.toString('base64') }) + '\n');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(header);
    async function* content() {
      yield metadataSize;
      yield metadata;
      for await (const chunk of createReadStream(snapshot)) yield chunk;
    }
    const outputFile = await open(output, 'wx', 0o600);
    outputCreated = true;
    try { await outputFile.writeFile(header); } finally { await outputFile.close(); }
    await pipeline(Readable.from(content()), cipher, createWriteStream(output, { flags: 'a' }));
    const footer = await open(output, 'a');
    try { await footer.writeFile(cipher.getAuthTag()); await footer.sync(); } finally { await footer.close(); }
    await syncDirectory(dirname(output));
    return { format: FORMAT, mode, createdAt, bytes: (await stat(output)).size };
  } catch (error) {
    if (outputCreated) await rm(output, { force: true });
    throw error;
  } finally {
    key.fill(0);
    await rm(temporary, { recursive: true, force: true });
  }
}

async function readHeader(path) {
  const info = await regularFile(path, 'Encrypted archive', MAX_DATABASE_BYTES + MAX_HEADER_BYTES + MAX_METADATA_BYTES + 20);
  if (info.size < TAG_BYTES + 64) throw new RecoveryError('The encrypted archive is incomplete.');
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const prefix = Buffer.alloc(Math.min(MAX_HEADER_BYTES, info.size));
    const { bytesRead } = await fd.read(prefix, 0, prefix.length, 0);
    const newline = prefix.subarray(0, bytesRead).indexOf(10);
    if (newline < 0) throw new RecoveryError('The encrypted archive header is invalid.');
    const aad = prefix.subarray(0, newline + 1);
    let header;
    try { header = JSON.parse(prefix.subarray(0, newline).toString('utf8')); }
    catch { throw new RecoveryError('The encrypted archive header is invalid.'); }
    if (header.format !== FORMAT || header.version !== VERSION || !['lab', 'production'].includes(header.mode) ||
        !/^\d{4}-\d{2}-\d{2}T/.test(header.createdAt) || typeof header.iv !== 'string' ||
        !/^[A-Za-z0-9+/]{16}$/.test(header.iv) || Buffer.from(header.iv, 'base64').length !== 12 ||
        Object.keys(header).sort().join(',') !== 'createdAt,format,iv,mode,version') {
      throw new RecoveryError('The encrypted archive format is unsupported.');
    }
    const tag = Buffer.alloc(TAG_BYTES);
    await fd.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES);
    return { header, aad, tag, bytes: info.size };
  } finally { await fd.close(); }
}

/** Restore into a new path only. All bearer sessions and in-progress logins are invalidated. */
export async function restoreBackup({ inputPath, databasePath, keyPath, mode, now = Date.now() }) {
  checkMode(mode);
  const input = resolve(inputPath), database = resolve(databasePath);
  const key = readKeyFile(keyPath);
  await privateDirectory(dirname(database));
  for (const suffix of ['', '-wal', '-shm', '.authkey']) await mustNotExist(database + suffix);
  const { header, aad, tag, bytes } = await readHeader(input);
  if (header.mode !== mode) { key.fill(0); throw new RecoveryError('The archive mode does not match the requested restore mode. Lab data cannot be promoted to production.'); }
  const temporary = await mkdtemp(resolve(dirname(database), '.onesa-restore-'));
  await chmod(temporary, 0o700);
  const payload = resolve(temporary, 'authenticated-payload');
  const snapshot = resolve(temporary, 'restored.sqlite');
  const installed = [];
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'));
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    try {
      await pipeline(createReadStream(input, { start: aad.length, end: bytes - TAG_BYTES - 1 }), decipher, createWriteStream(payload, { flags: 'wx', mode: 0o600 }));
    } catch { throw new RecoveryError('Archive authentication failed. The key is incorrect or the archive is damaged.'); }
    // No SQLite parser or data mutation sees the payload until GCM authentication succeeds.
    const fd = await open(payload, 'r');
    let metadata, offset;
    try {
      const size = Buffer.alloc(4);
      if ((await fd.read(size, 0, 4, 0)).bytesRead !== 4) throw new RecoveryError('The archive metadata is incomplete.');
      const length = size.readUInt32BE();
      if (length < 80 || length > MAX_METADATA_BYTES) throw new RecoveryError('The archive metadata size is invalid.');
      const encoded = Buffer.alloc(length);
      if ((await fd.read(encoded, 0, length, 4)).bytesRead !== length) throw new RecoveryError('The archive metadata is incomplete.');
      try { metadata = JSON.parse(encoded.toString('utf8')); } catch { throw new RecoveryError('The archive metadata is invalid.'); }
      offset = length + 4;
      const expectedFields = mode === 'lab' ? 'databaseBytes,labAuthKey,sha256' : 'databaseBytes,sha256';
      if (!Number.isSafeInteger(metadata.databaseBytes) || metadata.databaseBytes < 512 || metadata.databaseBytes > MAX_DATABASE_BYTES ||
          typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256) ||
          Object.keys(metadata).sort().join(',') !== expectedFields ||
          (mode === 'lab' && (typeof metadata.labAuthKey !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.labAuthKey))) ||
          (await fd.stat()).size !== offset + metadata.databaseBytes) {
        throw new RecoveryError('The archive metadata does not match the database payload.');
      }
    } finally { await fd.close(); }
    await pipeline(createReadStream(payload, { start: offset }), createWriteStream(snapshot, { flags: 'wx', mode: 0o600 }));
    const actualHash = Buffer.from(await digestFile(snapshot), 'hex');
    if (!timingSafeEqual(actualHash, Buffer.from(metadata.sha256, 'hex'))) throw new RecoveryError('The database checksum did not verify.');
    validateDatabase(snapshot, mode);
    const db = new DatabaseSync(snapshot, { timeout: 5000 });
    let invalidatedSessions, disabledLabUsers = 0;
    try {
      db.exec('BEGIN IMMEDIATE');
      invalidatedSessions = Number(db.prepare('SELECT count(*) AS n FROM mobile_auth_sessions').get().n);
      db.exec('DELETE FROM mobile_auth_sessions; DELETE FROM mobile_auth_flows; DELETE FROM mobile_auth_handoffs;');
      // Cover the authenticator's accepted +1 skew window as well as the current step.
      // Staff may need to wait up to 60 seconds before a new code is accepted after restore.
      db.prepare('UPDATE mobile_auth_users SET last_totp_counter=max(last_totp_counter,?) WHERE totp_secret IS NOT NULL').run(Math.floor(now / 30_000) + 1);
      // A snapshot cannot know about later password rotations, revocations or role downgrades.
      // Require operator reconciliation and per-user credential reissue before lab access returns.
      if (mode === 'lab') disabledLabUsers = Number(db.prepare('UPDATE mobile_auth_users SET disabled=1,revision=revision+1').run().changes);
      db.prepare('INSERT INTO mobile_auth_events(at,subject,action,outcome) VALUES(?,NULL,?,?)').run(Math.floor(now / 1000), 'recovery.restore', mode === 'lab' ? 'sessions-invalidated-lab-users-disabled' : 'sessions-invalidated');
      db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
    } finally { db.close(); }
    validateDatabase(snapshot, mode);
    await syncFile(snapshot);
    // The staged file is on the same filesystem. Link atomically without replacing a target.
    // A cutover must keep the app stopped until both this file and its lab key are installed.
    await link(snapshot, database);
    installed.push(database);
    await chmod(database, 0o600);
    await syncFile(database);
    if (mode === 'lab') {
      const stagedKey = resolve(temporary, 'restored.authkey');
      await writeFile(stagedKey, metadata.labAuthKey + '\n', { flag: 'wx', mode: 0o600 });
      await syncFile(stagedKey);
      await link(stagedKey, database + '.authkey');
      installed.push(database + '.authkey');
      await syncFile(database + '.authkey');
    }
    await syncDirectory(dirname(database));
    return { mode, backupCreatedAt: header.createdAt, restoredAt: new Date(now).toISOString(), invalidatedSessions, disabledLabUsers };
  } catch (error) {
    for (const path of installed) await unlink(path).catch(() => {});
    throw error;
  } finally {
    key.fill(0);
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function createRecoveryKey(outputPath) {
  const path = resolve(outputPath);
  await privateDirectory(dirname(path));
  await writeFile(path, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  await syncFile(path);
  await syncDirectory(dirname(path));
}

export function parseArguments(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (!allowed.includes(name) || !args[i + 1] || args[i + 1].startsWith('--') || result[name] !== undefined) {
      throw new RecoveryError('Invalid or repeated option. Use --help for usage.');
    }
    result[name] = args[i + 1];
  }
  for (const name of allowed) if (!result[name]) throw new RecoveryError(`Missing ${name}. Use --help for usage.`);
  return result;
}
