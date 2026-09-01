import type { Context } from "hono";
import { getClientIp } from "../client-ip.js";
import { randomHex } from "../crypto.js";
import type { AssessDb } from "../db.js";
import { generateApiKeyToken, hashApiKey } from "../db.js";
import type { Env } from "../env.js";
import { getPlanLimits } from "../quota.js";

type CreateKeyRequest = {
  label?: string;
};

export async function handleCreateKey(
  c: Context,
  env: Env,
  db: AssessDb,
): Promise<Response> {
  const ip = getClientIp(c);
  const recentSignups = await db.countSignupsLastHour(ip);

  if (recentSignups >= env.signupRatePerHour) {
    return c.json(
      {
        error: "rate_limit_exceeded",
        message: `Signup limit of ${env.signupRatePerHour} keys per hour exceeded for this IP`,
      },
      429,
    );
  }

  let body: CreateKeyRequest = {};
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await c.req.json<CreateKeyRequest>();
    } catch {
      return c.json({ error: "bad_request", message: "Invalid JSON body" }, 400);
    }
  }

  const label =
    typeof body.label === "string" && body.label.trim().length > 0
      ? body.label.trim().slice(0, 64)
      : "signup";

  const free = getPlanLimits("free");
  const keyId = `key_${randomHex(6)}`;
  const token = generateApiKeyToken();

  await db.insertApiKey({
    id: keyId,
    keyHash: await hashApiKey(token, env.apiKeyPepper),
    plan: "free",
    monthlyQuota: free.monthlyQuota,
    label,
  });
  await db.recordSignup(ip, keyId);

  return c.json(
    {
      id: keyId,
      key: token,
      plan: "free",
      monthlyQuota: free.monthlyQuota,
      ratePerMinute: free.ratePerMinute,
      message: "Store this key securely — it will not be shown again.",
    },
    201,
  );
}
