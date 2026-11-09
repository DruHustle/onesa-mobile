// This program only mutates an explicitly named, disposable CI Compose project.
// It never prints or uploads the generated passwords, TOTP seeds, sessions or database.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const project = process.env.MOBILE_CI_PROJECT;
if (!project || !/^onesa-mobile-ci-[a-z0-9_-]+$/.test(project)) throw new Error('Set MOBILE_CI_PROJECT to a disposable onesa-mobile-ci-* project.');
const base = new URL(process.env.MOBILE_LAB_ORIGIN ?? 'http://localhost:8080');
if (base.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(base.hostname) || base.username || base.password || base.pathname !== '/') throw new Error('Container smoke tests require the isolated loopback lab origin.');
const composeFile = fileURLToPath(new URL('../infra/runtime/compose.lab.yaml', import.meta.url));
const compose = ['compose', '-p', project, '-f', composeFile];
function dockerRaw(args, label) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 512_000 });
  if (result.error || result.status !== 0) throw new Error(`Container step failed: ${label}. Inspect sanitized container startup logs.`);
  return result.stdout;
}
function docker(args, label) { return dockerRaw([...compose, ...args], label); }
async function request(path, { token, body, key, method = 'GET' } = {}) {
  return fetch(new URL('/api' + path, base), {
    method, signal: AbortSignal.timeout(5000),
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret) {
    const value = alphabet.indexOf(character);
    assert.ok(value >= 0, 'generated TOTP secret is base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[19] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
async function login(account, surface) {
  const response = await request('/v1/session/login', { method: 'POST', body: { username: account.username, password: account.password, ...(account.totpSecret ? { totp: totp(account.totpSecret) } : {}), surface, transport: 'bearer' } });
  assert.equal(response.status, 200, 'generated lab identity signs in');
  const session = await response.json();
  assert.equal(session.authenticated, true);
  return session.token;
}
async function ready() {
  let lastResult = 'not attempted';
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await request('/healthz');
      if (response.ok) return;
      lastResult = `HTTP ${response.status}`;
      await response.body?.cancel();
    } catch (error) {
      // Public health diagnostics only: no response body, credentials or URLs.
      const code = error?.cause?.code ?? error?.code ?? error?.name;
      lastResult = typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code) ? code : 'connection failure';
    }
    await delay(300);
  }
  throw new Error(`The API did not recover behind the web gateway (${lastResult}).`);
}

const apiId = docker(['ps', '-q', 'api'], 'locate the isolated API').trim();
const webId = docker(['ps', '-q', 'web'], 'locate the web gateway').trim();
const apiNetworks = JSON.parse(dockerRaw(['inspect', '--format', '{{json .NetworkSettings.Networks}}', apiId], 'check API network isolation'));
assert.deepEqual(Object.keys(apiNetworks), [`${project}_private`], 'the API has no gateway/ingress network');
assert.equal(dockerRaw(['network', 'inspect', '--format', '{{.Internal}}', `${project}_private`], 'check private network mode').trim(), 'true');
const published = JSON.parse(dockerRaw(['inspect', '--format', '{{json .NetworkSettings.Ports}}', webId], 'check gateway publication'));
assert.ok(published['8080/tcp']?.some(binding => binding.HostIp === '127.0.0.1' && binding.HostPort === (base.port || '80')), 'the gateway port is actually published on IPv4 loopback');
assert.ok(Object.values(published).flat().filter(Boolean).every(binding => binding.HostIp === '127.0.0.1'), 'no gateway port is published to the public host interfaces');
await ready();
const status = await (await request('/v1/status')).json();
assert.equal(status.mode, 'lab');
assert.equal(status.networkConnected, false);
assert.equal(status.commercialSalesEnabled, false);
for (const path of ['/', '/internal/', '/account/']) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, `${path} serves the application shell`);
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}
assert.equal((await request('/v1/ops/snapshot')).status, 401, 'staff data is not exposed anonymously');
assert.equal((await fetch(new URL('/assets/not-a-real-asset.js', base))).status, 404, 'missing static assets do not become the SPA shell');
docker(['exec','-T','api','node','src/auth/bootstrap.ts','--output','/app/var/ci-credentials.json'], 'bootstrap synthetic identities');
const credentials = JSON.parse(docker(['exec','-T','api','node','-e', "process.stdout.write(require('node:fs').readFileSync('/app/var/ci-credentials.json','utf8'))"], 'read synthetic credentials without logging'));
const admin = await login(credentials.accounts.find(account => account.role === 'admin'), 'staff');
const customer = await login(credentials.accounts.find(account => account.role === 'customer'), 'customer');
assert.equal((await request('/v1/ops/snapshot', { token: customer })).status, 403, 'customer cannot read staff records');
const siteInput = { name: 'Synthetic container restart bench', area: 'Synthetic CI', purpose: 'device_bench' };
const idempotencyKey = randomBytes(16).toString('hex');
const created = await request('/v1/ops/sites', { token: admin, method: 'POST', key: idempotencyKey, body: siteInput });
assert.equal(created.status, 201);
const site = await created.json();
const application = await request('/v1/applications', { token: customer, method: 'POST', key: randomBytes(16).toString('hex'), body: { displayName: 'Synthetic CI customer', area: 'Synthetic CI', planId: 'everyday', simFormat: 'physical', deviceModel: 'Synthetic bench phone', consentToPilot: true } });
assert.equal(application.status, 201);
docker(['restart', 'api'], 'restart the API with its persistent volume');
await ready();
const snapshot = await (await request('/v1/ops/snapshot', { token: admin })).json();
assert.ok(snapshot.sites.some(item => item.id === site.id), 'the site survives an API process restart');
assert.equal(snapshot.auditIntegrity, true, 'audit history survives restart');
const replayed = await request('/v1/ops/sites', { token: admin, method: 'POST', key: idempotencyKey, body: siteInput });
assert.equal(replayed.status, 201);
assert.equal((await replayed.json()).id, site.id, 'idempotency survives restart');
assert.equal((await (await request('/v1/me', { token: customer })).json()).applications.length, 1, 'customer ownership and session survive restart');
assert.equal((await request('/v1/activations', { token: admin, method: 'POST' })).status, 503, 'commercial activation remains unavailable');
const missing = await request('/v1/unknown', { token: admin });
assert.equal(missing.status, 404);
assert.match(missing.headers.get('content-type'), /application\/json/, 'unknown API paths do not return the SPA shell');
const recovery = ['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true',
  '--env','MOBILE_RECOVERY_MODE=lab',
  '--mount',`type=volume,src=${project}_mobile-data,dst=/data`,'onesa-mobile-recovery:ci'];
