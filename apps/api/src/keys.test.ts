import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createSqliteDb } from "./db/sqlite.js";
import type { Env } from "./env.js";

const env: Env = {
  port: 8787,
  databaseUrl: ":memory:",
  apiKeyPepper: "test-pepper",
  corsOrigins: ["http://localhost:5173"],
  signupRatePerHour: 2,
};

describe("POST /v1/keys", () => {
  it("creates a free-tier API key", async () => {
    const db = createSqliteDb(env);
    const app = createApp(env, db);

    const response = await app.request("/v1/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({ label: "test-signup" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      plan: string;
      monthlyQuota: number;
      key: string;
    };
    expect(body.plan).toBe("free");
    expect(body.monthlyQuota).toBe(20);
    expect(body.key).toMatch(/^ask_/);
    expect(await db.verifyApiKey(body.key)).not.toBeNull();
  });

  it("rate limits signups per IP", async () => {
    const db = createSqliteDb(env);
    const app = createApp(env, db);

    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.99",
    };

    await app.request("/v1/keys", { method: "POST", headers, body: "{}" });
    await app.request("/v1/keys", { method: "POST", headers, body: "{}" });

    const third = await app.request("/v1/keys", { method: "POST", headers, body: "{}" });
    expect(third.status).toBe(429);
  });
});
