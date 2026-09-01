import type { Env } from "./env.js";

export type CloudflareBindings = {
  DB: D1Database;
  API_KEY_PEPPER: string;
  GITHUB_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_CHECKOUT_URL?: string;
  CORS_ORIGINS?: string;
  SIGNUP_RATE_PER_HOUR?: string;
  DEV_API_KEY?: string;
};

export function loadEnvFromBindings(bindings: CloudflareBindings): Env {
  const corsRaw =
    bindings.CORS_ORIGINS ?? "http://localhost:5173,https://localhost:5173";

  if (!bindings.API_KEY_PEPPER) {
    throw new Error("API_KEY_PEPPER binding is required");
  }

  return {
    port: 8787,
    githubToken: bindings.GITHUB_TOKEN || undefined,
    databaseUrl: "d1",
    apiKeyPepper: bindings.API_KEY_PEPPER,
    devApiKey: bindings.DEV_API_KEY || undefined,
    polarWebhookSecret: bindings.POLAR_WEBHOOK_SECRET || undefined,
    polarCheckoutUrl: bindings.POLAR_CHECKOUT_URL || undefined,
    corsOrigins: corsRaw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    signupRatePerHour: Number.parseInt(bindings.SIGNUP_RATE_PER_HOUR ?? "5", 10),
  };
}
