import { createApp } from "./app.js";
import { createD1Db } from "./db/d1.js";
import { type CloudflareBindings, loadEnvFromBindings } from "./env-bindings.js";

export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const assessEnv = loadEnvFromBindings(env);
    const db = createD1Db(env.DB, assessEnv);
    const app = createApp(assessEnv, db);
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareBindings>;
