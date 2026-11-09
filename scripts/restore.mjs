import { parseArguments, restoreBackup } from './backup-lib.mjs';

const usage = `Onesa Mobile restore drill / disaster recovery (Node.js 24.22.1)

Stop the API. Restore to a NEW path, then explicitly configure the API to use it:
  node scripts/restore.mjs --mode lab --input ./backups/pilot.omb --database ./restored/onesa-mobile.sqlite --key-file ./private/backup.key

All options are mandatory. The destination directory must be owner-only (0700).
The database, WAL, SHM and auth-key paths must not exist. No file is overwritten.
All restored sessions, login flows and native handoffs are removed.
All restored lab identities are disabled until an operator reissues reviewed credentials.
Lab archives restore their encrypted auth-key sidecar. Production requires the separately retained AUTH_ENCRYPTION_KEY.
An archive from one mode cannot be restored into the other mode.
`;

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log(usage);
  else {
    const options = parseArguments(args, ['--mode', '--input', '--database', '--key-file']);
    const result = await restoreBackup({ mode: options['--mode'], inputPath: options['--input'], databasePath: options['--database'], keyPath: options['--key-file'] });
    console.log(JSON.stringify({ status: result.mode === 'lab' ? 'restore-complete-lab-reissue-required' : 'restore-complete-login-required', ...result }));
  }
} catch (error) {
  console.error(`Restore failed: ${error.code === 'ENOENT' ? 'A required file or directory was not found.' : error.message}`);
  process.exitCode = 1;
}
