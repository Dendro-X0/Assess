import { loadAllowlist, loadDenylist, runMvpSignals } from "@assess/signals";
import allowlistText from "./data/allowlist.txt";
import denylistText from "./data/denylist.txt";

const allowlist = loadAllowlist(allowlistText.split("\n"));
const denylist = loadDenylist(denylistText.split("\n"));

export function runAssessSignals(ctx: Parameters<typeof runMvpSignals>[0]) {
  return runMvpSignals(ctx, allowlist, denylist);
}
