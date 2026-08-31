import type { AssessGitHubContext } from "@assess/github";

export type SignalSeverity = "critical" | "high" | "med" | "low" | "positive";
export type SignalPolarity = "negative" | "positive" | "contextual";

export type SignalResult = {
  id: string;
  code: string;
  severity: SignalSeverity;
  polarity: SignalPolarity;
  fired: boolean;
  weight: number;
  summary: string;
  experimental?: boolean;
  evidence?: Record<string, unknown>;
};

export type Allowlist = Set<string>;

const BOUNTY_TITLE_RE =
  /(\$[\d,]+k?|\[ ?bounty|good first issue|bounty\s*\$)/i;
const REWARD_USD_RE = /\$\s*([\d,]+)\s*(k)?/gi;

export function parseRewardUsd(text: string): number | null {
  let max = 0;
  for (const match of text.matchAll(REWARD_USD_RE)) {
    const base = Number.parseInt(match[1].replace(/,/g, ""), 10);
    const value = match[2] ? base * 1000 : base;
    if (value > max) max = value;
  }
  return max > 0 ? max : null;
}

function daysBetween(from: string, to = new Date()): number {
  return Math.floor(
    (to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function bountyShaped(title: string): boolean {
  return BOUNTY_TITLE_RE.test(title);
}

export function detectAf01(ctx: AssessGitHubContext, denylist: Allowlist): SignalResult {
  const owner = ctx.owner.login.toLowerCase();
  const farmOrg = denylist.has(owner);
  const farmRepoName = /bount(y|ies)|bug-bounty/i.test(ctx.repo.name);
  const highOpenIssues = ctx.repo.open_issues_count >= 50;

  const shaped = ctx.openIssues.filter((issue) => bountyShaped(issue.title));
  const now = Date.now();
  const recent = shaped.filter((issue) => {
    const ageMs = now - new Date(issue.created_at).getTime();
    return ageMs <= 24 * 60 * 60 * 1000;
  });

  const bulkPattern = shaped.length >= 10 || recent.length >= 5;
  const farmBoardPattern =
    farmOrg || (farmRepoName && highOpenIssues && shaped.length >= 3);
  const densityPattern =
    shaped.length >= 3 && ctx.repo.open_issues_count >= 100;

  const fired = bulkPattern || farmBoardPattern || densityPattern;
  return {
    id: "AF-01",
    code: "honeypot_bulk_bounties",
    severity: "critical",
    polarity: "negative",
    fired,
    weight: fired ? -40 : 0,
    summary: fired
      ? "Repo hosts many bounty-shaped open issues, farm-board pattern, or known farm org."
      : "No bulk bounty honeypot pattern detected.",
    evidence: {
      bountyShapedOpenCount: shaped.length,
      recentBurstCount: recent.length,
      farmOrg,
      farmRepoName,
      openIssuesCount: ctx.repo.open_issues_count,
      bulkPattern,
      farmBoardPattern,
      densityPattern,
    },
  };
}

export function detectAf02(
  ctx: AssessGitHubContext,
  af11: SignalResult,
  af12: SignalResult,
): SignalResult {
  const text = `${ctx.issue.title}\n${ctx.issue.body ?? ""}`;
  const rewardUSD = parseRewardUsd(text);
  const repoAgeDays = daysBetween(ctx.repo.created_at);
  const weakRepo =
    ctx.repo.stargazers_count < 20 ||
    repoAgeDays < 14 ||
    (ctx.repo.size < 100 && ctx.repo.forks_count === 0);

  let fired = rewardUSD !== null && rewardUSD >= 1000 && weakRepo;
  let weight = fired ? -35 : 0;

  if (fired && af11.fired && af12.fired) {
    weight = -20;
  }

  return {
    id: "AF-02",
    code: "reward_repo_mismatch",
    severity: "critical",
    polarity: "negative",
    fired,
    weight,
    summary: fired
      ? "High advertised reward on a thin or very new repository."
      : "Reward and repo maturity look aligned enough.",
    evidence: {
      rewardUSD,
      stars: ctx.repo.stargazers_count,
      repoAgeDays,
      sizeKb: ctx.repo.size,
      forks: ctx.repo.forks_count,
      mitigated: fired && af11.fired && af12.fired,
    },
  };
}

const EXFIL_PHRASES = [
  "system prompt",
  "initialization payload",
  "session init",
  "runtime environment",
];

export function detectAf04(ctx: AssessGitHubContext): SignalResult {
  const corpus = [
    ctx.issue.body ?? "",
    ctx.contributingText ?? "",
  ].join("\n");

  const lower = corpus.toLowerCase();
  const phraseHits = EXFIL_PHRASES.filter((p) => lower.includes(p));
  const agentCommentBait =
    /<!--[\s\S]*?(automated|agent|llm)[\s\S]*?(paste|config|prompt)[\s\S]*?-->/i.test(
      corpus,
    );

  const fired = phraseHits.length > 0 || agentCommentBait;
  return {
    id: "AF-04",
    code: "prompt_exfil_bait",
    severity: "critical",
    polarity: "negative",
    fired,
    weight: fired ? -50 : 0,
    summary: fired
      ? "Issue or CONTRIBUTING text asks for prompts, session payloads, or agent runtime secrets."
      : "No prompt-exfiltration bait pattern detected.",
    evidence: { phraseHits, agentCommentBait },
  };
}

export function detectAf05(ctx: AssessGitHubContext): SignalResult {
  const body = ctx.issue.body ?? "";
  const reserved =
    /reserved for/i.test(body) ||
    /\|\s*reserved\s*\|/i.test(body) ||
    /algora.*reserved/i.test(body);
  const fired = ctx.issue.assignees.length > 0 || reserved;

  return {
    id: "AF-05",
    code: "claim_saturation",
    severity: "high",
    polarity: "negative",
    fired,
    weight: fired ? -30 : 0,
    summary: fired
      ? "Issue appears claimed, reserved, or saturated for new claimants."
      : "No strong claim-saturation signal.",
    evidence: {
      assigneeCount: ctx.issue.assignees.length,
      reserved,
    },
  };
}

export function detectAf06(ctx: AssessGitHubContext, af11: SignalResult): SignalResult {
  const issueAgeDays = daysBetween(ctx.issue.created_at);
  const daysSincePush = ctx.repo.pushed_at
    ? daysBetween(ctx.repo.pushed_at)
    : 999;
  const rewardPresent = parseRewardUsd(
    `${ctx.issue.title}\n${ctx.issue.body ?? ""}`,
  );

  const fired =
    ctx.repo.archived ||
    (rewardPresent !== null && daysSincePush > 180) ||
    (issueAgeDays > 365 && ctx.issue.state === "open");

  let weight = fired ? -20 : 0;
  if (fired && af11.fired) weight = -10;

  return {
    id: "AF-06",
    code: "stale_or_graveyard",
    severity: "med",
    polarity: "negative",
    fired,
    weight,
    summary: fired
      ? "Repository or issue looks stale relative to an open reward."
      : "No graveyard/stale pattern detected.",
    evidence: { issueAgeDays, daysSincePush, archived: ctx.repo.archived },
  };
}

export function detectAf07(
  ctx: AssessGitHubContext,
  af12: SignalResult,
): SignalResult {
  const text = `${ctx.issue.title}\n${ctx.issue.body ?? ""}`.toLowerCase();
  const rewardPresent = parseRewardUsd(text) !== null || /bounty|reward|\$\d/.test(text);
  const unfundedMarkers =
    /opire|contact (me )?for payment|exposure only|good first issue token|mrg token|diamond bounty/i.test(
      text,
    );
  const jokeShape = /calculate pi|technical poem|pixel art creative/i.test(
    ctx.issue.title,
  );

  const fired = rewardPresent && !af12.fired && (unfundedMarkers || jokeShape);
  let weight = fired ? -30 : 0;
  if (fired && af12.fired) weight = -15;

  return {
    id: "AF-07",
    code: "unfunded_or_no_escrow",
    severity: "high",
    polarity: "negative",
    fired,
    weight,
    summary: fired
      ? "Reward language without clear funded-platform markers."
      : "Funding markers present or reward not advertised.",
    evidence: { rewardPresent, unfundedMarkers, jokeShape },
  };
}

export function detectAf11(
  ctx: AssessGitHubContext,
  allowlist: Allowlist,
  denylist: Allowlist,
): SignalResult {
  const login = ctx.owner.login.toLowerCase();
  if (denylist.has(login)) {
    return {
      id: "AF-11",
      code: "reputable_owner_allowlist",
      severity: "positive",
      polarity: "positive",
      fired: false,
      weight: 0,
      summary: "Owner on farm-pattern denylist — no positive boost.",
      evidence: { denyHit: true },
    };
  }

  const legitimacyScore =
    (ctx.repo.stargazers_count >= 100 ? 30 : 0) +
    (daysBetween(ctx.repo.created_at) >= 180 ? 20 : 0) +
    (ctx.repo.forks_count >= 5 ? 15 : 0);

  const allowHit = allowlist.has(login);
  const legitimacyHit = legitimacyScore >= 65;
  const fired = allowHit || legitimacyHit;

  return {
    id: "AF-11",
    code: "reputable_owner_allowlist",
    severity: "positive",
    polarity: "positive",
    fired,
    weight: fired ? 25 : 0,
    summary: fired
      ? "Owner or repo passes allowlist or legitimacy floors."
      : "No strong reputable-owner signal.",
    evidence: { allowHit, legitimacyScore },
  };
}

export function detectAf12(ctx: AssessGitHubContext): SignalResult {
  const labels = ctx.issue.labels.map((l) => l.name.toLowerCase()).join(" ");
  const text = `${labels}\n${ctx.issue.body ?? ""}`.toLowerCase();

  const algoraTable = /\|\s*status\s*\|/i.test(ctx.issue.body ?? "");
  const immunefi = /immunefi\.com/i.test(text);
  const structuredAlgora =
    algoraTable || /https:\/\/console\.algora\.io/i.test(text);

  const bareWordOnly = /algora/.test(text) && !structuredAlgora;
  const fired = (structuredAlgora || immunefi) && !bareWordOnly;

  return {
    id: "AF-12",
    code: "funded_platform_track",
    severity: "positive",
    polarity: "positive",
    fired,
    weight: fired ? 20 : 0,
    summary: fired
      ? "Recognizable funded-platform markers present."
      : "No structured funded-platform markers detected.",
    evidence: { structuredAlgora, immunefi, bareWordOnly },
  };
}

export function runMvpSignals(
  ctx: AssessGitHubContext,
  allowlist: Allowlist,
  denylist: Allowlist = new Set(),
): SignalResult[] {
  const af11 = detectAf11(ctx, allowlist, denylist);
  const af12 = detectAf12(ctx);
  const af01 = detectAf01(ctx, denylist);
  const af02 = detectAf02(ctx, af11, af12);
  const af04 = detectAf04(ctx);
  const af05 = detectAf05(ctx);
  const af06 = detectAf06(ctx, af11);
  const af07 = detectAf07(ctx, af12);

  return [af01, af02, af04, af05, af06, af07, af11, af12];
}

export function loadAllowlist(lines: string[]): Allowlist {
  return loadListFile(lines);
}

export function loadDenylist(lines: string[]): Allowlist {
  return loadListFile(lines);
}

function loadListFile(lines: string[]): Allowlist {
  const set = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    set.add(trimmed.toLowerCase());
  }
  return set;
}
