import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AuthService } from './service.ts';
import { isRole } from './types.ts';

const { values } = parseArgs({ options: {
  database: { type: 'string', default: process.env.DATABASE_PATH ?? './var/onesa-mobile.sqlite' },
  origin: { type: 'string', default: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173' },
  username: { type: 'string' }, 'expected-role': { type: 'string' }, output: { type: 'string' },
}, strict: true, allowPositionals: false });
if (process.env.APP_MODE === 'production' || process.env.DEPLOYMENT_MODE === 'production' || process.env.AUTH_MODE === 'production') throw new Error('Lab credential reissue is disabled in production.');
if (!values.username || !isRole(values['expected-role']) || !values.output) throw new Error('Provide --username, --expected-role and a new --output file. Review the restored role against current authorization first.');
const databasePath = resolve(values.database!), output = resolve(values.output);
if (!existsSync(databasePath) || !existsSync(databasePath + '.authkey')) throw new Error('An existing lab database and its recovered authentication-key sidecar are required.');
if (output === databasePath || output === databasePath + '.authkey' || existsSync(output)) throw new Error('Choose a new separate credentials output file; existing files are never overwritten.');
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const auth = new AuthService({ mode: 'lab', databasePath, publicOrigin: values.origin!, allowedOrigins: [values.origin!] });
let destination: number | undefined, outputCreated = false, committed = false;
try {
  destination = openSync(output, 'wx', 0o600); outputCreated = true;
  await auth.reissueLabUser(values.username, values['expected-role'], (credentials) => {
    writeSync(destination!, JSON.stringify({ mode: 'lab', warning: 'Private reissued lab credentials. Store securely. Do not commit or upload.', accounts: [credentials] }, null, 2) + '\n', 0, 'utf8');
    fsyncSync(destination!);
  });
  committed = true;
  console.info('Reissued one explicitly reviewed lab identity. Subject and role were preserved. Private credentials saved to ' + output + '.');
  console.info('Prior passwords, staff authenticator seeds and sessions no longer authorize this account. Enroll the new staff authenticator before signing in.');
} catch (error) {
  console.error(error instanceof Error && /role|changed|not found/i.test(error.message) ? error.message : 'Lab credential reissue failed. No existing credentials file was overwritten.');
  process.exitCode = 1;
} finally {
  if (destination !== undefined) closeSync(destination);
  if (outputCreated && !committed) unlinkSync(output);
  auth.close();
}
