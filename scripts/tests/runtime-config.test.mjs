import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateRecoveryInvocation } from '../recovery-entrypoint.mjs';

const backup = ['backup.mjs', '--mode', 'lab', '--database', '/data/mobile.sqlite', '--output', '/backups/test.omb', '--key-file', '/run/recovery.key'];
test('maintenance commands require an explicit matching environment before accessing database paths', () => {
  assert.throws(() => validateRecoveryInvocation(backup, {}), /Set MOBILE_RECOVERY_MODE/);
  assert.throws(() => validateRecoveryInvocation(backup, {MOBILE_RECOVERY_MODE: 'production'}), /does not match/);
  assert.throws(() => validateRecoveryInvocation([...backup, '--mode', 'production'], {MOBILE_RECOVERY_MODE: 'lab'}), /repeated option/);
  assert.throws(() => validateRecoveryInvocation(['../../other.mjs'], {MOBILE_RECOVERY_MODE: 'lab'}), /Use backup/);
  assert.equal(validateRecoveryInvocation(backup, {MOBILE_RECOVERY_MODE: 'lab'}).command, 'backup.mjs');
  const production = backup.map(value => value === 'lab' ? 'production' : value);
  assert.equal(validateRecoveryInvocation(production, {MOBILE_RECOVERY_MODE: 'production'}).command, 'backup.mjs');
  assert.equal(validateRecoveryInvocation(['backup.mjs', '--help'], {}).command, 'backup.mjs');
  assert.equal(validateRecoveryInvocation(['backup.mjs', '--generate-key', '/backups/key'], {}).command, 'backup.mjs');
});

test('restore cannot use a different selected mode and help does not require database selection', () => {
  const restore = ['restore.mjs', '--mode', 'production', '--input', '/backups/test.omb', '--database', '/data/new/mobile.sqlite', '--key-file', '/run/recovery.key'];
  assert.throws(() => validateRecoveryInvocation(restore, {MOBILE_RECOVERY_MODE: 'lab'}), /does not match/);
  assert.equal(validateRecoveryInvocation(restore, {MOBILE_RECOVERY_MODE: 'production'}).command, 'restore.mjs');
  assert.equal(validateRecoveryInvocation(['restore.mjs', '--help'], {}).command, 'restore.mjs');
});

const compose = spawnSync('docker', ['compose', 'version'], {encoding: 'utf8', timeout: 5000});
test('actual Compose merge binds the explicitly selected existing volume and refuses missing selection', {skip: compose.status !== 0 ? 'Docker Compose is unavailable; hosted runtime CI executes this configuration test.' : false}, () => {
  const root = fileURLToPath(new URL('../../', import.meta.url)), dir = mkdtempSync(join(tmpdir(), 'onesa-recovery-config-'));
  try {
    const keyPath = join(dir, 'synthetic.key');
    writeFileSync(keyPath, '0'.repeat(64), {mode: 0o600});
    function config(mode, selectVolume = true) {
      const env = {...process.env, MOBILE_RECOVERY_MODE: mode, MOBILE_RECOVERY_DIRECTORY: dir, MOBILE_RECOVERY_KEY_FILE: keyPath,
        MOBILE_API_IMAGE: 'sha256:' + 'a'.repeat(64), MOBILE_GATEWAY_IMAGE: 'sha256:' + 'b'.repeat(64),
        MOBILE_PUBLIC_ORIGIN: 'https://mobile.example.test', MOBILE_ONESA_ISSUER: 'https://identity.example.test/api/v1/identity',
        MOBILE_ONESA_CLIENT_ID: 'synthetic-client-reference', MOBILE_ONESA_SECRET_FILE: keyPath, MOBILE_AUTH_KEY_FILE: keyPath};
      delete env.MOBILE_RECOVERY_VOLUME;
      if (selectVolume) env.MOBILE_RECOVERY_VOLUME = 'synthetic-existing-' + mode + '-volume';
      const args = ['compose', '-p', 'onesa-mobile-ci-config', '-f', 'infra/runtime/compose.lab.yaml',
        ...(mode === 'production' ? ['-f', 'infra/runtime/compose.production.yaml'] : []),
        '-f', 'infra/runtime/compose.recovery.yaml', '--profile', 'maintenance', 'config', '--format', 'json'];
      return spawnSync('docker', args, {cwd: root, env, encoding: 'utf8', timeout: 10000});
    }
    for (const mode of ['lab', 'production']) {
      const result = config(mode);
      assert.equal(result.status, 0, 'Compose configuration is valid for ' + mode);
      const value = JSON.parse(result.stdout), source = value.services.recovery.volumes.find(mount => mount.target === '/data').source;
      if (mode === 'production') {
        for (const [service, expectedId] of [['api','a'], ['web','b']]) {
          assert.equal(value.services[service].image, 'sha256:' + expectedId.repeat(64));
          assert.equal(value.services[service].pull_policy, 'never');
          assert.equal(value.services[service].build, undefined);
        }
      }
      assert.equal(value.volumes[source].external, true, 'Compose must not create an empty source volume');
      assert.equal(value.volumes[source].name, 'synthetic-existing-' + mode + '-volume');
      assert.equal(value.services.recovery.environment.MOBILE_RECOVERY_MODE, mode);
      assert.equal(value.services.recovery.network_mode, 'none');
      assert.notEqual(config(mode, false).status, 0, 'No lab-volume default is allowed when selection is missing');
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
