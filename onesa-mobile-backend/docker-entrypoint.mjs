import { lstatSync, readFileSync } from 'node:fs';

// Docker secrets are read once and never printed. No generic environment-file evaluator.
for (const name of ['AUTH_ENCRYPTION_KEY', 'ONESA_CLIENT_SECRET']) {
  const path = process.env[name + '_FILE'];
  if (!path) continue;
  if (process.env[name]) throw new Error(`Set ${name} or ${name}_FILE, not both.`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 4096) throw new Error(`${name}_FILE must be a small regular file.`);
  const value = readFileSync(path, 'utf8').trim();
  if (!value) throw new Error(`${name}_FILE is empty.`);
  process.env[name] = value;
  delete process.env[name + '_FILE'];
}

await import('./src/server.ts');