// These temporary key/archive paths exist only in this disposable CI volume.
// Operator backups require separately retained keys and archives, as documented.
dockerRaw([...recovery,'backup.mjs','--generate-key','/data/ci-recovery/keys/backup.key'], 'generate disposable recovery key');
dockerRaw([...recovery,'backup.mjs','--mode','lab','--database','/data/onesa-mobile.sqlite','--output','/data/ci-recovery/backups/pilot.omb','--key-file','/data/ci-recovery/keys/backup.key'], 'encrypt live WAL-backed container database');
dockerRaw([...recovery,'restore.mjs','--mode','lab','--input','/data/ci-recovery/backups/pilot.omb','--database','/data/ci-recovery/restored/onesa-mobile.sqlite','--key-file','/data/ci-recovery/keys/backup.key'], 'restore into a new, unused database');
const restored = JSON.parse(docker(['exec','-T','api','node','-e',
  "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('/app/var/ci-recovery/restored/onesa-mobile.sqlite',{readOnly:true}); process.stdout.write(JSON.stringify({sites:db.prepare(\"SELECT count(*) AS n FROM platform_records WHERE kind='sites'\").get().n,sessions:db.prepare('SELECT count(*) AS n FROM mobile_auth_sessions').get().n,enabledUsers:db.prepare('SELECT count(*) AS n FROM mobile_auth_users WHERE disabled=0').get().n})); db.close();"], 'verify restored container records and session invalidation'));
assert.equal(restored.sites, 1);
assert.equal(restored.sessions, 0);
assert.equal(restored.enabledUsers, 0, 'restored historical lab credentials cannot restore authority');
docker(['exec','-T','api','node','-e', "require('node:fs').unlinkSync('/app/var/ci-credentials.json')"], 'remove temporary synthetic credentials');
console.log('Container qualification passed: protected surfaces, same-origin API, persistent records/sessions/idempotency/audit, encrypted recovery, and disabled commercial activation.');
