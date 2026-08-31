import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { GitHubClient, parseGitHubIssueUrl } from "@assess/github";
import { loadAllowlist, loadDenylist, runMvpSignals } from "@assess/signals";
import { scoreSignals } from "@assess/scoring";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(ROOT, ".env") });

function readList(name: string): string[] {
  const path = resolve(ROOT, `data/${name}`);
  return readFileSync(path, "utf8").split("\n");
}

function fixtureSlug(url: string): string | null {
  const parsed = parseGitHubIssueUrl(url);
  if (!parsed) return null;
  return `${parsed.owner}-${parsed.repo}-${parsed.issueNumber}`.toLowerCase();
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: pnpm assess-local <github-issue-url>");
    process.exit(1);
  }

  const slug = fixtureSlug(url);
  const fixturePath =
    slug && join(ROOT, "fixtures/calibration/contexts", `${slug}.json`);

  let source: "fixture" | "github" = "github";
  let context;

  if (fixturePath && existsSync(fixturePath)) {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      context: Parameters<typeof runMvpSignals>[0];
    };
    context = fixture.context;
    source = "fixture";
  } else {
    const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });
    context = await client.loadAssessContext(url);
  }

  const allowlist = loadAllowlist(readList("allowlist.txt"));
  const denylist = loadDenylist(readList("denylist.txt"));
  const signals = runMvpSignals(context, allowlist, denylist);
  const scored = scoreSignals(signals);

  const output = {
    source,
    url,
    verdict: scored.verdict,
    score: scored.score,
    confidence: scored.confidence,
    reason: scored.reason,
    signals: signals.map((signal) => ({
      id: signal.id,
      fired: signal.fired,
      weight: signal.weight,
      summary: signal.summary,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
