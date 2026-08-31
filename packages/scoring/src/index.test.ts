import { describe, expect, it } from "vitest";
import type { SignalResult } from "@assess/signals";
import { scoreSignals } from "./index.js";

function signal(id: string, fired: boolean, weight: number): SignalResult {
  return {
    id,
    code: id,
    severity: "critical",
    polarity: weight > 0 ? "positive" : "negative",
    fired,
    weight: fired ? weight : 0,
    summary: id,
  };
}

describe("scoreSignals", () => {
  it("avoids honeypot + exfil", () => {
    const result = scoreSignals([
      signal("AF-01", true, -40),
      signal("AF-04", true, -50),
    ]);
    expect(result.verdict).toBe("avoid");
    expect(result.score).toBe(0);
  });

  it("overrides on claimed issue", () => {
    const result = scoreSignals([signal("AF-05", true, -30)]);
    expect(result.verdict).toBe("avoid");
    expect(result.reason).toBe("already_claimed");
  });
});
