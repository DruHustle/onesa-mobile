import { createBackup, createRecoveryKey, parseArguments } from './backup-lib.mjs';

const usage = `Onesa Mobile encrypted recovery (Node.js 24.22.1)

Generate a protected recovery key (never printed):
  node scripts/backup.mjs --generate-key ./private/backup.key

Create an online SQLite backup:
  node scripts/backup.mjs --mode lab --database ./var/onesa-mobile.sqlite --output ./backups/pilot.omb --key-file ./private/backup.key

Options are mandatory. The output directory must be owner-only (0700).
Existing files are never overwritten. Store the recovery key separately from backups.
Production backups exclude AUTH_ENCRYPTION_KEY; keep that key in the approved secret manager.
`;

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log(usage);
  else if (args.length === 2 && args[0] === '--generate-key') {
    await createRecoveryKey(args[1]);
    console.log('Recovery key created in the requested protected file.');
  } else {
    const options = parseArguments(args, ['--mode', '--database', '--output', '--key-file']);
    const result = await createBackup({ mode: options['--mode'], databasePath: options['--database'], outputPath: options['--output'], keyPath: options['--key-file'] });
    console.log(JSON.stringify({ status: 'encrypted-backup-created', ...result }));
  }
} catch (error) {
  console.error(`Backup failed: ${error.code === 'ENOENT' ? 'A required file or directory was not found.' : error.message}`);
  process.exitCode = 1;
}
