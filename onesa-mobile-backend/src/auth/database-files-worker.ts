import {
  mkdirSync, constants as fsConstants, lstatSync, openSync,
  closeSync, fstatSync, fchmodSync,
} from "node:fs";
import { dirname } from "node:path";

/** SQLite inherits the main file's permissions when it creates WAL/SHM files.
 * Validate every existing companion before creating or changing anything, and
 * make all files private before SQLite can read a journal or write a page. */
function prepareDatabaseFiles(path: string): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const parent = lstatSync(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022) !== 0)
    throw new Error("The database directory must be a real directory that other users cannot write.");
  const paths = [path, path + "-wal", path + "-shm", path + "-journal"];
  for (const candidate of paths) {
    let info;
    try { info = lstatSync(candidate); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new Error("The database and its sidecars must be regular files without symbolic or hard links.");
  }
  const handles: number[] = [];
  try {
    for (const candidate of paths) {
      let fd: number;
      try {
        fd = openSync(candidate,
          fsConstants.O_RDWR | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK |
          (candidate === path ? fsConstants.O_CREAT : 0), 0o600);
      } catch (error) {
        if (candidate !== path && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      handles.push(fd);
      const info = fstatSync(fd);
      if (!info.isFile() || info.nlink !== 1)
        throw new Error("The database and its sidecars must be regular files without symbolic or hard links.");
    }
    for (const fd of handles) fchmodSync(fd, 0o600);
  } finally {
    for (const fd of handles) closeSync(fd);
  }
}

// Run only in the dedicated startup helper process, never in a SQLite owner.
try {
  const path = process.argv[2];
  if (process.argv.length !== 3 || !path || Buffer.byteLength(path) > 4096 || path.includes("\0"))
    throw new Error("Invalid database preparation path.");
  prepareDatabaseFiles(path);
  process.stdout.write(JSON.stringify({ ok: true }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Database preparation failed." }));
  process.exitCode = 1;
}
