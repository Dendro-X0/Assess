import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Env } from "./env.js";
import { getPlanLimits } from "./quota.js";

export type PlanTier = "free" | "pro";

export type ApiKeyRecord = {
  id: string;
  keyHash: string;
  plan: PlanTier;
  monthlyQuota: number;
  label: string;
  polarCustomerId?: string;
  polarSubscriptionId?: string;
};

export type UpdateKeyPlanInput = {
  keyId: string;
  plan: PlanTier;
  monthlyQuota: number;
  polarCustomerId?: string;
  polarSubscriptionId?: string;
};

export type AssessDb = {
  db: Database.Database;
  verifyApiKey: (token: string) => ApiKeyRecord | null;
  countUsageThisMonth: (keyId: string) => number;
  countRequestsLastMinute: (keyId: string) => number;
  recordUsage: (keyId: string, assessId: string) => void;
  recordRateEvent: (keyId: string) => void;
  insertApiKey: (record: ApiKeyRecord) => void;
  updateKeyPlan: (input: UpdateKeyPlanInput) => boolean;
};

function hashKey(token: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
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

    CREATE TABLE IF NOT EXISTS rate_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (key_id) REFERENCES api_keys(id)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_key_month
      ON usage_events (key_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_rate_key_time
      ON rate_events (key_id, created_at);
  `);

  ensureColumn(db, "api_keys", "polar_customer_id", "TEXT");
  ensureColumn(db, "api_keys", "polar_subscription_id", "TEXT");

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
  const insertUsage = db.prepare(
    "INSERT INTO usage_events (key_id, assess_id) VALUES (?, ?)",
  );
  const insertRate = db.prepare("INSERT INTO rate_events (key_id) VALUES (?)");
  const insertKey = db.prepare(`
    INSERT INTO api_keys (
      id, key_hash, plan, monthly_quota, label, polar_customer_id, polar_subscription_id
    )
    VALUES (
      @id, @key_hash, @plan, @monthly_quota, @label, @polar_customer_id, @polar_subscription_id
    )
  `);
  const updatePlan = db.prepare(`
    UPDATE api_keys
    SET plan = @plan,
        monthly_quota = @monthly_quota,
        polar_customer_id = COALESCE(@polar_customer_id, polar_customer_id),
        polar_subscription_id = COALESCE(@polar_subscription_id, polar_subscription_id)
    WHERE id = @id
  `);

  const verifyApiKey = (token: string): ApiKeyRecord | null => {
    if (env.devApiKey && token === env.devApiKey) {
      const free = getPlanLimits("free");
      return {
        id: "dev",
        keyHash: "dev",
        plan: "free",
        monthlyQuota: free.monthlyQuota,
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
          polar_customer_id: string | null;
          polar_subscription_id: string | null;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      keyHash: row.key_hash,
      plan: row.plan,
      monthlyQuota: row.monthly_quota,
      label: row.label,
      polarCustomerId: row.polar_customer_id ?? undefined,
      polarSubscriptionId: row.polar_subscription_id ?? undefined,
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
    countRequestsLastMinute: (keyId: string) => {
      if (keyId === "dev") return 0;
      const row = countRate.get(keyId) as { count: number };
      return row.count;
    },
    recordUsage: (keyId: string, assessId: string) => {
      if (keyId === "dev") return;
      insertUsage.run(keyId, assessId);
    },
    recordRateEvent: (keyId: string) => {
      if (keyId === "dev") return;
      insertRate.run(keyId);
    },
    insertApiKey: (record: ApiKeyRecord) => {
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
    updateKeyPlan: (input: UpdateKeyPlanInput) => {
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

export function generateApiKeyToken(): string {
  return `ask_${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(token: string, pepper: string): string {
  return hashKey(token, pepper);
}
