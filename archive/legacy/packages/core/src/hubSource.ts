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
  offline?: boolean;
  refresh?: boolean;
  maxStaleMs?: number;
  branch?: string;
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

function cacheStateFile(repoDir: string): string {
  return path.join(path.dirname(repoDir), ".state.json");
}

function readCacheState(repoDir: string): { lastFetchedAt?: string } {
  const f = cacheStateFile(repoDir);
  if (!fs.existsSync(f)) return {};
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as { lastFetchedAt?: string };
  } catch {
    return {};
  }
}

function writeCacheState(repoDir: string, state: { lastFetchedAt: string }): void {
  fs.writeFileSync(cacheStateFile(repoDir), JSON.stringify(state, null, 2), "utf8");
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
    const cloneArgs = opts.branch ? ["clone", "-b", opts.branch, hubRef, repoDir] : ["clone", hubRef, repoDir];
    const cloned = execGit(cloneArgs);
    if (cloned.status !== 0) throwGitFailure("clone", hubRef, cloned);
    // test doubles may skip side effects; create .git marker so subsequent calls behave consistently
    ensureDir(path.join(repoDir, ".git"));
    writeCacheState(repoDir, { lastFetchedAt: new Date().toISOString() });
  } else if (opts.updateRemote && !opts.offline) {
    const state = readCacheState(repoDir);
    const shouldRefresh =
      opts.refresh ||
      !state.lastFetchedAt ||
      !opts.maxStaleMs ||
      Date.now() - new Date(state.lastFetchedAt).getTime() > opts.maxStaleMs;
    if (!shouldRefresh) return repoDir;

    const fetched = execGit(["-C", repoDir, "fetch", "--all", "--prune"]);
    if (fetched.status !== 0) throwGitFailure("fetch", hubRef, fetched);

    if (opts.branch) {
      const checkout = execGit(["-C", repoDir, "checkout", opts.branch]);
      if (checkout.status !== 0) throwGitFailure("checkout", hubRef, checkout);
      const pulled = execGit(["-C", repoDir, "pull", "--ff-only", "origin", opts.branch]);
      if (pulled.status !== 0) throwGitFailure("pull", hubRef, pulled);
    } else {
      const branchOut = execGit(["-C", repoDir, "rev-parse", "--abbrev-ref", "HEAD"]);
      const branch = branchOut.status === 0 ? branchOut.stdout.trim() : "";
      if (branch && branch !== "HEAD") {
        const pulled = execGit(["-C", repoDir, "pull", "--ff-only", "origin", branch]);
        if (pulled.status !== 0) throwGitFailure("pull", hubRef, pulled);
      }
    }
    writeCacheState(repoDir, { lastFetchedAt: new Date().toISOString() });
  }

  return repoDir;
}

export interface HubGitPushOptions {
  message: string;
  branch?: string;
  gitExec?: GitExec;
}

export interface PushLocalHubToRemoteOptions {
  remote: string;
  branch?: string;
  message?: string;
  /** When true, skip push if working tree is clean and remote already has commits (default false). */
  allowEmpty?: boolean;
  /** Integrate remote commits before push (default: rebase). Use "none" to fail on non-ff. */
  integrate?: "rebase" | "merge" | "none";
  gitExec?: GitExec;
}

export interface PushLocalHubToRemoteResult {
  committed: boolean;
  pushed: boolean;
  branch: string;
  remote: string;
}

function gitConfigValue(execGit: GitExec, cwd: string, key: string): string | null {
  const r = execGit(["config", "--get", key], cwd);
  if (r.status !== 0) return null;
  const value = r.stdout.trim();
  return value || null;
}

function gitOrThrow(execGit: GitExec, cwd: string, args: string[], action: string): string {
  const r = execGit(args, cwd);
  const out = `${r.stdout}${r.stderr}`.trim();
  if (r.status !== 0) throw new Error(`failed to ${action}: git ${args.join(" ")}${out ? `\n${out}` : ""}`);
  return out;
}

