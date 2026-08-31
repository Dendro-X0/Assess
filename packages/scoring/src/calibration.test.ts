import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AssessGitHubContext } from "@assess/github";
import { loadAllowlist, loadDenylist, runMvpSignals } from "@assess/signals";
import { describe, expect, it } from "vitest";
import { scoreSignals } from "./index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURES_DIR = join(ROOT, "fixtures/calibration/contexts");

type CalibrationFixture = {
  meta: {
    url: string;
    human_verdict: "proceed" | "caution" | "avoid";
    expected_signals: string[];
    slug: string;
  };
  context: AssessGitHubContext;
};

function loadLists() {
  const allowlist = loadAllowlist(
    readFileSync(join(ROOT, "data/allowlist.txt"), "utf8").split("\n"),
  );
  const denylist = loadDenylist(
    readFileSync(join(ROOT, "data/denylist.txt"), "utf8").split("\n"),
  );
  return { allowlist, denylist };
}

function assessFixture(fixture: CalibrationFixture) {
  const { allowlist, denylist } = loadLists();
  const signals = runMvpSignals(fixture.context, allowlist, denylist);
  const scored = scoreSignals(signals);
  return { signals, scored };
}

function isHardPass(
  human: CalibrationFixture["meta"]["human_verdict"],
  model: string,
): boolean {
  if (human === "avoid") return model !== "proceed";
  return true;
}

function isSoftMatch(human: CalibrationFixture["meta"]["human_verdict"], model: string): boolean {
  if (human === model) return true;
  if (human === "proceed" && model === "caution") return true;
  if (human === "caution" && (model === "proceed" || model === "avoid")) return true;
  if (human === "avoid" && model === "caution") return true;
  return false;
}

function expectedSignalsHit(
  expected: string[],
  signals: ReturnType<typeof runMvpSignals>,
): string[] {
  const firedIds = new Set(signals.filter((s) => s.fired).map((s) => s.id));
  return expected.filter((id) => firedIds.has(id));
}

function loadFixtures(): CalibrationFixture[] {
  try {
    return readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as CalibrationFixture);
  } catch {
    return [];
  }
}

const fixtures = loadFixtures();

describe("calibration golden fixtures", () => {
  if (fixtures.length === 0) {
    it.skip("no fixtures — run pnpm fixtures:fetch", () => {});
    return;
  }

  const results = fixtures.map((fixture) => {
    const { signals, scored } = assessFixture(fixture);
    return {
      slug: fixture.meta.slug,
      human: fixture.meta.human_verdict,
      model: scored.verdict,
      score: scored.score,
      expected: fixture.meta.expected_signals,
      expectedHit: expectedSignalsHit(fixture.meta.expected_signals, signals),
      hardPass: isHardPass(fixture.meta.human_verdict, scored.verdict),
      softMatch: isSoftMatch(fixture.meta.human_verdict, scored.verdict),
    };
  });

  it("has fixtures loaded", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
  });

  for (const row of results) {
    it(`hard pass: ${row.slug} (human=${row.human} → model=${row.model})`, () => {
      expect(row.hardPass, `false proceed on avoid label`).toBe(true);
    });
  }

  it("reports calibration summary", () => {
    const hardFails = results.filter((r) => !r.hardPass);
    const softMatches = results.filter((r) => r.softMatch).length;
    const softRate = softMatches / results.length;

    console.log("\n--- calibration summary ---");
    console.log(`fixtures: ${results.length}`);
    console.log(`hard fails (avoid→proceed): ${hardFails.length}`);
    console.log(`soft match rate: ${(softRate * 100).toFixed(1)}%`);
    for (const row of results) {
      const sigPct =
        row.expected.length === 0
          ? "—"
          : `${row.expectedHit.length}/${row.expected.length}`;
      console.log(
        `  ${row.slug}: human=${row.human} model=${row.model} score=${row.score} signals=${sigPct}`,
      );
    }

    expect(hardFails.length).toBe(0);
    if (results.some((r) => r.human === "proceed" || r.human === "caution")) {
      expect(softRate).toBeGreaterThanOrEqual(0.7);
    }
  });
});
