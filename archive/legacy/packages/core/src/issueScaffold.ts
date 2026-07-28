import fs from "node:fs";
import { Workspace } from "./paths.js";
import { createChange, scaffoldProposal, type CreateChangeResult } from "./change.js";

/**
 * v0.2 P2: Scaffold a change workspace from a GitHub issue URL.
 */

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  html_url: string;
  labels: string[];
}

const ISSUE_URL_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/;

export function parseIssueUrl(url: string): { owner: string; repo: string; number: number } {
  const m = url.trim().match(ISSUE_URL_RE);
  if (!m) throw new Error(`invalid GitHub issue URL: ${url}`);
  return { owner: m[1]!, repo: m[2]!, number: parseInt(m[3]!, 10) };
}

export function slugFromTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "issue"
  );
}

export async function fetchGitHubIssue(url: string): Promise<GitHubIssue> {
  const { owner, repo, number } = parseIssueUrl(url);
  const api = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
  const res = await fetch(api, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "HarnessX/0.2" }
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    labels: { name: string }[];
  };
  return {
    number: data.number,
    title: data.title,
    body: data.body ?? "",
    html_url: data.html_url,
    labels: data.labels.map((l) => l.name)
  };
}

export interface ScaffoldFromIssueOptions {
  id?: string;
  domains?: string[];
  profile?: string;
  issueUrl: string;
}

export interface ScaffoldFromIssueResult extends CreateChangeResult {
  issue: GitHubIssue;
  changeId: string;
  proposalFile: string;
  deltaFile: string;
}

export async function scaffoldFromIssue(ws: Workspace, opts: ScaffoldFromIssueOptions): Promise<ScaffoldFromIssueResult> {
  const issue = await fetchGitHubIssue(opts.issueUrl);
  const changeId = opts.id ?? `${slugFromTitle(issue.title)}-${issue.number}`;
  const domains = opts.domains?.length ? opts.domains : issue.labels.length ? issue.labels.map((l) => slugFromTitle(l)).slice(0, 3) : ["core"];

  const created = createChange(ws, changeId, domains, opts.profile);
  const scaffold = scaffoldProposal(ws, changeId, issue.title);

  // Enrich proposal with issue context
  const proposalPath = scaffold.proposalFile;
  const body = [
    fs.readFileSync(proposalPath, "utf8"),
    "",
    "## Source Issue",
    "",
    `- **Issue:** [#${issue.number}](${issue.html_url})`,
    `- **Title:** ${issue.title}`,
    "",
    issue.body ? `### Issue Description\n\n${issue.body}` : ""
  ].join("\n");
  fs.writeFileSync(proposalPath, body, "utf8");

  return { ...created, issue, changeId, proposalFile: scaffold.proposalFile, deltaFile: scaffold.deltaFile };
}
