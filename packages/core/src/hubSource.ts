import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir } from "./paths.js";

export interface GitExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type GitExec = (args: string[], cwd?: string) => GitExecResult;

export interface ResolveHubSourceOptions {
  updateRemote?: boolean;
  gitExec?: GitExec;
}

/** True when the hub ref looks like a remote Git URL rather than a local path. */
export function isGitHubHubRef(hubRef: string): boolean {
  return (
    /^git@github\.com:[^/]+\/[^/]+(?:\.git)?$/i.test(hubRef) ||
    /^ssh:\/\/git@github\.com\/[^/]+\/[^/]+(?:\.git)?$/i.test(hubRef) ||
    /^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/i.test(hubRef)
  );
}

export function hubRemoteCacheDir(workspaceRoot: string, hubRef: string): string {
  const hash = crypto.createHash("sha256").update(hubRef).digest("hex").slice(0, 16);
  return path.join(workspaceRoot, "harnessX", ".hub-remotes", hash, "repo");
}

function runGit(args: string[], cwd?: string): GitExecResult {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function throwGitFailure(action: string, hubRef: string, out: GitExecResult): never {
  const detail = (out.stderr || out.stdout || "").trim();
  const httpsHint = hubRef.startsWith("https://github.com/")
    ? `\nTip: for private repos, prefer SSH URL: git@github.com:<org>/<repo>.git`
    : "";
  const authHint =
    /Permission denied \(publickey\)|Authentication failed|Could not read from remote repository/i.test(detail)
      ? `\nSSH authentication failed for private repository.\n` +
        `- Ensure SSH key is loaded and has repo access.\n` +
        `- Verify with: ssh -T git@github.com`
      : "";
  throw new Error(`failed to ${action} hub repo "${hubRef}"${detail ? `: ${detail}` : ""}${authHint}${httpsHint}`);
}

/** Resolves `hub` setting (local path or GitHub URL) to a local directory. */
export function resolveHubSource(workspaceRoot: string, hubRef: string, opts: ResolveHubSourceOptions = {}): string {
  if (!isGitHubHubRef(hubRef)) return path.resolve(hubRef);

  const execGit = opts.gitExec ?? runGit;
  const repoDir = hubRemoteCacheDir(workspaceRoot, hubRef);
  ensureDir(path.dirname(repoDir));

  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    const cloned = execGit(["clone", hubRef, repoDir]);
    if (cloned.status !== 0) throwGitFailure("clone", hubRef, cloned);
    // test doubles may skip side effects; create .git marker so subsequent calls behave consistently
    ensureDir(path.join(repoDir, ".git"));
  } else if (opts.updateRemote) {
    const fetched = execGit(["-C", repoDir, "fetch", "--all", "--prune"]);
    if (fetched.status !== 0) throwGitFailure("fetch", hubRef, fetched);

    const branchOut = execGit(["-C", repoDir, "rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchOut.status === 0 ? branchOut.stdout.trim() : "";
    if (branch && branch !== "HEAD") {
      const pulled = execGit(["-C", repoDir, "pull", "--ff-only", "origin", branch]);
      if (pulled.status !== 0) throwGitFailure("pull", hubRef, pulled);
    }
  }

  return repoDir;
}
