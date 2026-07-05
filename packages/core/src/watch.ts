import fs from "node:fs";
import { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { readTasks } from "./plan.js";
import { nextPhase } from "./gate.js";
import { pendingFixHints } from "./reviewAnnotations.js";

/**
 * v0.2 P2: Watch active changes and emit notifications (stdout or webhook).
 */

export type WatchEventKind =
  | "status_change"
  | "gate_blocked"
  | "needs_approval"
  | "tasks_complete"
  | "review_pending"
  | "idle";

export interface WatchEvent {
  at: string;
  change: string;
  kind: WatchEventKind;
  message: string;
  detail?: Record<string, unknown>;
}

export interface WatchSnapshot {
  change: string;
  status: string;
  profile: string;
  tasksDone: number;
  tasksTotal: number;
  nextPhase: string | null;
  pendingReviewHints: number;
}

export function collectWatchSnapshot(ws: Workspace, change: string): WatchSnapshot {
  const meta = readMeta(ws, change);
  const tasks = readTasks(ws, change);
  const harness = ws.readHarness();
  return {
    change,
    status: meta.status,
    profile: meta.profile,
    tasksDone: tasks.filter((t) => t.done).length,
    tasksTotal: tasks.length,
    nextPhase: nextPhase(harness, meta),
    pendingReviewHints: pendingFixHints(ws, change).length
  };
}

export function detectWatchEvents(ws: Workspace, change: string, prev?: WatchSnapshot): WatchEvent[] {
  const snap = collectWatchSnapshot(ws, change);
  const meta = readMeta(ws, change);
  const events: WatchEvent[] = [];
  const at = new Date().toISOString();

  if (prev && prev.status !== snap.status) {
    events.push({
      at,
      change,
      kind: "status_change",
      message: `Status: ${prev.status} → ${snap.status}`,
      detail: { from: prev.status, to: snap.status }
    });
  }

  if (snap.nextPhase === "plan" && meta.status === "specified" && meta.approvals.length === 0) {
    events.push({
      at,
      change,
      kind: "needs_approval",
      message: "Spec gate needs human approval before plan",
      detail: { gate: "spec" }
    });
  }

  if (snap.tasksTotal > 0 && snap.tasksDone === snap.tasksTotal && meta.status === "implementing") {
    events.push({
      at,
      change,
      kind: "tasks_complete",
      message: "All tasks done — run hx verify",
      detail: { tasksTotal: snap.tasksTotal }
    });
  }

  if (snap.pendingReviewHints > 0) {
    events.push({
      at,
      change,
      kind: "review_pending",
      message: `${snap.pendingReviewHints} unresolved review annotation(s)`,
      detail: { count: snap.pendingReviewHints }
    });
  }

  if (!events.length) {
    events.push({ at, change, kind: "idle", message: `Watching ${change} (${snap.status})` });
  }

  return events;
}

export async function emitWatchEvents(events: WatchEvent[], webhookUrl?: string): Promise<void> {
  for (const ev of events) {
    const line = `[hx watch] ${ev.change} ${ev.kind}: ${ev.message}`;
    console.log(line);
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ev)
        });
      } catch (e) {
        console.error(`webhook failed: ${(e as Error).message}`);
      }
    }
  }
}

export interface WatchOptions {
  intervalMs?: number;
  webhookUrl?: string;
  once?: boolean;
  onEvent?: (events: WatchEvent[]) => void;
}

/** Poll change state until interrupted (or --once). */
export async function watchChange(ws: Workspace, change: string, opts: WatchOptions = {}): Promise<void> {
  if (!fs.existsSync(ws.metaFile(change))) throw new Error(`change not found: ${change}`);
  const interval = opts.intervalMs ?? 30_000;
  let prev: WatchSnapshot | undefined;

  const tick = async () => {
    const events = detectWatchEvents(ws, change, prev);
    prev = collectWatchSnapshot(ws, change);
    if (opts.onEvent) opts.onEvent(events);
    else await emitWatchEvents(events.filter((e) => e.kind !== "idle"), opts.webhookUrl);
  };

  await tick();
  if (opts.once) return;

  await new Promise<void>((resolve) => {
    const handle = setInterval(() => {
      tick().catch((e) => console.error(`watch error: ${(e as Error).message}`));
    }, interval);
    process.on("SIGINT", () => {
      clearInterval(handle);
      resolve();
    });
  });
}
