import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Env } from "../env.js";
import { hashIp, hashKey } from "../crypto.js";
import {
  type ApiKeyRecord,
  type AssessDb,
  type UpdateKeyPlanInput,
  mapKeyRow,
  verifyDevOrDbKey,
} from "./types.js";

type KeyRow = {
  id: string;
  key_hash: string;
  plan: "free" | "pro";
  monthly_quota: number;
  label: string;
  polar_customer_id: string | null;
  polar_subscription_id: string | null;
};

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL,
      monthly_quota INTEGER NOT NULL,
      label TEXT NOT NULL,
      polar_customer_id TEXT,
      polar_subscription_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT NOT NULL,
      assess_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (key_id) REFERENCES api_keys(id)
    );

    CREATE TABLE IF NOT EXISTS rate_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (key_id) REFERENCES api_keys(id)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_key_month ON usage_events (key_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_rate_key_time ON rate_events (key_id, created_at);

    CREATE TABLE IF NOT EXISTS signup_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT NOT NULL,
      key_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_signup_ip_time ON signup_events (ip_hash, created_at);
  `);
}

/** SQLite backend for Node tests and optional local `dev:node`. */
export function createSqliteDb(env: Env): AssessDb {
  const dbPath = env.databaseUrl === ":memory:" ? ":memory:" : env.databaseUrl;
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);

  const findKey = db.prepare(
    `SELECT id, key_hash, plan, monthly_quota, label, polar_customer_id, polar_subscription_id
     FROM api_keys WHERE key_hash = ?`,
  );
  const countUsage = db.prepare(`
    SELECT COUNT(*) as count FROM usage_events
    WHERE key_id = ?
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `);
  const countRate = db.prepare(`
    SELECT COUNT(*) as count FROM rate_events
    WHERE key_id = ?
      AND created_at >= datetime('now', '-1 minute')
  `);
  const countSignups = db.prepare(`
    SELECT COUNT(*) as count FROM signup_events
    WHERE ip_hash = ?
      AND created_at >= datetime('now', '-1 hour')
  `);
  const insertUsage = db.prepare(
    "INSERT INTO usage_events (key_id, assess_id) VALUES (?, ?)",
  );
  const insertRate = db.prepare("INSERT INTO rate_events (key_id) VALUES (?)");
  const insertSignup = db.prepare(
    "INSERT INTO signup_events (ip_hash, key_id) VALUES (?, ?)",
  );
  const insertKey = db.prepare(`
    INSERT INTO api_keys (
      id, key_hash, plan, monthly_quota, label, polar_customer_id, polar_subscription_id
    ) VALUES (@id, @key_hash, @plan, @monthly_quota, @label, @polar_customer_id, @polar_subscription_id)
  `);
  const updatePlan = db.prepare(`
    UPDATE api_keys
    SET plan = @plan,
        monthly_quota = @monthly_quota,
        polar_customer_id = COALESCE(@polar_customer_id, polar_customer_id),
        polar_subscription_id = COALESCE(@polar_subscription_id, polar_subscription_id)
    WHERE id = @id
  `);

  return {
    verifyApiKey: (token) =>
      verifyDevOrDbKey(token, env, async (keyHash) => {
        const row = findKey.get(keyHash) as KeyRow | undefined;
        return row ? mapKeyRow(row) : null;
      }),

    countUsageThisMonth: async (keyId) => {
      if (keyId === "dev") return 0;
      const row = countUsage.get(keyId) as { count: number };
      return row.count;
    },

    countRequestsLastMinute: async (keyId) => {
      if (keyId === "dev") return 0;
      const row = countRate.get(keyId) as { count: number };
      return row.count;
    },

    countSignupsLastHour: async (ip) => {
      const ipHash = await hashIp(ip, env.apiKeyPepper);
      const row = countSignups.get(ipHash) as { count: number };
      return row.count;
    },

    recordUsage: async (keyId, assessId) => {
      if (keyId === "dev") return;
      insertUsage.run(keyId, assessId);
    },

    recordRateEvent: async (keyId) => {
      if (keyId === "dev") return;
      insertRate.run(keyId);
    },

    recordSignup: async (ip, keyId) => {
      const ipHash = await hashIp(ip, env.apiKeyPepper);
      insertSignup.run(ipHash, keyId);
    },

    insertApiKey: async (record: ApiKeyRecord) => {
      insertKey.run({
        id: record.id,
        key_hash: record.keyHash,
        plan: record.plan,
        monthly_quota: record.monthlyQuota,
        label: record.label,
        polar_customer_id: record.polarCustomerId ?? null,
        polar_subscription_id: record.polarSubscriptionId ?? null,
      });
    },

    updateKeyPlan: async (input: UpdateKeyPlanInput) => {
      const result = updatePlan.run({
        id: input.keyId,
        plan: input.plan,
        monthly_quota: input.monthlyQuota,
        polar_customer_id: input.polarCustomerId ?? null,
        polar_subscription_id: input.polarSubscriptionId ?? null,
      });
      return result.changes > 0;
    },
  };
}

export async function hashApiKeySyncBridge(token: string, pepper: string): Promise<string> {
  return hashKey(token, pepper);
}
