import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Workspace, ensureDir, readYaml, writeYaml } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { verifyChange } from "./verify.js";
import { applyLoop, type ApplyOptions } from "./applyLoop.js";
import type { RunnerOptions } from "./sensorRunner.js";

/**
 * v0.2 P1: Worktree runtime — isolated apply environments and best-of-N fan-out.
 * Operational state lives in changes/<id>/runtime.yaml (not meta.yaml).
 */

export interface WorktreeRecord {
  path: string;
  branch: string;
  slot: string;
  createdAt: string;
}

export interface FanOutCandidate {
  slot: string;
  path: string;
  verifyPassed: boolean;
  blockerCount: number;
  score: number;
}

export interface RuntimeYaml {
  worktrees: WorktreeRecord[];
  fanOut?: {
    at: string;
    count: number;
    candidates: FanOutCandidate[];
    selected?: string;
  };
}

function runtimeFile(ws: Workspace, change: string): string {
  return path.join(ws.changeDir(change), "runtime.yaml");
}

export function readRuntime(ws: Workspace, change: string): RuntimeYaml {
  const f = runtimeFile(ws, change);
  if (!fs.existsSync(f)) return { worktrees: [] };
  return readYaml<RuntimeYaml>(f) ?? { worktrees: [] };
}

export function writeRuntime(ws: Workspace, change: string, data: RuntimeYaml): void {
  ensureDir(ws.changeDir(change));
  writeYaml(runtimeFile(ws, change), data);
}

function git(ws: Workspace, args: string[], cwd?: string): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: cwd ?? ws.root, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${out}`);
  return { ok: true, out };
}

function isGitRepo(ws: Workspace): boolean {
  return spawnSync("git", ["rev-parse", "--git-dir"], { cwd: ws.root, encoding: "utf8" }).status === 0;
}

export function createWorktree(ws: Workspace, change: string, slot?: string): WorktreeRecord {
  if (!isGitRepo(ws)) throw new Error("runtime worktrees require a git repository");
  const id = slot ?? `wt-${Date.now().toString(36)}`;
  const branch = `cursor/hx-${change}-${id}-5afb`;
  const wtPath = path.resolve(ws.root, "..", `hx-${change}-${id}`);
  if (fs.existsSync(wtPath)) throw new Error(`worktree path already exists: ${wtPath}`);
  git(ws, ["worktree", "add", "-b", branch, wtPath]);
  const rec: WorktreeRecord = { path: wtPath, branch, slot: id, createdAt: new Date().toISOString() };
  const rt = readRuntime(ws, change);
  rt.worktrees.push(rec);
  writeRuntime(ws, change, rt);
  return rec;
}

export function listWorktrees(ws: Workspace, change: string): WorktreeRecord[] {
  return readRuntime(ws, change).worktrees;
}

export function removeWorktree(ws: Workspace, change: string, slotOrPath: string): void {
  const rt = readRuntime(ws, change);
  const idx = rt.worktrees.findIndex((w) => w.slot === slotOrPath || w.path === slotOrPath || path.resolve(w.path) === path.resolve(slotOrPath));
  if (idx < 0) throw new Error(`worktree not found: ${slotOrPath}`);
  const rec = rt.worktrees[idx]!;
  if (fs.existsSync(rec.path)) {
    try {
      git(ws, ["worktree", "remove", rec.path, "--force"], ws.root);
    } catch {
      fs.rmSync(rec.path, { recursive: true, force: true });
    }
  }
  try {
    git(ws, ["branch", "-D", rec.branch]);
  } catch {
    /* branch may already be gone */
  }
  rt.worktrees.splice(idx, 1);
  writeRuntime(ws, change, rt);
}

export interface FanOutOptions {
  runner: RunnerOptions;
  executor: ApplyOptions["executor"];
  count: number;
  maxRetries?: number;
}

export interface FanOutResult {
  candidates: FanOutCandidate[];
  selected: FanOutCandidate | null;
}

/** Run apply+verify in N isolated worktrees; pick the highest-scoring candidate. */
export async function fanOutApply(ws: Workspace, change: string, opts: FanOutOptions): Promise<FanOutResult> {
  if (!isGitRepo(ws)) throw new Error("fan-out requires a git repository");
  if (opts.count < 2) throw new Error("fan-out count must be >= 2");
  readMeta(ws, change); // ensure change exists

  const created: WorktreeRecord[] = [];
  for (let i = 1; i <= opts.count; i++) created.push(createWorktree(ws, change, `fanout-${i}`));

  const candidates: FanOutCandidate[] = [];
  for (const wt of created) {
    const child = new Workspace(wt.path, ws.dirName);
    await applyLoop(child, change, {
      runner: opts.runner,
      executor: opts.executor,
      maxRetries: opts.maxRetries
    });
    const verify = await verifyChange(child, change, opts.runner);
    const blockerCount = verify.gate.blockers.length;
    const score = verify.verified ? 1000 - blockerCount : blockerCount === 0 ? 500 : 100 - blockerCount;
    candidates.push({
      slot: wt.slot,
      path: wt.path,
      verifyPassed: verify.verified,
      blockerCount,
      score
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.find((c) => c.verifyPassed) ?? candidates[0] ?? null;

  const rt = readRuntime(ws, change);
  rt.fanOut = {
    at: new Date().toISOString(),
    count: opts.count,
    candidates,
    selected: selected?.slot
  };
  writeRuntime(ws, change, rt);
  return { candidates, selected };
}
