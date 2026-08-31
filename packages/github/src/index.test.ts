import { describe, expect, it } from "vitest";
import { parseGitHubIssueUrl } from "./index.js";

describe("parseGitHubIssueUrl", () => {
  it("parses standard issue URLs", () => {
    expect(
      parseGitHubIssueUrl("https://github.com/owner/repo/issues/42"),
    ).toEqual({
      owner: "owner",
      repo: "repo",
      issueNumber: 42,
    });
  });

  it("rejects non-issue URLs", () => {
    expect(parseGitHubIssueUrl("https://github.com/owner/repo")).toBeNull();
  });
});
