export type ParsedIssueUrl = {
  owner: string;
  repo: string;
  issueNumber: number;
};

const ISSUE_URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/i;

export function parseGitHubIssueUrl(url: string): ParsedIssueUrl | null {
  const match = ISSUE_URL_RE.exec(url.trim());
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    issueNumber: Number.parseInt(match[3], 10),
  };
}

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  assignees: Array<{ login: string }>;
  labels: Array<{ name: string }>;
  html_url: string;
};

export type GitHubRepo = {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  size: number;
  archived: boolean;
  created_at: string;
  pushed_at: string | null;
  open_issues_count: number;
};

export type GitHubOwner = {
  login: string;
  type: string;
};

export type IssueListItem = {
  number: number;
  title: string;
  created_at: string;
  state: string;
};

export type AssessGitHubContext = {
  parsed: ParsedIssueUrl;
  issue: GitHubIssue;
  repo: GitHubRepo;
  owner: GitHubOwner;
  openIssues: IssueListItem[];
  contributingText: string | null;
};

export type GitHubClientOptions = {
  token?: string;
};

export class GitHubClient {
  private readonly token?: string;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "assess-api/0.1",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`https://api.github.com${path}`, { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub ${response.status}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  private async fetchText(path: string): Promise<string | null> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.raw",
      "User-Agent": "assess-api/0.1",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`https://api.github.com${path}`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub ${response.status}: ${text.slice(0, 200)}`);
    }
    return response.text();
  }

  async loadAssessContext(url: string): Promise<AssessGitHubContext> {
    const parsed = parseGitHubIssueUrl(url);
    if (!parsed) {
      throw new Error("unsupported_url");
    }

    const [issue, repo, owner] = await Promise.all([
      this.fetchJson<GitHubIssue>(
        `/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.issueNumber}`,
      ),
      this.fetchJson<GitHubRepo>(`/repos/${parsed.owner}/${parsed.repo}`),
      this.fetchJson<GitHubOwner>(`/users/${parsed.owner}`),
    ]);

    const [openIssuesRaw, contributingText] = await Promise.all([
      this.fetchJson<Array<IssueListItem & { pull_request?: unknown }>>(
        `/repos/${parsed.owner}/${parsed.repo}/issues?state=open&per_page=100`,
      ),
      this.fetchText(`/repos/${parsed.owner}/${parsed.repo}/contents/CONTRIBUTING.md`),
    ]);

    const openIssues = openIssuesRaw
      .filter((item) => !item.pull_request)
      .map(({ number, title, created_at, state }) => ({
        number,
        title,
        created_at,
        state,
      }));

    return {
      parsed,
      issue,
      repo,
      owner,
      openIssues,
      contributingText,
    };
  }
}
