import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

export type Env = {
  port: number;
  githubToken?: string;
  databaseUrl: string;
  apiKeyPepper: string;
  devApiKey?: string;
  polarWebhookSecret?: string;
  polarCheckoutUrl?: string;
  corsOrigins: string[];
  signupRatePerHour: number;
};

export function loadEnv(): Env {
  const corsRaw = process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174";
  return {
    port: Number.parseInt(process.env.PORT ?? "8787", 10),
    githubToken: process.env.GITHUB_TOKEN || undefined,
    databaseUrl: process.env.DATABASE_URL ?? "./data/assess.db",
    apiKeyPepper: process.env.API_KEY_PEPPER ?? "dev-pepper",
    devApiKey: process.env.DEV_API_KEY || undefined,
    polarWebhookSecret: process.env.POLAR_WEBHOOK_SECRET || undefined,
    polarCheckoutUrl: process.env.POLAR_CHECKOUT_URL || undefined,
    corsOrigins: corsRaw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    signupRatePerHour: Number.parseInt(process.env.SIGNUP_RATE_PER_HOUR ?? "5", 10),
  };
}
