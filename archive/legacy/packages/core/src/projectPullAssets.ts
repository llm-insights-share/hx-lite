import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { spawnSync } from "node:child_process";
import { Workspace, writeYaml } from "./paths.js";
import { ConfigYaml } from "./schemas.js";

export const PROJECT_ASSET_PATH_PREFIXES = [
  "harnessX/assets/",
  "harnessX/.hub-cache/"
] as const;

export const PROJECT_ASSET_EXACT_PATHS = ["harnessX/harness.yaml", "harnessX/harness.lock"] as const;

export function isProjectAssetPath(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  if ((PROJECT_ASSET_EXACT_PATHS as readonly string[]).includes(n)) return true;
  return PROJECT_ASSET_PATH_PREFIXES.some((p) => n.startsWith(p));
}

export interface PullProjectAssetsOptions {
  remote?: string;
  branch?: string;
  /** Preview only — do not checkout. */
  check?: boolean;
  gitExec?: (args: string[], cwd?: string) => { status: number; stdout: string; stderr: string };
}

export interface ProjectAssetChange {
  path: string;
  /** Present on remote → checkout; deleted on remote → remove locally. */
  kind: "update" | "delete";
}

export interface PullProjectAssetsResult {
  remoteRef: string;
  incoming: string[];
  updated: string[];
  removed: string[];
  configMerged: boolean;
  activeStagesPreserved: boolean;
  nextSteps: string[];
}

function defaultGit(args: string[], cwd?: string) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function gitOrThrow(
  exec: NonNullable<PullProjectAssetsOptions["gitExec"]>,
  cwd: string,
  args: string[],
  action: string
): string {
  const out = exec(args, cwd);
  if (out.status !== 0) throw new Error(`failed to ${action}: git ${args.join(" ")}\n${(out.stderr || out.stdout).trim()}`);
  return out.stdout;
}

/**
 * List allowlisted asset path changes from merge-base..remoteRef.
 * Includes deletions (status D) — those must be removed, not checked out.
 */
export function listIncomingProjectAssetChanges(
  root: string,
  remoteRef: string,
  gitExec: NonNullable<PullProjectAssetsOptions["gitExec"]> = defaultGit
): ProjectAssetChange[] {
  const diff = gitOrThrow(gitExec, root, ["diff", "--name-status", `HEAD...${remoteRef}`], "diff asset paths");
  const out: ProjectAssetChange[] = [];
  for (const raw of diff.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("\t").map((p) => p.trim().replace(/^"/, "").replace(/"$/, ""));
    const status = parts[0] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      const from = parts[1];
      const to = parts[2];
      if (from && isProjectAssetPath(from)) out.push({ path: from, kind: "delete" });
      if (to && isProjectAssetPath(to)) out.push({ path: to, kind: "update" });
      continue;
    }
    const p = parts[1];
    if (!p || !isProjectAssetPath(p)) continue;
    out.push({ path: p, kind: status.startsWith("D") ? "delete" : "update" });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

/** List tracked allowlist paths that differ between local HEAD and remoteRef. */
export function listIncomingProjectAssetPaths(
  root: string,
  remoteRef: string,
  gitExec: NonNullable<PullProjectAssetsOptions["gitExec"]> = defaultGit
): string[] {
  return [...new Set(listIncomingProjectAssetChanges(root, remoteRef, gitExec).map((c) => c.path))].sort();
}

function dirtyAllowlistPaths(root: string, gitExec: NonNullable<PullProjectAssetsOptions["gitExec"]>): string[] {
  const status = gitOrThrow(gitExec, root, ["status", "--porcelain"], "status");
  const dirty: string[] = [];
  for (const line of status.split("\n")) {
    if (!line.trim()) continue;
    const rel = line.slice(3).trim().replace(/^"/, "").replace(/"$/, "");
    if (isProjectAssetPath(rel)) dirty.push(rel);
  }
  return dirty;
}

// #region agent log
function agentDebugLog(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ sessionId: "0ab50a", timestamp: Date.now(), ...payload });
  try {
    fs.appendFileSync(
      "/Users/zhangjr/apps/LlmDemo/hx-project/hx-lite/.cursor/debug-0ab50a.log",
      line + "\n"
    );
  } catch {
    /* ignore */
  }
  fetch("http://127.0.0.1:7307/ingest/88fb5b33-114f-42c3-b178-e43e3a7b2920", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0ab50a" },
    body: line
  }).catch(() => {});
}
// #endregion

