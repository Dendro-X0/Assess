import { getPlanLimits } from "../quota.js";
import { hashKey } from "../crypto.js";

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
  verifyApiKey: (token: string) => Promise<ApiKeyRecord | null>;
  countUsageThisMonth: (keyId: string) => Promise<number>;
  countRequestsLastMinute: (keyId: string) => Promise<number>;
  countSignupsLastHour: (ip: string) => Promise<number>;
  recordUsage: (keyId: string, assessId: string) => Promise<void>;
  recordRateEvent: (keyId: string) => Promise<void>;
  recordSignup: (ip: string, keyId: string) => Promise<void>;
  insertApiKey: (record: ApiKeyRecord) => Promise<void>;
  updateKeyPlan: (input: UpdateKeyPlanInput) => Promise<boolean>;
};

type KeyRow = {
  id: string;
  key_hash: string;
  plan: PlanTier;
  monthly_quota: number;
  label: string;
  polar_customer_id: string | null;
  polar_subscription_id: string | null;
};

export function mapKeyRow(row: KeyRow): ApiKeyRecord {
  return {
    id: row.id,
    keyHash: row.key_hash,
    plan: row.plan,
    monthlyQuota: row.monthly_quota,
    label: row.label,
    polarCustomerId: row.polar_customer_id ?? undefined,
    polarSubscriptionId: row.polar_subscription_id ?? undefined,
  };
}

export async function verifyDevOrDbKey(
  token: string,
  env: { devApiKey?: string; apiKeyPepper: string },
  lookup: (hash: string) => Promise<ApiKeyRecord | null>,
): Promise<ApiKeyRecord | null> {
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

  const hash = await hashKey(token, env.apiKeyPepper);
  return lookup(hash);
}
