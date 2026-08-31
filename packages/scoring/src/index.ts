import type { SignalResult } from "@assess/signals";

export type Verdict = "proceed" | "caution" | "avoid" | "unchecked";

export type ScoreResult = {
  score: number;
  verdict: Verdict;
  confidence: "low" | "med" | "high";
  reason?: string;
};

const CRITICAL_NEGATIVE = new Set(["AF-01", "AF-02", "AF-04"]);

export function scoreSignals(signals: SignalResult[]): ScoreResult {
  const fired = signals.filter((s) => s.fired && s.weight !== 0);

  const af05 = signals.find((s) => s.id === "AF-05");
  if (af05?.fired) {
    return {
      score: 20,
      verdict: "avoid",
      confidence: confidenceFromSignals(fired),
      reason: "already_claimed",
    };
  }

  const raw = 70 + fired.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.max(0, Math.min(100, raw));

  const criticalFired = fired.filter(
    (s) => CRITICAL_NEGATIVE.has(s.id) && s.polarity === "negative",
  );
  const hasUnmitigatedCritical = criticalFired.some((s) => {
    if (s.id === "AF-02") {
      return s.weight <= -30;
    }
    return true;
  });

  if (hasUnmitigatedCritical || score < 35) {
    return { score, verdict: "avoid", confidence: confidenceFromSignals(fired) };
  }

  if (score >= 60) {
    return { score, verdict: "proceed", confidence: confidenceFromSignals(fired) };
  }

  return { score, verdict: "caution", confidence: confidenceFromSignals(fired) };
}

function confidenceFromSignals(fired: SignalResult[]): "low" | "med" | "high" {
  const withEvidence = fired.filter((s) => s.evidence && Object.keys(s.evidence).length > 0);
  if (withEvidence.length >= 3) return "high";
  if (withEvidence.length >= 1) return "med";
  return "low";
}
