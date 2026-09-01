import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createSqliteDb } from "./db/sqlite.js";
import { loadEnv } from "./env.js";

describe("createApp", () => {
  const env = {
    ...loadEnv(),
    databaseUrl: ":memory:",
    devApiKey: "ask_test",
  };
  const app = createApp(env, createSqliteDb(env));

  it("returns health", async () => {
    const response = await app.request("/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects missing auth on assess", async () => {
    const response = await app.request("/v1/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "opportunity",
        url: "https://github.com/owner/repo/issues/1",
      }),
    });
    expect(response.status).toBe(401);
  });
});
