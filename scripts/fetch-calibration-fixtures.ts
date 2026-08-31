import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { GitHubClient, parseGitHubIssueUrl } from "@assess/github";

config({ path: resolve(process.cwd(), ".env") });

type LabelRow = {
  url: string;
  human_verdict: string;
  notes: string;
  expected_signals: string[];
};

type CalibrationFixture = {
  meta: LabelRow & { slug: string; fetchedAt: string };
  context: Awaited<ReturnType<GitHubClient["loadAssessContext"]>>;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABELS_PATH = resolve(ROOT, "fixtures/calibration/labels.seed.csv");
const OUT_DIR = resolve(ROOT, "fixtures/calibration/contexts");

function parseCsv(text: string): LabelRow[] {
  const lines = text.trim().split("\n");
  const [, ...rows] = lines;
  return rows.map((line) => {
    const parts = line.split(",");
    const url = parts[0];
    const human_verdict = parts[1];
    const notes = parts[3] ? parts.slice(3, parts.length - 3).join(",") : parts[2] ?? "";
    const expectedRaw = parts[parts.length - 3] ?? "";
    const expected_signals = expectedRaw
      ? expectedRaw.split(";").map((s) => s.trim()).filter(Boolean)
      : [];
    return { url, human_verdict, notes, expected_signals };
  });
}

function slugFromUrl(url: string): string {
  const parsed = parseGitHubIssueUrl(url);
  if (!parsed) return basename(url).replace(/\W+/g, "-");
  return `${parsed.owner}-${parsed.repo}-${parsed.issueNumber}`.toLowerCase();
}

function parseCsvRobust(text: string): LabelRow[] {
  const lines = text.trim().split("\n").slice(1);
  return lines.map((line) => {
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cols.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    cols.push(current);

    return {
      url: cols[0],
      human_verdict: cols[1],
      notes: cols[2] ?? "",
      expected_signals: (cols[4] ?? "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  });
}

async function main() {
  const onlySlug = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1];
  const csv = readFileSync(LABELS_PATH, "utf8");
  const rows = parseCsvRobust(csv);
  mkdirSync(OUT_DIR, { recursive: true });

  const client = new GitHubClient({ token: process.env.GITHUB_TOKEN });
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const slug = slugFromUrl(row.url);
    if (onlySlug && slug !== onlySlug) continue;

    const outPath = join(OUT_DIR, `${slug}.json`);
    if (existsSync(outPath) && process.argv.includes("--skip-existing")) {
      console.log(`skip ${slug}`);
      continue;
    }

    try {
      console.log(`fetch ${slug} …`);
      const context = await client.loadAssessContext(row.url);
      const fixture: CalibrationFixture = {
        meta: {
          ...row,
          slug,
          fetchedAt: new Date().toISOString(),
        },
        context,
      };
      writeFileSync(outPath, JSON.stringify(fixture, null, 2));
      ok += 1;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (error) {
      fail += 1;
      console.error(`FAIL ${slug}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`done: ${ok} ok, ${fail} failed → ${OUT_DIR}`);
}

main();
