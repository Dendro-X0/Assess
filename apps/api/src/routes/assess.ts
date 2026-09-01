import { GitHubClient } from "@assess/github";
import { scoreSignals } from "@assess/scoring";
import type { Context } from "hono";
import { runAssessSignals } from "../allowlist.js";
import { randomHex } from "../crypto.js";
import type { AssessDb } from "../db.js";
import type { Env } from "../env.js";
import { getPlanLimits } from "../quota.js";

type AssessRequest = {
  mode: "opportunity" | "actor";
  url?: string;
  actor?: { github?: string };
  context?: string;
  options?: { includeEvidence?: boolean; locale?: string };
};

export async function handleAssess(
  c: Context,
  env: Env,
  db: AssessDb,
): Promise<Response> {
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return c.json({ error: "unauthorized", message: "Missing Bearer API key" }, 401);
  }

  const key = await db.verifyApiKey(token);
  if (!key) {
    return c.json({ error: "unauthorized", message: "Invalid API key" }, 401);
  }

  const rateLimit = getPlanLimits(key.plan).ratePerMinute;
  const recentRequests = await db.countRequestsLastMinute(key.id);
  if (recentRequests >= rateLimit) {
    return c.json(
      {
        error: "rate_limit_exceeded",
        message: `Rate limit of ${rateLimit} requests per minute exceeded`,
      },
      429,
    );
  }

  await db.recordRateEvent(key.id);

  const used = await db.countUsageThisMonth(key.id);
  if (used >= key.monthlyQuota) {
    return c.json(
      {
        error: "quota_exceeded",
        message: `Monthly quota of ${key.monthlyQuota} assesses exceeded`,
      },
      429,
    );
  }

  let body: AssessRequest;
  try {
    body = await c.req.json<AssessRequest>();
  } catch {
    return c.json({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }

  if (body.mode === "actor") {
    return c.json(
      {
        error: "not_implemented",
        message: "Actor mode is planned for a later release",
      },
      501,
    );
  }

  if (!body.url) {
    return c.json({ error: "bad_request", message: "url is required for opportunity mode" }, 400);
  }

  const includeEvidence = body.options?.includeEvidence !== false;
  const assessId = `asr_${randomHex(8)}`;

  try {
    const client = new GitHubClient({ token: env.githubToken });
    const ctx = await client.loadAssessContext(body.url);
    const signals = runAssessSignals(ctx);
    const scored = scoreSignals(signals);

    const response = {
      id: assessId,
      mode: "opportunity" as const,
      verdict: scored.verdict,
      score: scored.score,
      confidence: scored.confidence,
      reason: scored.reason,
      signals: signals.map((signal) => ({
        ...signal,
        evidence: includeEvidence ? signal.evidence : undefined,
      })),
      limits: [
        "public_github_only",
        "heuristic_not_legal_determination",
        "payout_not_guaranteed",
      ],
      fetchedAt: new Date().toISOString(),
    };

    await db.recordUsage(key.id, assessId);
    return c.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    if (message === "unsupported_url") {
      return c.json({ error: "bad_request", message: "Unsupported GitHub issue URL" }, 400);
    }

    return c.json({
      id: assessId,
      mode: "opportunity",
      verdict: "unchecked",
      score: 0,
      confidence: "low",
      signals: [],
      limits: [
        "public_github_only",
        "heuristic_not_legal_determination",
        "payout_not_guaranteed",
      ],
      fetchedAt: new Date().toISOString(),
      error: message,
    });
  }
}
