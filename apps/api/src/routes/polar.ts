import type { Context } from "hono";
import type { AssessDb } from "../db.js";
import type { Env } from "../env.js";
import { getPlanLimits } from "../quota.js";
import {
  parsePolarWebhookEvent,
  verifyPolarWebhookSignature,
} from "../polar-webhook.js";

const PRO_EVENTS = new Set([
  "subscription.active",
  "subscription.created",
  "order.paid",
]);

const DOWNGRADE_EVENTS = new Set([
  "subscription.canceled",
  "subscription.revoked",
]);

export async function handlePolarWebhook(
  c: Context,
  env: Env,
  db: AssessDb,
): Promise<Response> {
  if (!env.polarWebhookSecret) {
    return c.json({ error: "not_configured", message: "Polar webhooks disabled" }, 503);
  }

  const rawBody = await c.req.text();
  const verified = verifyPolarWebhookSignature(
    env.polarWebhookSecret,
    rawBody,
    c.req.header("webhook-id"),
    c.req.header("webhook-timestamp"),
    c.req.header("webhook-signature"),
  );

  if (!verified) {
    return c.json({ error: "unauthorized", message: "Invalid webhook signature" }, 401);
  }

  let event;
  try {
    event = parsePolarWebhookEvent(rawBody);
  } catch {
    return c.json({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }

  const metadata = event.data.metadata ?? {};
  const keyId = metadata.api_key_id;
  if (!keyId) {
    return c.json({ ok: true, ignored: true, reason: "missing_api_key_id_metadata" });
  }

  if (PRO_EVENTS.has(event.type)) {
    const pro = getPlanLimits("pro");
    db.updateKeyPlan({
      keyId,
      plan: "pro",
      monthlyQuota: pro.monthlyQuota,
      polarCustomerId: event.data.customer_id ?? event.data.customer?.id,
      polarSubscriptionId: event.data.id,
    });
    return c.json({ ok: true, action: "upgraded", keyId, plan: "pro" });
  }

  if (DOWNGRADE_EVENTS.has(event.type)) {
    const free = getPlanLimits("free");
    db.updateKeyPlan({
      keyId,
      plan: "free",
      monthlyQuota: free.monthlyQuota,
      polarCustomerId: event.data.customer_id ?? event.data.customer?.id,
      polarSubscriptionId: event.data.id,
    });
    return c.json({ ok: true, action: "downgraded", keyId, plan: "free" });
  }

  return c.json({ ok: true, ignored: true, type: event.type });
}
