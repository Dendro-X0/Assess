import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDb, generateApiKeyToken, hashApiKey } from "./db.js";
import { getPlanLimits } from "./quota.js";
import type { Env } from "./env.js";

function testEnv(): Env {
  return {
    port: 8787,
    databaseUrl: ":memory:",
    apiKeyPepper: "test-pepper",
  };
}

describe("createDb quotas", () => {
  it("enforces monthly quota per key", () => {
    const db = createDb(testEnv());
    const token = generateApiKeyToken();
    const keyId = "key_monthly";

    db.insertApiKey({
      id: keyId,
      keyHash: hashApiKey(token, "test-pepper"),
      plan: "free",
      monthlyQuota: 2,
      label: "test",
    });

    expect(db.verifyApiKey(token)?.monthlyQuota).toBe(2);
    expect(db.countUsageThisMonth(keyId)).toBe(0);

    db.recordUsage(keyId, "asr_1");
    db.recordUsage(keyId, "asr_2");
    expect(db.countUsageThisMonth(keyId)).toBe(2);
  });

  it("enforces per-minute rate limit", () => {
    const db = createDb(testEnv());
    const keyId = "key_rate";

    db.insertApiKey({
      id: keyId,
      keyHash: "hash",
      plan: "free",
      monthlyQuota: 20,
      label: "test",
    });

    for (let i = 0; i < 10; i += 1) {
      db.recordRateEvent(keyId);
    }

    expect(db.countRequestsLastMinute(keyId)).toBe(10);
  });

  it("upgrades and downgrades plan via updateKeyPlan", () => {
    const db = createDb(testEnv());
    const token = generateApiKeyToken();
    const keyId = "key_polar";

    db.insertApiKey({
      id: keyId,
      keyHash: hashApiKey(token, "test-pepper"),
      plan: "free",
      monthlyQuota: getPlanLimits("free").monthlyQuota,
      label: "test",
    });

    const upgraded = db.updateKeyPlan({
      keyId,
      plan: "pro",
      monthlyQuota: getPlanLimits("pro").monthlyQuota,
      polarCustomerId: "cus_123",
      polarSubscriptionId: "sub_123",
    });

    expect(upgraded).toBe(true);
    const record = db.verifyApiKey(token);
    expect(record?.plan).toBe("pro");
    expect(record?.monthlyQuota).toBe(500);
    expect(record?.polarSubscriptionId).toBe("sub_123");
  });
});

function signPolarPayload(secret: string, body: string) {
  const webhookId = "msg_test";
  const webhookTimestamp = "1710000000";
  const signature = createHmac("sha256", secret)
    .update(`${webhookId}.${webhookTimestamp}.${body}`)
    .digest("base64");

  return {
    webhookId,
    webhookTimestamp,
    webhookSignature: `v1,${signature}`,
  };
}

describe("polar webhook route", () => {
  it("upgrades key when subscription becomes active", async () => {
    const { createApp } = await import("./app.js");
    const secret = "whsec_test";
    const token = generateApiKeyToken();
    const keyId = "key_webhook";

    const env: Env = {
      ...testEnv(),
      polarWebhookSecret: secret,
    };

    const db = createDb(env);
    const app = createApp(env, db);

    db.insertApiKey({
      id: keyId,
      keyHash: hashApiKey(token, env.apiKeyPepper),
      plan: "free",
      monthlyQuota: 20,
      label: "test",
    });

    const body = JSON.stringify({
      type: "subscription.active",
      data: {
        id: "sub_abc",
        customer_id: "cus_abc",
        metadata: { api_key_id: keyId },
      },
    });
    const headers = signPolarPayload(secret, body);

    const response = await app.request("/v1/webhooks/polar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": headers.webhookId,
        "webhook-timestamp": headers.webhookTimestamp,
        "webhook-signature": headers.webhookSignature,
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, action: "upgraded", plan: "pro" });
    expect(db.verifyApiKey(token)?.plan).toBe("pro");
  });
});

describe("assess route quotas", () => {
  it("returns 429 when monthly quota is exceeded", async () => {
    const { createApp } = await import("./app.js");
    const token = generateApiKeyToken();
    const keyId = "key_assess_quota";
    const env = testEnv();
    const db = createDb(env);
    const app = createApp(env, db);

    db.insertApiKey({
      id: keyId,
      keyHash: hashApiKey(token, env.apiKeyPepper),
      plan: "free",
      monthlyQuota: 1,
      label: "test",
    });
    db.recordUsage(keyId, "asr_used");

    const response = await app.request("/v1/assess", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "opportunity",
        url: "https://github.com/owner/repo/issues/1",
      }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "quota_exceeded" });
  });

  it("returns 429 when per-minute rate limit is exceeded", async () => {
    const { createApp } = await import("./app.js");
    const token = generateApiKeyToken();
    const keyId = "key_assess_rate";
    const env = testEnv();
    const db = createDb(env);
    const app = createApp(env, db);

    db.insertApiKey({
      id: keyId,
      keyHash: hashApiKey(token, env.apiKeyPepper),
      plan: "free",
      monthlyQuota: 20,
      label: "test",
    });

    for (let i = 0; i < 10; i += 1) {
      db.recordRateEvent(keyId);
    }

    const response = await app.request("/v1/assess", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "opportunity",
        url: "https://github.com/owner/repo/issues/1",
      }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limit_exceeded" });
  });
});
