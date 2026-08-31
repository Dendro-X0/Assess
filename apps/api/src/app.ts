import { Hono } from "hono";
import { createDb, type AssessDb } from "./db.js";
import type { Env } from "./env.js";
import { handleAssess } from "./routes/assess.js";
import { handlePolarWebhook } from "./routes/polar.js";

export function createApp(env: Env, db: AssessDb = createDb(env)) {
  const app = new Hono();

  app.get("/v1/health", (c) => c.json({ ok: true }));

  app.post("/v1/assess", (c) => handleAssess(c, env, db));
  app.post("/v1/webhooks/polar", (c) => handlePolarWebhook(c, env, db));

  return app;
}
