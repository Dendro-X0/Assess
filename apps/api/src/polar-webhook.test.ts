import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parsePolarWebhookEvent,
  verifyPolarWebhookSignature,
} from "./polar-webhook.js";

describe("verifyPolarWebhookSignature", () => {
  it("accepts valid Standard Webhooks signatures", async () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ type: "subscription.active", data: {} });
    const webhookId = "msg_123";
    const webhookTimestamp = "1710000000";
    const signature = createHmac("sha256", secret)
      .update(`${webhookId}.${webhookTimestamp}.${body}`)
      .digest("base64");

    expect(
      await verifyPolarWebhookSignature(
        secret,
        body,
        webhookId,
        webhookTimestamp,
        `v1,${signature}`,
      ),
    ).toBe(true);
  });

  it("rejects invalid signatures", async () => {
    expect(
      await verifyPolarWebhookSignature("secret", "{}", "id", "123", "v1,bad"),
    ).toBe(false);
  });
});

describe("parsePolarWebhookEvent", () => {
  it("parses webhook JSON", () => {
    const event = parsePolarWebhookEvent(
      JSON.stringify({ type: "subscription.active", data: { id: "sub_1" } }),
    );
    expect(event.type).toBe("subscription.active");
    expect(event.data.id).toBe("sub_1");
  });
});
