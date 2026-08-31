import { randomBytes } from "node:crypto";
import { loadEnv } from "../env.js";
import { createDb, generateApiKeyToken, hashApiKey } from "../db.js";

const env = loadEnv();
const db = createDb(env);
const token = generateApiKeyToken();

db.insertApiKey({
  id: `key_${randomBytes(6).toString("hex")}`,
  keyHash: hashApiKey(token, env.apiKeyPepper),
  plan: "free",
  monthlyQuota: 20,
  label: "seed-free",
});

console.log("Created API key (store securely — shown once):");
console.log(token);
