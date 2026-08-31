import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Env } from "./env.js";

export type PlanTier = "free" | "pro";

export type ApiKeyRecord = {
  id: string;
  keyHash: string;
  plan: PlanTier;
  monthlyQuota: number;
  label: string;
};

export type AssessDb = {
  db: Database.Database;
  verifyApiKey: (token: string) => ApiKeyRecord | null;
  countUsageThisMonth: (keyId: string) => number;
  recordUsage: (keyId: string, assessId: string) => void;
  insertApiKey: (record: ApiKeyRecord) => void;
};

function hashKey(token: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export function createDb(env: Env): AssessDb {
  const dbPath = env.databaseUrl === ":memory:" ? ":memory:" : env.databaseUrl;
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL,
      monthly_quota INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT NOT NULL,
      assess_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (key_id) REFERENCES api_keys(id)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_key_month
      ON usage_events (key_id, created_at);
  `);

  const findKey = db.prepare(
    "SELECT id, key_hash, plan, monthly_quota, label FROM api_keys WHERE key_hash = ?",
  );
  const countUsage = db.prepare(`
    SELECT COUNT(*) as count FROM usage_events
    WHERE key_id = ?
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `);
  const insertUsage = db.prepare(
    "INSERT INTO usage_events (key_id, assess_id) VALUES (?, ?)",
  );
  const insertKey = db.prepare(`
    INSERT INTO api_keys (id, key_hash, plan, monthly_quota, label)
    VALUES (@id, @key_hash, @plan, @monthly_quota, @label)
  `);

  const verifyApiKey = (token: string): ApiKeyRecord | null => {
    if (env.devApiKey && token === env.devApiKey) {
      return {
        id: "dev",
        keyHash: "dev",
        plan: "free",
        monthlyQuota: 20,
        label: "dev",
      };
    }

    const row = findKey.get(hashKey(token, env.apiKeyPepper)) as
      | {
          id: string;
          key_hash: string;
          plan: PlanTier;
          monthly_quota: number;
          label: string;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      keyHash: row.key_hash,
      plan: row.plan,
      monthlyQuota: row.monthly_quota,
      label: row.label,
    };
  };

  return {
    db,
    verifyApiKey,
    countUsageThisMonth: (keyId: string) => {
      if (keyId === "dev") return 0;
      const row = countUsage.get(keyId) as { count: number };
      return row.count;
    },
    recordUsage: (keyId: string, assessId: string) => {
      if (keyId === "dev") return;
      insertUsage.run(keyId, assessId);
    },
    insertApiKey: (record: ApiKeyRecord) => {
      insertKey.run({
        id: record.id,
        key_hash: record.keyHash,
        plan: record.plan,
        monthly_quota: record.monthlyQuota,
        label: record.label,
      });
    },
  };
}

export function generateApiKeyToken(): string {
  return `ask_${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(token: string, pepper: string): string {
  return hashKey(token, pepper);
}
