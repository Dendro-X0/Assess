import { Hono } from "hono";
import { createDb } from "./db.js";
import type { Env } from "./env.js";
import { handleAssess } from "./routes/assess.js";

export function createApp(env: Env) {
  const app = new Hono();
  const db = createDb(env);

  app.get("/v1/health", (c) => c.json({ ok: true }));

  app.post("/v1/assess", (c) => handleAssess(c, env, db));

  return app;
}
