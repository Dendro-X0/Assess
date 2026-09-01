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

export function createD1Db(d1: D1Database, env: Env): AssessDb {
  return {
    verifyApiKey: (token) =>
      verifyDevOrDbKey(token, env, async (keyHash) => {
        const row = await d1
          .prepare(
            `SELECT id, key_hash, plan, monthly_quota, label, polar_customer_id, polar_subscription_id
             FROM api_keys WHERE key_hash = ?`,
          )
          .bind(keyHash)
          .first<KeyRow>();
        return row ? mapKeyRow(row) : null;
      }),

    countUsageThisMonth: async (keyId) => {
      if (keyId === "dev") return 0;
      const row = await d1
        .prepare(
          `SELECT COUNT(*) as count FROM usage_events
           WHERE key_id = ?
             AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
        )
        .bind(keyId)
        .first<{ count: number }>();
      return row?.count ?? 0;
    },

    countRequestsLastMinute: async (keyId) => {
      if (keyId === "dev") return 0;
      const row = await d1
        .prepare(
          `SELECT COUNT(*) as count FROM rate_events
           WHERE key_id = ?
             AND created_at >= datetime('now', '-1 minute')`,
        )
        .bind(keyId)
        .first<{ count: number }>();
      return row?.count ?? 0;
    },

    countSignupsLastHour: async (ip) => {
      const ipHash = await hashIp(ip, env.apiKeyPepper);
      const row = await d1
        .prepare(
          `SELECT COUNT(*) as count FROM signup_events
           WHERE ip_hash = ?
             AND created_at >= datetime('now', '-1 hour')`,
        )
        .bind(ipHash)
        .first<{ count: number }>();
      return row?.count ?? 0;
    },

    recordUsage: async (keyId, assessId) => {
      if (keyId === "dev") return;
      await d1
        .prepare("INSERT INTO usage_events (key_id, assess_id) VALUES (?, ?)")
        .bind(keyId, assessId)
        .run();
    },

    recordRateEvent: async (keyId) => {
      if (keyId === "dev") return;
      await d1.prepare("INSERT INTO rate_events (key_id) VALUES (?)").bind(keyId).run();
    },

    recordSignup: async (ip, keyId) => {
      const ipHash = await hashIp(ip, env.apiKeyPepper);
      await d1
        .prepare("INSERT INTO signup_events (ip_hash, key_id) VALUES (?, ?)")
        .bind(ipHash, keyId)
        .run();
    },

    insertApiKey: async (record: ApiKeyRecord) => {
      await d1
        .prepare(
          `INSERT INTO api_keys (
            id, key_hash, plan, monthly_quota, label, polar_customer_id, polar_subscription_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.keyHash,
          record.plan,
          record.monthlyQuota,
          record.label,
          record.polarCustomerId ?? null,
          record.polarSubscriptionId ?? null,
        )
        .run();
    },

    updateKeyPlan: async (input: UpdateKeyPlanInput) => {
      const result = await d1
        .prepare(
          `UPDATE api_keys
           SET plan = ?,
               monthly_quota = ?,
               polar_customer_id = COALESCE(?, polar_customer_id),
               polar_subscription_id = COALESCE(?, polar_subscription_id)
           WHERE id = ?`,
        )
        .bind(
          input.plan,
          input.monthlyQuota,
          input.polarCustomerId ?? null,
          input.polarSubscriptionId ?? null,
          input.keyId,
        )
        .run();
      return (result.meta.changes ?? 0) > 0;
    },
  };
}

export async function insertApiKeyWithHash(
  d1: D1Database,
  env: Env,
  record: Omit<ApiKeyRecord, "keyHash"> & { token: string },
): Promise<void> {
  const keyHash = await hashKey(record.token, env.apiKeyPepper);
  await createD1Db(d1, env).insertApiKey({
    ...record,
    keyHash,
  });
}
