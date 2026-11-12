import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/platform/store.ts";
import { AuthService } from "../src/auth/service.ts";
import { AuthStore } from "../src/auth/store.ts";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "onesa-storage-security-"));
  return { directory, path: join(directory, "synthetic.sqlite"),
    cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
const permissions = (path: string) => statSync(path).mode & 0o777;

test("a production volume cannot be opened in lab mode, including after upgrading a pre-marker central account", () => {
  const f = fixture();
  const base = { databasePath: f.path, publicOrigin: "https://mobile.example.test", allowedOrigins: ["https://mobile.example.test"] };
  const production = { ...base, mode: "production" as const, encryptionKey: "ab".repeat(32) };
  const lab = { ...base, mode: "lab" as const };
  try {
    const existing = new AuthStore(production);
    existing.db.exec("DROP TABLE mobile_auth_environment");
    existing.record("synthetic-central-subject", "session.created", "success");
    existing.close();
    assert.throws(() => new AuthStore(lab), /central account activity/);
    assert.equal(existsSync(f.path + ".authkey"), false);
    const upgraded = new AuthStore(production);
    assert.equal(upgraded.db.prepare("SELECT mode FROM mobile_auth_environment").get()?.mode, "production");
    upgraded.close();
    assert.throws(() => new AuthStore({ ...lab, encryptionKey: production.encryptionKey }), /different deployment mode/);
    assert.throws(() => new AuthStore(lab), /different deployment mode/);
    assert.equal(existsSync(f.path + ".authkey"), false);
    new AuthStore(production).close();
  } finally { f.cleanup(); }
});

test("lab auth refuses the public customer origin and still accepts an isolated HTTPS lab", () => {
  const config = { mode: "lab" as const, databasePath: ":memory:", publicOrigin: "https://lab.example.test", allowedOrigins: ["https://lab.example.test"] };
  assert.throws(() => new AuthService({ ...config, allowedOrigins: [...config.allowedOrigins, "https://mobile.onesa.eu"] }), /public Onesa Mobile/);
  assert.throws(() => new AuthService({ ...config, publicOrigin: "https://mobile.onesa.eu", allowedOrigins: ["https://mobile.onesa.eu"] }), /public Onesa Mobile/);
  new AuthService(config).close();
});

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

for (const order of ["auth-first", "platform-first", "legacy-hardening"] as const) {
  test(`separate readers preserve live WAL locks and durable records after ${order} preparation`, () => {
    const f = fixture();
    const config = { mode: "lab" as const, databasePath: f.path,
      publicOrigin: "http://localhost:5173", allowedOrigins: ["http://localhost:5173"] };
    let auth: AuthStore | undefined, store: Store | undefined;
    const externalRead = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(process.argv[1]);
      const result = {
        auth: db.prepare('SELECT count(*) n FROM mobile_auth_events').get().n,
        records: db.prepare('SELECT count(*) n FROM platform_records').get().n
      };
      db.close();
      console.log(JSON.stringify(result));
    `, f.path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    try {
      if (order === "auth-first") { auth = new AuthStore(config); store = new Store(f.path); }
      else {
        store = new Store(f.path);
        if (order === "legacy-hardening")
          for (const suffix of ["", "-wal", "-shm"]) chmodSync(f.path + suffix, 0o644);
        auth = new AuthStore(config);
      }
      auth.record("synthetic-member", "session.created", "success");
      store.insert("sites", "synthetic-owner", { name: "Before external reader" });
      assert.deepEqual(externalRead(), { auth: 1, records: 1 });
      for (const suffix of ["-wal", "-shm"])
        assert.equal(existsSync(f.path + suffix), true, "a reader must not unlink a live writer's " + suffix);
      auth.record("synthetic-member", "session.created", "success");
      store.insert("sites", "synthetic-owner", { name: "After external reader" });
      assert.deepEqual(externalRead(), { auth: 2, records: 2 });
      store.close(); store = undefined; auth.close(); auth = undefined;
      assert.deepEqual(externalRead(), { auth: 2, records: 2 }, "committed records must survive clean restart");
    } finally { auth?.close(); store?.close(); f.cleanup(); }
  });
}
