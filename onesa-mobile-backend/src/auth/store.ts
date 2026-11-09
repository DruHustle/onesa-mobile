import { chmodSync, existsSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { digest } from "./crypto.ts";
import { prepareDatabaseFiles } from "./database-files.ts";
import { AuthError, type AuthConfig, type AuthSource, type Role, type Surface } from "./types.ts";

export interface LabUser {
  id: string; username: string; display_name: string; role: Role; password_hash: string;
  totp_secret: string | null; last_totp_counter: number; revision: number; disabled: number;
}
export interface SessionRow {
  id: string; token_hash: string; subject: string; source: AuthSource; csrf: string; authenticated_at: number;
  expires_at: number; user_revision: number | null; onesa_access_token: string | null; surface: Surface;
}
export interface FlowRow {
  state_hash: string; cookie_hash: string; verifier: string; nonce: string; surface: Surface;
  return_to: string; expires_at: number; native_challenge: string | null; native_state: string | null;
}
export interface HandoffRow {
  code_hash: string; challenge: string; state: string; token: string; expires_at: number;
}

export class AuthStore {
  readonly db: DatabaseSync;
  readonly key: Buffer;
  constructor(config: AuthConfig) {
    const inMemory = config.databasePath === ":memory:";
    const path = inMemory ? ":memory:" : resolve(config.databasePath);
    if (!inMemory) prepareDatabaseFiles(path);
    if (config.encryptionKey !== undefined) {
      if (!/^[a-f0-9]{64}$/i.test(config.encryptionKey)) throw new Error("AUTH_ENCRYPTION_KEY must be 64 hexadecimal characters.");
      this.key = Buffer.from(config.encryptionKey, "hex");
    } else if (config.mode === "production") {
      throw new Error("Production authentication requires AUTH_ENCRYPTION_KEY.");
    } else if (inMemory) {
      this.key = randomBytes(32);
    } else {
      const keyPath = path + ".authkey";
      if (!existsSync(keyPath)) {
        writeFileSync(keyPath, randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 });
      }
      if (lstatSync(keyPath).isSymbolicLink()) throw new Error("Lab authentication key cannot be a symlink.");
      chmodSync(keyPath, 0o600);
      const key = readFileSync(keyPath, "utf8").trim();
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Lab authentication key is invalid.");
      this.key = Buffer.from(key, "hex");
    }
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    this.db.exec([
      "CREATE TABLE IF NOT EXISTS mobile_auth_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','operations','support','finance','agent','auditor','customer')), password_hash TEXT NOT NULL, totp_secret TEXT, last_totp_counter INTEGER NOT NULL DEFAULT -1, revision INTEGER NOT NULL DEFAULT 1, disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)), CHECK(role='customer' OR totp_secret IS NOT NULL)) STRICT",
      "CREATE TABLE IF NOT EXISTS mobile_auth_sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, subject TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('lab','onesa')), csrf TEXT NOT NULL, authenticated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_revision INTEGER, onesa_access_token TEXT, surface TEXT NOT NULL CHECK(surface IN ('customer','staff'))) STRICT",
      "CREATE INDEX IF NOT EXISTS mobile_auth_sessions_subject ON mobile_auth_sessions(subject)",
      "CREATE TABLE IF NOT EXISTS mobile_auth_flows (state_hash TEXT PRIMARY KEY, cookie_hash TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL, surface TEXT NOT NULL CHECK(surface IN ('customer','staff')), return_to TEXT NOT NULL, expires_at INTEGER NOT NULL, native_challenge TEXT, native_state TEXT) STRICT",
      "CREATE TABLE IF NOT EXISTS mobile_auth_handoffs (code_hash TEXT PRIMARY KEY, challenge TEXT NOT NULL, state TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT",
      "CREATE TABLE IF NOT EXISTS mobile_auth_limits (key_hash TEXT PRIMARY KEY, hits INTEGER NOT NULL, until_at INTEGER NOT NULL) STRICT",
      "CREATE TABLE IF NOT EXISTS mobile_auth_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, subject TEXT, action TEXT NOT NULL, outcome TEXT NOT NULL) STRICT",
    ].join(";") + ";");
    if (config.mode === "production") {
      const count = this.db.prepare("SELECT (SELECT count(*) FROM mobile_auth_users) + (SELECT count(*) FROM mobile_auth_sessions WHERE source='lab') AS n").get() as { n: number };
      if (count.n !== 0) { this.db.close(); throw new Error("Production authentication refuses lab identities or sessions. Use a separate production database."); }
    }
  }
  close(): void { this.db.close(); }
  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  userByName(username: string): LabUser | undefined {
    return this.db.prepare("SELECT * FROM mobile_auth_users WHERE username=?").get(username) as LabUser | undefined;
  }
  userById(id: string): LabUser | undefined {
    return this.db.prepare("SELECT * FROM mobile_auth_users WHERE id=?").get(id) as LabUser | undefined;
  }
  sessionByHash(hash: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM mobile_auth_sessions WHERE token_hash=?").get(hash) as SessionRow | undefined;
  }
  addSession(row: SessionRow): void {
    this.db.prepare("INSERT INTO mobile_auth_sessions VALUES(?,?,?,?,?,?,?,?,?,?)").run(
      row.id, row.token_hash, row.subject, row.source, row.csrf, row.authenticated_at, row.expires_at, row.user_revision, row.onesa_access_token, row.surface);
  }
  deleteSession(id: string): void { this.db.prepare("DELETE FROM mobile_auth_sessions WHERE id=?").run(id); }
  record(subject: string | null, action: string, outcome: string): void {
    this.db.prepare("INSERT INTO mobile_auth_events(at,subject,action,outcome) VALUES(?,?,?,?)").run(Math.floor(Date.now() / 1000), subject, action, outcome);
  }
  consumeLimit(key: string, maximum: number, seconds: number, now: number): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM mobile_auth_limits WHERE until_at<=?").run(now);
      const id = digest(key);
      const current = this.db.prepare("SELECT hits FROM mobile_auth_limits WHERE key_hash=?").get(id) as { hits: number } | undefined;
      if ((current?.hits ?? 0) >= maximum) throw new AuthError(429, "AUTH_RATE_LIMITED", "Too many sign-in attempts. Try again later.");
      this.db.prepare("INSERT INTO mobile_auth_limits(key_hash,hits,until_at) VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET hits=hits+1").run(id, now + seconds);
    });
  }
  cleanup(now: number): void {
    this.db.prepare("DELETE FROM mobile_auth_sessions WHERE expires_at<=?").run(now);
    this.db.prepare("DELETE FROM mobile_auth_flows WHERE expires_at<=?").run(now);
    this.db.prepare("DELETE FROM mobile_auth_handoffs WHERE expires_at<=?").run(now);
  }
  takeFlow(stateHash: string, cookieHash: string, now: number): FlowRow | undefined {
    return this.transaction(() => {
      const flow = this.db.prepare("SELECT * FROM mobile_auth_flows WHERE state_hash=? AND cookie_hash=? AND expires_at>?").get(stateHash, cookieHash, now) as FlowRow | undefined;
      if (flow) this.db.prepare("DELETE FROM mobile_auth_flows WHERE state_hash=?").run(stateHash);
      return flow;
    });
  }
}
