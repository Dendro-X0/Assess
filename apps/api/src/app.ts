import { cors } from "hono/cors";
import { Hono } from "hono";
import { createDb, type AssessDb } from "./db.js";
import type { Env } from "./env.js";
import { handleAssess } from "./routes/assess.js";
import { handleCreateKey } from "./routes/keys.js";
import { handlePolarWebhook } from "./routes/polar.js";

export function createApp(env: Env, db: AssessDb = createDb(env)) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: env.corsOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
    }),
  );

  app.get("/v1/health", (c) => c.json({ ok: true }));

  app.post("/v1/keys", (c) => handleCreateKey(c, env, db));
  app.post("/v1/assess", (c) => handleAssess(c, env, db));
  app.post("/v1/webhooks/polar", (c) => handlePolarWebhook(c, env, db));

  return app;
}