/**
 * Member-safe update: fetch remote and checkout only harness asset allowlist paths.
 * Does not touch changes/, docs/, or application source. Preserves local active_stages.
 */
export function pullProjectAssets(root: string, opts: PullProjectAssetsOptions = {}): PullProjectAssetsResult {
  const exec = opts.gitExec ?? defaultGit;
  const remote = opts.remote ?? "origin";

  // #region agent log
  {
    const remotesOut = exec(["remote", "-v"], root);
    const remoteUrl = exec(["remote", "get-url", remote], root);
    const toplevel = exec(["rev-parse", "--show-toplevel"], root);
    agentDebugLog({
      runId: "pre-fix",
      hypothesisId: "A",
      location: "projectPullAssets.ts:pullProjectAssets:pre-fetch",
      message: "pull-assets remotes before fetch",
      data: {
        root,
        remote,
        optsRemote: opts.remote ?? null,
        remotesStatus: remotesOut.status,
        remotesStdout: (remotesOut.stdout || "").trim(),
        remotesStderr: (remotesOut.stderr || "").trim(),
        remoteUrlStatus: remoteUrl.status,
        remoteUrlStdout: (remoteUrl.stdout || "").trim(),
        remoteUrlStderr: (remoteUrl.stderr || "").trim(),
        toplevelStatus: toplevel.status,
        toplevel: (toplevel.stdout || "").trim(),
        isInsideWorkTree: exec(["rev-parse", "--is-inside-work-tree"], root).stdout?.trim()
      }
    });
  }
  // #endregion

  const remoteUrlCheck = exec(["remote", "get-url", remote], root);
  if (remoteUrlCheck.status !== 0) {
    const remotesList = (exec(["remote"], root).stdout || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    // #region agent log
    agentDebugLog({
      runId: "post-fix",
      hypothesisId: "A",
      location: "projectPullAssets.ts:pullProjectAssets:missing-remote",
      message: "rejected missing remote with actionable error",
      data: { remote, remotesList, remoteUrlStderr: (remoteUrlCheck.stderr || "").trim() }
    });
    // #endregion
    const hint =
      remotesList.length === 0
        ? `Add the project GitHub remote first:\n  git remote add ${remote} <project-github-url>\nThen re-run: hx project pull-assets`
        : `Available remotes: ${remotesList.join(", ")}\n  Re-run with: hx project pull-assets --remote ${remotesList[0]}`;
    throw new Error(
      `git remote "${remote}" is not configured in this repository (pull-assets fetches only harness assets from the project GitHub).\n${hint}`
    );
  }

  const fetchOut = exec(["fetch", remote, "--prune"], root);
  // #region agent log
  agentDebugLog({
    runId: "post-fix",
    hypothesisId: "D",
    location: "projectPullAssets.ts:pullProjectAssets:post-fetch",
    message: "fetch result",
    data: {
      remote,
      status: fetchOut.status,
      stderr: (fetchOut.stderr || "").trim().slice(0, 500),
      stdout: (fetchOut.stdout || "").trim().slice(0, 200),
      remoteUrlConfigured: true,
      remoteUrl: (remoteUrlCheck.stdout || "").trim()
    }
  });
  // #endregion
  if (fetchOut.status !== 0) {
    throw new Error(`failed to fetch project remote: git fetch ${remote} --prune\n${(fetchOut.stderr || fetchOut.stdout).trim()}`);
  }

  const branch =
    opts.branch ??
    (() => {
      const b = exec(["rev-parse", "--abbrev-ref", "HEAD"], root);
      if (b.status === 0 && b.stdout.trim() && b.stdout.trim() !== "HEAD") return b.stdout.trim();
      return "main";
    })();

  const remoteRef = `${remote}/${branch}`;
  const rev = exec(["rev-parse", "--verify", remoteRef], root);
  if (rev.status !== 0) throw new Error(`remote ref not found: ${remoteRef} — fetch a branch that exists on ${remote}`);

  const changes = listIncomingProjectAssetChanges(root, remoteRef, exec);
  const incoming = [...new Set(changes.map((c) => c.path))].sort();
  const toCheckout = changes.filter((c) => c.kind === "update").map((c) => c.path);
  const toRemove = changes.filter((c) => c.kind === "delete").map((c) => c.path);
  // #region agent log
  agentDebugLog({
    runId: "post-fix",
    hypothesisId: "F",
    location: "projectPullAssets.ts:pullProjectAssets:classify",
    message: "classified incoming asset changes",
    data: {
      remoteRef,
      check: !!opts.check,
      incomingCount: incoming.length,
      toCheckoutCount: toCheckout.length,
      toRemoveCount: toRemove.length,
      toRemoveSample: toRemove.slice(0, 5),
      toCheckoutSample: toCheckout.slice(0, 5)
    }
  });
  // #endregion
  const dirty = dirtyAllowlistPaths(root, exec);
  if (dirty.length && !opts.check) {
    throw new Error(
      `local modifications on asset paths — commit or stash first:\n  ${dirty.slice(0, 15).join("\n  ")}` +
        (dirty.length > 15 ? `\n  … +${dirty.length - 15} more` : "")
    );
  }

  if (opts.check) {
    return {
      remoteRef,
      incoming,
      updated: [],
      removed: [],
      configMerged: false,
      activeStagesPreserved: true,
      nextSteps: incoming.length
        ? [`Run without --check to apply ${incoming.length} path(s)`, "Then: hx adapter sync && hx lock verify"]
        : ["No incoming asset changes"]
    };
  }

  const updated: string[] = [];
  const removed: string[] = [];
  if (toCheckout.length) {
    // Checkout paths that still exist on remote (creates/updates working tree + index only).
    const checkout = exec(["checkout", remoteRef, "--", ...toCheckout], root);
    if (checkout.status !== 0) {
      throw new Error(`failed to checkout asset paths from ${remoteRef}:\n${(checkout.stderr || checkout.stdout).trim()}`);
    }
    updated.push(...toCheckout);
  }
  if (toRemove.length) {
    // Remote deleted these allowlisted paths — stage removal without touching unrelated files.
    const rm = exec(["rm", "-f", "--", ...toRemove], root);
    if (rm.status !== 0) {
      throw new Error(`failed to remove deleted asset paths:\n${(rm.stderr || rm.stdout).trim()}`);
    }
    removed.push(...toRemove);
  }

  // Merge remote hub/adapter into config.yaml while preserving active_stages.
  let configMerged = false;
  let activeStagesPreserved = true;
  const configRel = "harnessX/config.yaml";
  const show = exec(["show", `${remoteRef}:${configRel}`], root);
  if (show.status === 0 && show.stdout.trim()) {
    try {
      const ws = Workspace.locate(root);
      const local = ws.readConfig();
      const remoteCfg = ConfigYaml.parse(YAML.parse(show.stdout));
      const preservedStages = local.active_stages ? [...local.active_stages] : undefined;
      const next = {
        ...local,
        hub: remoteCfg.hub ?? local.hub,
        adapter: remoteCfg.adapter ?? local.adapter,
        profile: remoteCfg.profile ?? local.profile,
        locale: remoteCfg.locale ?? local.locale,
        active_stages: preservedStages ?? remoteCfg.active_stages
      };
      writeYaml(ws.configFile, next);
      configMerged = true;
      activeStagesPreserved = true;
    } catch {
      // ignore malformed remote config
      activeStagesPreserved = true;
    }
  }

  return {
    remoteRef,
    incoming,
    updated,
    removed,
    configMerged,
    activeStagesPreserved,
    nextSteps: [
      "hx adapter sync",
      "hx lock verify",
      "Do not run hxhub sync --apply or hx project create on member machines for day-to-day updates"
    ]
  };
}
