import { randomBytes } from "node:crypto";
import { loadEnv } from "../env.js";
import { createDb, generateApiKeyToken, hashApiKey } from "../db.js";
import { getPlanLimits } from "../quota.js";

const env = loadEnv();
const db = createDb(env);
const token = generateApiKeyToken();
const pro = getPlanLimits("pro");

db.insertApiKey({
  id: `key_${randomBytes(6).toString("hex")}`,
  keyHash: hashApiKey(token, env.apiKeyPepper),
  plan: "pro",
  monthlyQuota: pro.monthlyQuota,
  label: "seed-pro",
});

console.log("Created Pro API key (store securely — shown once):");
console.log(token);