/**
 * Initialize (if needed), commit, and push a locally generated hub directory to a Git remote (e.g. GitHub).
 * Used after `hxhub seed` without `--submit`, or for maintainer first-time publish of a local hub clone.
 * By default fetches remote and rebases local commits onto origin/<branch> before pushing (non-ff safe).
 */
export function pushLocalHubToRemote(hubRoot: string, opts: PushLocalHubToRemoteOptions): PushLocalHubToRemoteResult {
  const execGit = opts.gitExec ?? runGit;
  const hubDir = path.resolve(hubRoot);
  if (!fs.existsSync(hubDir)) throw new Error(`hub directory not found: ${hubDir}`);

  const remote = opts.remote.trim();
  if (!remote) throw new Error("--remote <git-url> is required (e.g. git@github.com:your-org/hx-hub.git)");

  const branch = opts.branch ?? "main";
  const message = opts.message ?? "chore: hub update";
  const integrate = opts.integrate ?? "rebase";

  if (!fs.existsSync(path.join(hubDir, ".git"))) {
    gitOrThrow(execGit, hubDir, ["init"], "initialize git repository");
  }

  const remoteExists = execGit(["remote", "get-url", "origin"], hubDir);
  if (remoteExists.status === 0) {
    const existing = remoteExists.stdout.trim();
    if (existing !== remote) {
      throw new Error(`origin already exists with a different URL (${existing}); expected ${remote}`);
    }
  } else {
    gitOrThrow(execGit, hubDir, ["remote", "add", "origin", remote], "add origin remote");
  }

  const status = execGit(["status", "--porcelain"], hubDir);
  if (status.status !== 0) throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  const dirty = status.stdout.trim().length > 0;

  let committed = false;
  if (dirty) {
    gitOrThrow(execGit, hubDir, ["add", "."], "stage hub files");
    const gitName = gitConfigValue(execGit, hubDir, "user.name");
    const gitEmail = gitConfigValue(execGit, hubDir, "user.email");
    const commitArgs = ["commit", "-m", message];
    if (!gitName) commitArgs.unshift("-c", "user.name=HarnessX Hub Bot");
    if (!gitEmail) commitArgs.unshift("-c", "user.email=harnessx-hub-bot@local");
    const commit = execGit(commitArgs, hubDir);
    if (commit.status !== 0) {
      const out = `${commit.stdout}${commit.stderr}`;
      if (!/nothing to commit|no changes added/i.test(out)) throw new Error(`failed to create commit${out.trim() ? `\n${out.trim()}` : ""}`);
    } else {
      committed = true;
    }
  } else if (!opts.allowEmpty) {
    // Still push — remote may be behind or first push with existing commit
  }

  gitOrThrow(execGit, hubDir, ["branch", "-M", branch], "set default branch");

  execGit(["fetch", "origin", branch], hubDir);
  const remoteHead = execGit(["rev-parse", `origin/${branch}`], hubDir);
  const localHead = execGit(["rev-parse", "HEAD"], hubDir);
  const mergeBase = remoteHead.status === 0 ? execGit(["merge-base", "HEAD", `origin/${branch}`], hubDir) : { status: 1, stdout: "", stderr: "" };
  const behind =
    remoteHead.status === 0 &&
    localHead.status === 0 &&
    remoteHead.stdout.trim() !== localHead.stdout.trim() &&
    (mergeBase.status !== 0 || mergeBase.stdout.trim() !== remoteHead.stdout.trim());

  if (behind && integrate !== "none" && remoteHead.status === 0) {
    const unrelated = mergeBase.status !== 0;
    if (integrate === "rebase") {
      const rebase = execGit(["rebase", `origin/${branch}`], hubDir);
      if (rebase.status !== 0) {
        execGit(["rebase", "--abort"], hubDir);
        // Fall back to merge for unrelated or conflicted histories
        const mergeArgs = unrelated
          ? ["merge", "--allow-unrelated-histories", "--no-edit", `origin/${branch}`]
          : ["merge", "--no-edit", `origin/${branch}`];
        const merge = execGit(mergeArgs, hubDir);
        if (merge.status !== 0) {
          throw new Error(
            `failed to integrate remote ${branch} before push:\n${(rebase.stderr || rebase.stdout).trim()}\n${(merge.stderr || merge.stdout).trim()}\n` +
              `Resolve conflicts in ${hubDir}, then re-run hxhub push-github.`
          );
        }
      }
    } else {
      const mergeArgs = unrelated
        ? ["merge", "--allow-unrelated-histories", "--no-edit", `origin/${branch}`]
        : ["merge", "--no-edit", `origin/${branch}`];
      const merge = execGit(mergeArgs, hubDir);
      if (merge.status !== 0) {
        throw new Error(
          `failed to merge origin/${branch} before push:\n${(merge.stderr || merge.stdout).trim()}\n` +
            `Resolve conflicts in ${hubDir}, then re-run hxhub push-github.`
        );
      }
    }
  }

  const push = execGit(["push", "-u", "origin", branch], hubDir);
  if (push.status !== 0) {
    const detail = (push.stderr || push.stdout || "").trim();
    const authHint =
      isGitHubHubRef(remote) &&
      /Permission denied \(publickey\)|Authentication failed|Could not read from remote repository/i.test(detail)
        ? `\nSSH authentication failed. Verify: ssh -T git@github.com`
        : "";
    const integrateHint =
      /fetch first|non-fast-forward|rejected/i.test(detail) && integrate === "none"
        ? `\nTip: use default --integrate rebase (or merge) onto origin/${branch}, or: git -C ${hubDir} pull --rebase origin ${branch}`
        : "";
    throw new Error(`git push failed: ${detail}${authHint}${integrateHint}`);
  }

  return { committed, pushed: true, branch, remote };
}

