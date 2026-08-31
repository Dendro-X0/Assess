import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAllowlist, loadDenylist, runMvpSignals } from "@assess/signals";

let cachedAllow: ReturnType<typeof loadAllowlist> | null = null;
let cachedDeny: ReturnType<typeof loadDenylist> | null = null;

function readListFile(name: string) {
  const paths = [
    resolve(process.cwd(), `data/${name}`),
    resolve(process.cwd(), `../../data/${name}`),
  ];
  for (const path of paths) {
    try {
      return readFileSync(path, "utf8").split("\n");
    } catch {
      // try next
    }
  }
  return [];
}

export function getAllowlist() {
  if (!cachedAllow) cachedAllow = loadAllowlist(readListFile("allowlist.txt"));
  return cachedAllow;
}

export function getDenylist() {
  if (!cachedDeny) cachedDeny = loadDenylist(readListFile("denylist.txt"));
  return cachedDeny;
}

export function runAssessSignals(ctx: Parameters<typeof runMvpSignals>[0]) {
  return runMvpSignals(ctx, getAllowlist(), getDenylist());
}
