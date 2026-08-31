import { createHmac, timingSafeEqual } from "node:crypto";

export type PolarWebhookEvent = {
  type: string;
  timestamp?: string;
  data: {
    id?: string;
    status?: string;
    customer_id?: string;
    product_id?: string;
    metadata?: Record<string, string>;
    customer?: { id?: string; email?: string };
  };
};

export function verifyPolarWebhookSignature(
  secret: string,
  rawBody: string,
  webhookId: string | undefined,
  webhookTimestamp: string | undefined,
  webhookSignature: string | undefined,
): boolean {
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false;
  }

  const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("base64");

  for (const part of webhookSignature.split(" ")) {
    const [version, signature] = part.split(",", 2);
    if (version !== "v1" || !signature) continue;

    try {
      const a = Buffer.from(signature, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return true;
      }
    } catch {
      // try next signature part
    }
  }

  return false;
}

export function parsePolarWebhookEvent(rawBody: string): PolarWebhookEvent {
  return JSON.parse(rawBody) as PolarWebhookEvent;
}
