import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/platform/store.ts";
import { AuthService } from "../src/auth/service.ts";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "onesa-storage-security-"));
  return { directory, path: join(directory, "synthetic.sqlite"),
    cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
const permissions = (path: string) => statSync(path).mode & 0o777;

test("new database, WAL and SHM are private before authentication on a traversable existing directory", () => {
  const f = fixture(), previousMask = process.umask(0o022);
  let store: Store | undefined, auth: AuthService | undefined;
  try {
    chmodSync(f.directory, 0o755);
    store = new Store(f.path);
    for (const suffix of ["", "-wal", "-shm"]) {
      assert.equal(existsSync(f.path + suffix), true);
      assert.equal(permissions(f.path + suffix), 0o600, suffix || "database");
    }
    auth = new AuthService({ mode: "lab", databasePath: f.path,
      publicOrigin: "http://localhost:5173", allowedOrigins: ["http://localhost:5173"] });
    for (const suffix of ["", "-wal", "-shm", ".authkey"])
      assert.equal(permissions(f.path + suffix), 0o600, suffix || "database");
    assert.equal(permissions(f.directory), 0o755, "do not change an existing directory's permissions");
  } finally { auth?.close(); store?.close(); process.umask(previousMask); f.cleanup(); }
});

test("existing database sidecars are hardened without losing committed records", () => {
  const f = fixture();
  let first: Store | undefined, second: Store | undefined;
  try {
    first = new Store(f.path);
    const record = first.insert("sites", "synthetic-owner", { name: "Synthetic bench" });
    for (const suffix of ["", "-wal", "-shm"]) chmodSync(f.path + suffix, 0o644);
    second = new Store(f.path);
    for (const suffix of ["", "-wal", "-shm"])
      assert.equal(permissions(f.path + suffix), 0o600, suffix || "database");
    assert.equal(second.get("sites", record.id).name, "Synthetic bench");
  } finally { second?.close(); first?.close(); f.cleanup(); }
});

test("standalone authentication also hardens legacy sidecars before opening SQLite", () => {
  const f = fixture();
  let store: Store | undefined, auth: AuthService | undefined;
  try {
    store = new Store(f.path);
    for (const suffix of ["", "-wal", "-shm"]) chmodSync(f.path + suffix, 0o644);
    auth = new AuthService({ mode: "lab", databasePath: f.path,
      publicOrigin: "http://localhost:5173", allowedOrigins: ["http://localhost:5173"] });
    for (const suffix of ["", "-wal", "-shm"]) assert.equal(permissions(f.path + suffix), 0o600);
  } finally { auth?.close(); store?.close(); f.cleanup(); }
});

test("database symbolic and hard links are refused before touching the linked file", () => {
  for (const type of ["symbolic", "hard"] as const) {
    const f = fixture(), target = join(f.directory, "unrelated-file");
    try {
      writeFileSync(target, "synthetic unrelated file", { mode: 0o644 });
      if (type === "symbolic") symlinkSync(target, f.path); else linkSync(target, f.path);
      const before = readFileSync(target);
      assert.throws(() => new Store(f.path), /without symbolic or hard links/);
      assert.deepEqual(readFileSync(target), before);
      assert.equal(permissions(target), 0o644);
      assert.equal(existsSync(f.path + "-wal"), false);
    } finally { f.cleanup(); }
  }
});

test("linked WAL, SHM and rollback journals are refused before database writes or permission changes", () => {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    for (const type of ["symbolic", "hard"] as const) {
      const f = fixture(), target = join(f.directory, "unrelated-file");
      try {
        const store = new Store(f.path); store.close();
        chmodSync(f.path, 0o644);
        writeFileSync(target, "synthetic unrelated file", { mode: 0o644 });
        if (type === "symbolic") symlinkSync(target, f.path + suffix); else linkSync(target, f.path + suffix);
        const before = readFileSync(f.path);
        assert.throws(() => new Store(f.path), /without symbolic or hard links/);
        assert.deepEqual(readFileSync(f.path), before);
        assert.equal(permissions(f.path), 0o644);
        assert.equal(readFileSync(target, "utf8"), "synthetic unrelated file");
        assert.equal(permissions(target), 0o644);
      } finally { f.cleanup(); }
    }
  }
});

test("non-file sidecars and a directory writable by other users are refused", () => {
  const f = fixture();
  try {
    mkdirSync(f.path + "-wal");
    assert.throws(() => new Store(f.path), /regular files/);
    assert.equal(existsSync(f.path), false);
    rmSync(f.path + "-wal", { recursive: true });
    chmodSync(f.directory, 0o777);
    assert.throws(() => new Store(f.path), /other users cannot write/);
    assert.equal(existsSync(f.path), false);
  } finally { f.cleanup(); }
});
