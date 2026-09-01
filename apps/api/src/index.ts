import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createSqliteDb } from "./db/sqlite.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createSqliteDb(env);
const app = createApp(env, db);

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`Assess API (Node/SQLite) listening on http://localhost:${info.port}`);
  },
);
