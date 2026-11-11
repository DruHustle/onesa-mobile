import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { prepareDatabaseFiles } from "../auth/database-files.ts";
import {
  DomainError,
  type Actor,
  type Kind,
  type RecordItem,
} from "./model.ts";

type Row = {
  id: string;
  kind: Kind;
  owner: string;
  revision: number;
  payload: string;
  created_at: string;
  updated_at: string;
};

export class Store {
  db: DatabaseSync;
  path: string;
  constructor(path: string) {
    this.path = path === ":memory:" ? path : resolve(path);
    if (this.path !== ":memory:") prepareDatabaseFiles(this.path);
    this.db = new DatabaseSync(this.path, { timeout: 5000 });
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS platform_schema(version INTEGER PRIMARY KEY, installed_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS platform_records(kind TEXT NOT NULL,id TEXT PRIMARY KEY,owner TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL CHECK(json_valid(payload)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS platform_records_scope ON platform_records(kind,owner,created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS platform_launch_interest_owner ON platform_records(owner) WHERE kind='launchInterests';
      CREATE UNIQUE INDEX IF NOT EXISTS platform_asset_tag ON platform_records(json_extract(payload,'$.tag')) WHERE kind='assets';
      CREATE UNIQUE INDEX IF NOT EXISTS platform_ledger_reference ON platform_records(json_extract(payload,'$.reference')) WHERE kind='ledger';
      CREATE TABLE IF NOT EXISTS platform_audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,actor TEXT NOT NULL,role TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,at TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS platform_idempotency(actor TEXT NOT NULL,key TEXT NOT NULL,operation TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(actor,key));
      INSERT OR IGNORE INTO platform_schema(version,installed_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
  }
  close(): void {
    this.db.close();
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private decode(row: Row): RecordItem {
    return {
      ...JSON.parse(row.payload),
      id: row.id,
      kind: row.kind,
      owner: row.owner,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  get(kind: Kind, id: string): RecordItem {
    const row = this.db
      .prepare("SELECT * FROM platform_records WHERE kind=? AND id=?")
      .get(kind, id) as Row | undefined;
    if (!row)
      throw new DomainError(404, "NOT_FOUND", "The record is not available.");
    return this.decode(row);
  }
  list(kind: Kind, owner?: string, limit = 200): RecordItem[] {
    const rows =
      owner === undefined
        ? this.db
            .prepare(
              "SELECT * FROM platform_records WHERE kind=? ORDER BY created_at DESC,id LIMIT ?",
            )
            .all(kind, limit)
        : this.db
            .prepare(
              "SELECT * FROM platform_records WHERE kind=? AND owner=? ORDER BY created_at DESC,id LIMIT ?",
            )
            .all(kind, owner, limit);
    return (rows as unknown as Row[]).map((row) => this.decode(row));
  }
  count(kind: Kind, owner?: string): number {
    const row =
      owner === undefined
        ? this.db
            .prepare("SELECT count(*) AS n FROM platform_records WHERE kind=?")
            .get(kind)
        : this.db
            .prepare(
              "SELECT count(*) AS n FROM platform_records WHERE kind=? AND owner=?",
            )
            .get(kind, owner);
    return Number(row!.n);
  }
  page(
    kind: Kind,
    options: {
      owner?: string;
      soldBy?: string;
      limit: number;
      cursor?: string;
    },
  ): { items: RecordItem[]; total: number; nextCursor: string | null } {
    const filters = ["kind=?"],
      values: (string | number)[] = [kind];
    if (options.owner !== undefined) {
      filters.push("owner=?");
      values.push(options.owner);
    }
    if (options.soldBy !== undefined) {
      filters.push("json_extract(payload,'$.soldBy')=?");
      values.push(options.soldBy);
    }
    const total = Number(
      this.db
        .prepare(
          "SELECT count(*) AS n FROM platform_records WHERE " +
            filters.join(" AND "),
        )
        .get(...values)!.n,
    );
    if (options.cursor) {
      let cursor: unknown;
      try {
        cursor = JSON.parse(
          Buffer.from(options.cursor, "base64url").toString("utf8"),
        );
      } catch {
        throw new DomainError(
          400,
          "INVALID_PAGE",
          "The page cursor is invalid.",
        );
      }
      if (
        !Array.isArray(cursor) ||
        cursor.length !== 2 ||
        typeof cursor[0] !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor[0]) ||
        typeof cursor[1] !== "string" ||
        !/^[a-f0-9-]{36}$/.test(cursor[1])
      )
        throw new DomainError(
          400,
          "INVALID_PAGE",
          "The page cursor is invalid.",
        );
      filters.push("(created_at<? OR (created_at=? AND id<?))");
      values.push(cursor[0], cursor[0], cursor[1]);
    }
    // History is available on the scoped single-record endpoint, never repeated in list payloads.
    const rows = this.db
      .prepare(
        "SELECT id,kind,owner,revision,json_remove(payload,'$.commissioningHistory') AS payload,created_at,updated_at FROM platform_records WHERE " +
          filters.join(" AND ") +
          " ORDER BY created_at DESC,id DESC LIMIT ?",
      )
      .all(...values, options.limit + 1) as unknown as Row[];
    const more = rows.length > options.limit,
      items = rows.slice(0, options.limit).map((row) => this.decode(row)),
      last = items.at(-1);
    return {
      items,
      total,
      nextCursor:
        more && last
          ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString(
              "base64url",
            )
          : null,
    };
  }
  auditPage(
    limit: number,
    cursor?: string,
  ): { items: unknown[]; total: number; nextCursor: string | null } {
    let before = Number.MAX_SAFE_INTEGER;
    if (cursor) {
      try {
        before = JSON.parse(
          Buffer.from(cursor, "base64url").toString("utf8"),
        ) as number;
      } catch {
        throw new DomainError(
          400,
          "INVALID_PAGE",
          "The page cursor is invalid.",
        );
      }
      if (!Number.isSafeInteger(before) || before < 1)
        throw new DomainError(
          400,
          "INVALID_PAGE",
          "The page cursor is invalid.",
        );
    }
    const rows = this.db
        .prepare(
          "SELECT sequence,id,actor,role,action,target,at,previous_hash AS previousHash,hash FROM platform_audit WHERE sequence<? ORDER BY sequence DESC LIMIT ?",
        )
        .all(before, limit + 1),
      items = rows.slice(0, limit);
    return {
      items,
      total: Number(
        this.db.prepare("SELECT count(*) AS n FROM platform_audit").get()!.n,
      ),
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify(Number(items.at(-1)!.sequence)),
            ).toString("base64url")
          : null,
    };
  }
  evidenceCounts(): Record<string, number> {
    const rows = this.db
      .prepare(
        "SELECT json_extract(payload,'$.gate') AS gate,count(*) AS n FROM platform_records WHERE kind='gates' AND json_extract(payload,'$.state')='accepted' AND julianday(json_extract(payload,'$.expiresAt'))>julianday('now') GROUP BY json_extract(payload,'$.gate')",
      )
      .all();
    return Object.fromEntries(
      rows.map((row) => [String(row.gate), Number(row.n)]),
    );
  }
  agentLedger(subject: string): RecordItem[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM platform_records WHERE kind='ledger' AND json_extract(payload,'$.soldBy')=? ORDER BY created_at DESC,id LIMIT 200",
        )
        .all(subject) as unknown as Row[]
    ).map((row) => this.decode(row));
  }
  insert(
    kind: Kind,
    owner: string,
    payload: Record<string, unknown>,
  ): RecordItem {
    const id = randomUUID(),
      at = new Date().toISOString();
    try {
      this.db
        .prepare("INSERT INTO platform_records VALUES(?,?,?,1,?,?,?)")
        .run(kind, id, owner, JSON.stringify(payload), at, at);
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        throw new DomainError(
          409,
          "DUPLICATE_RECORD",
          "That asset tag or payment reference already exists.",
        );
      throw error;
    }
    return this.get(kind, id);
  }
  update(
    current: RecordItem,
    revision: number,
    patch: Record<string, unknown>,
  ): RecordItem {
    if (revision !== current.revision)
      throw new DomainError(
        409,
        "REVISION_CONFLICT",
        "This record changed. Refresh it before saving.",
      );
    const {
      id,
      kind,
      owner,
      revision: oldRevision,
      createdAt,
      updatedAt,
      ...payload
    } = current;
    const result = this.db
      .prepare(
        "UPDATE platform_records SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND kind=? AND revision=?",
      )
      .run(
        JSON.stringify({ ...payload, ...patch }),
        new Date().toISOString(),
        id,
        kind,
        oldRevision,
      );
    if (result.changes !== 1)
      throw new DomainError(
        409,
        "REVISION_CONFLICT",
        "This record changed. Refresh it before saving.",
      );
    return this.get(kind, id);
  }
  audit(actor: Actor, action: string, target: string): void {
    const previous = this.db
      .prepare("SELECT hash FROM platform_audit ORDER BY sequence DESC LIMIT 1")
      .get();
    const item = {
      id: randomUUID(),
      actor: actor.subject,
      role: actor.role,
      action,
      target,
      at: new Date().toISOString(),
      previousHash: String(previous?.hash ?? "GENESIS"),
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(item))
      .digest("hex");
    this.db
      .prepare(
        "INSERT INTO platform_audit(id,actor,role,action,target,at,previous_hash,hash) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        item.id,
        item.actor,
        item.role,
        item.action,
        item.target,
        item.at,
        item.previousHash,
        hash,
      );
  }
  auditEntries(): unknown[] {
    return this.db
      .prepare(
        "SELECT sequence,id,actor,role,action,target,at,previous_hash AS previousHash,hash FROM platform_audit ORDER BY sequence DESC LIMIT 200",
      )
      .all();
  }
  verifyAudit(): boolean {
    const rows = this.db
      .prepare(
        "SELECT id,actor,role,action,target,at,previous_hash AS previousHash,hash FROM platform_audit ORDER BY sequence",
      )
      .iterate();
    let previousHash = "GENESIS";
    for (const row of rows) {
      const { hash, ...item } = row;
      if (
        item.previousHash !== previousHash ||
        createHash("sha256").update(JSON.stringify(item)).digest("hex") !== hash
      )
        return false;
      previousHash = String(hash);
    }
    return true;
  }
  idempotent<T>(
    actor: Actor,
    key: string,
    operation: string,
    input: unknown,
    work: () => T,
  ): T {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new DomainError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Send a unique Idempotency-Key of 16–128 letters, numbers, underscores or hyphens.",
      );
    const digest = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    return this.transaction(() => {
      const existing = this.db
        .prepare(
          "SELECT operation,digest,result FROM platform_idempotency WHERE actor=? AND key=?",
        )
        .get(actor.subject, key);
      if (existing) {
        if (existing.operation !== operation || existing.digest !== digest)
          throw new DomainError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This request key was already used for different input.",
          );
        return JSON.parse(String(existing.result)) as T;
      }
      const result = work();
      this.db
        .prepare("INSERT INTO platform_idempotency VALUES(?,?,?,?,?,?)")
        .run(
          actor.subject,
          key,
          operation,
          digest,
          JSON.stringify(result),
          new Date().toISOString(),
        );
      return result;
    });
  }
  async backupTo(path: string): Promise<void> {
    await backup(this.db, path);
    chmodSync(path, 0o600);
  }
  exportSnapshot(owner: string): {
    rows: (kind: Kind) => IterableIterator<RecordItem>;
    close: () => void;
  } {
    const db =
      this.path === ":memory:"
        ? this.db
        : new DatabaseSync(this.path, { readOnly: true, timeout: 5000 });
    db.exec("BEGIN");
    const decode = (row: Row) => this.decode(row);
    return {
      rows: function* (kind: Kind) {
        for (const row of db
          .prepare(
            "SELECT * FROM platform_records WHERE kind=? AND owner=? ORDER BY created_at,id",
          )
          .iterate(kind, owner))
          yield decode(row as unknown as Row);
      },
      close: () => {
        db.exec("ROLLBACK");
        if (db !== this.db) db.close();
      },
    };
  }
}
