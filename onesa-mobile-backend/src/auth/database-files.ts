import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Harden files before opening SQLite without disturbing an existing connection.
 * POSIX releases a process's SQLite advisory locks when ANY descriptor for that
 * inode closes. A second store must therefore not open/close that file in the
 * API process, even just to fchmod it. Keep the no-follow checks in a separate
 * startup-only process whose descriptors cannot release the parent's locks. */
export function prepareDatabaseFiles(path: string): void {
  if (!path || Buffer.byteLength(path) > 4096 || path.includes("\0"))
    throw new Error("Invalid database preparation path.");
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./database-files-worker.ts", import.meta.url)), path,
  ], {
    env: {}, // No application credentials or NODE_OPTIONS are needed by this helper.
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000, maxBuffer: 16_384,
  });
  if (result.error || result.signal)
    throw new Error("Database file preparation could not complete.");
  let reply: { ok?: unknown; error?: unknown };
  try { reply = JSON.parse(result.stdout); }
  catch { throw new Error("Database file preparation returned an invalid result."); }
  if (result.status !== 0 || reply.ok !== true)
    throw new Error(typeof reply.error === "string" ? reply.error : "Database file preparation failed.");
}
