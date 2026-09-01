import { randomBytes } from "node:crypto";
import { loadEnv } from "../env.js";
import { createSqliteDb } from "../db/sqlite.js";
import { generateApiKeyToken, hashApiKey } from "../db.js";
import { getPlanLimits } from "../quota.js";

const env = loadEnv();
const db = createSqliteDb(env);
const token = generateApiKeyToken();
const pro = getPlanLimits("pro");

await db.insertApiKey({
  id: `key_${randomBytes(6).toString("hex")}`,
  keyHash: await hashApiKey(token, env.apiKeyPepper),
  plan: "pro",
  monthlyQuota: pro.monthlyQuota,
  label: "seed-pro",
});

console.log("Created Pro API key (store securely — shown once):");
console.log(token);