/** Commit and push hub repo changes (for maintainer workflows). */
export function hubGitPush(hubRoot: string, opts: HubGitPushOptions): { committed: boolean; pushed: boolean } {
  const execGit = opts.gitExec ?? runGit;
  if (!fs.existsSync(path.join(hubRoot, ".git"))) {
    throw new Error(`hub directory is not a git repository: ${hubRoot}`);
  }
  const status = execGit(["-C", hubRoot, "status", "--porcelain"]);
  if (status.status !== 0) throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  const dirty = status.stdout.trim().length > 0;
  let committed = false;
  if (dirty) {
    const add = execGit(["-C", hubRoot, "add", "."]);
    if (add.status !== 0) throw new Error(`git add failed: ${add.stderr || add.stdout}`);
    const commit = execGit(["-C", hubRoot, "commit", "-m", opts.message]);
    if (commit.status !== 0) {
      const out = `${commit.stdout}${commit.stderr}`;
      if (!/nothing to commit|no changes added/i.test(out)) throw new Error(`git commit failed: ${out}`);
    } else {
      committed = true;
    }
  }
  const branch =
    opts.branch ||
    (() => {
      const b = execGit(["-C", hubRoot, "rev-parse", "--abbrev-ref", "HEAD"]);
      return b.status === 0 ? b.stdout.trim() : "main";
    })();
  const push = execGit(["-C", hubRoot, "push", "-u", "origin", branch]);
  if (push.status !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);
  return { committed, pushed: true };
}

export function gcHubRemoteCache(workspaceRoot: string, olderThanMs = 30 * 24 * 3600_000): string[] {
  const root = path.join(workspaceRoot, "harnessX", ".hub-remotes");
  if (!fs.existsSync(root)) return [];
  const removed: string[] = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    const state = readCacheState(path.join(dir, "repo"));
    const t = state.lastFetchedAt ? new Date(state.lastFetchedAt).getTime() : 0;
    if (!t || Date.now() - t > olderThanMs) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    }
  }
  return removed;
}
