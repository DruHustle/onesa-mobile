import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArguments, RecoveryError } from './backup-lib.mjs';

/** The maintenance container must not silently switch between lab and production.
 * Help and independent key creation do not touch a source database. */
export function validateRecoveryInvocation(argv, environment = process.env) {
  const [command, ...args] = argv;
  if (!['backup.mjs', 'restore.mjs'].includes(command)) {
    throw new RecoveryError('Use backup.mjs or restore.mjs in this maintenance image.');
  }
  if (args.length === 1 && args[0] === '--help') return { command, args };
  if (command === 'backup.mjs' && args.length === 2 && args[0] === '--generate-key' && args[1] && !args[1].startsWith('--')) return { command, args };
  const selected = environment.MOBILE_RECOVERY_MODE;
  if (!['lab', 'production'].includes(selected)) throw new RecoveryError('Set MOBILE_RECOVERY_MODE explicitly to lab or production before accessing a database.');
  const options = parseArguments(args, command === 'backup.mjs'
    ? ['--mode', '--database', '--output', '--key-file']
    : ['--mode', '--input', '--database', '--key-file']);
  if (options['--mode'] !== selected) throw new RecoveryError('The command mode does not match the explicitly selected recovery environment.');
  return { command, args };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { command, args } = validateRecoveryInvocation(process.argv.slice(2));
    process.argv = [process.execPath, fileURLToPath(new URL(command, import.meta.url)), ...args];
    await import(new URL(command, import.meta.url).href);
  } catch (error) {
    console.error(error instanceof RecoveryError ? error.message : 'The recovery invocation was refused.');
    process.exitCode = 1;
  }
}
