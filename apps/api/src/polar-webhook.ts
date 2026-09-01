import { hmacSha256Base64, timingSafeEqualBase64 } from "./crypto.js";

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

export async function verifyPolarWebhookSignature(
  secret: string,
  rawBody: string,
  webhookId: string | undefined,
  webhookTimestamp: string | undefined,
  webhookSignature: string | undefined,
): Promise<boolean> {
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return false;
  }

  const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = await hmacSha256Base64(secret, signedPayload);

  for (const part of webhookSignature.split(" ")) {
    const [version, signature] = part.split(",", 2);
    if (version !== "v1" || !signature) continue;
    if (timingSafeEqualBase64(signature, expected)) {
      return true;
    }
  }

  return false;
}

export function parsePolarWebhookEvent(rawBody: string): PolarWebhookEvent {
  return JSON.parse(rawBody) as PolarWebhookEvent;
}
