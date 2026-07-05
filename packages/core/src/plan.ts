import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import { listDeltaFiles, parseDelta } from "./artifactStore.js";

/**
 * T-203 (FR-006): generates tasks.md from delta specs as a dual-track list —
 * a test task and an implementation task per requirement, each annotated with
 * the requirement it covers. Requirements lacking a test task need a waiver.
 */

export interface Task {
  id: string;
  track: "test" | "impl";
  requirement: string;
  capability: string;
  title: string;
  done: boolean;
  /** v0.2: tasks sharing a group may run concurrently (hx apply --parallel). */
  parallelGroup?: string;
  /** v0.2: task ids that must complete before this one starts. */
  dependsOn?: string[];
}

export function generateTasks(ws: Workspace, change: string): { file: string; tasks: Task[] } {
  const tasks: Task[] = [];
  let n = 1;
  for (const { capability, file } of listDeltaFiles(ws, change)) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    for (const section of delta.sections) {
      if (section.op === "REMOVED") continue;
      for (const req of section.requirements) {
        const base = String(n).padStart(2, "0");
        tasks.push({
          id: `${base}a`,
          track: "test",
          requirement: req.name,
          capability,
          title: `Write failing test(s) for scenarios of "${req.name}"`,
          done: false
        });
        tasks.push({
          id: `${base}b`,
          track: "impl",
          requirement: req.name,
          capability,
          title: `Implement "${req.name}" until its tests pass`,
          done: false
        });
        n++;
      }
    }
  }
  const file = path.join(ws.changeDir(change), "tasks.md");
  fs.writeFileSync(file, serializeTasks(change, tasks), "utf8");
  return { file, tasks };
}

export function serializeTasks(change: string, tasks: Task[]): string {
  const lines = [
    `# Tasks: ${change}`,
    "",
    "> Dual-track plan (FR-006): every requirement has a test task (a) and an impl task (b).",
    "> A requirement without a test task requires a waiver (`hx waiver add`).",
    ""
  ];
  for (const t of tasks) {
    let line = `- [${t.done ? "x" : " "}] ${t.id} [${t.track}] (${t.capability} / Requirement: ${t.requirement}) ${t.title}`;
    if (t.parallelGroup) line += ` @group=${t.parallelGroup}`;
    if (t.dependsOn?.length) line += ` @depends=${t.dependsOn.join(",")}`;
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}

const TASK_RE =
  /^- \[( |x)\] (\S+) \[(test|impl)\] \(([^/]+) \/ Requirement: (.+?)\) (.+?)(?: @group=(\S+))?(?: @depends=([\d\w,]+))?$/;

export function parseTasks(md: string): Task[] {
  const tasks: Task[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(TASK_RE);
    if (m)
      tasks.push({
        done: m[1] === "x",
        id: m[2],
        track: m[3] as Task["track"],
        capability: m[4].trim(),
        requirement: m[5].trim(),
        title: m[6].trim(),
        parallelGroup: m[7],
        dependsOn: m[8] ? m[8].split(",").map((s) => s.trim()).filter(Boolean) : undefined
      });
  }
  return tasks;
}

export function readTasks(ws: Workspace, change: string): Task[] {
  const file = path.join(ws.changeDir(change), "tasks.md");
  if (!fs.existsSync(file)) return [];
  return parseTasks(fs.readFileSync(file, "utf8"));
}

export function markTaskDone(ws: Workspace, change: string, taskId: string): Task[] {
  const file = path.join(ws.changeDir(change), "tasks.md");
  const tasks = readTasks(ws, change).map((t) => (t.id === taskId ? { ...t, done: true } : t));
  fs.writeFileSync(file, serializeTasks(change, tasks), "utf8");
  return tasks;
}

/** v0.2: next batch of tasks ready to run (respects dependsOn and parallel groups). */
export function nextTaskBatch(tasks: Task[], completed: string[], parallel = 1): Task[] {
  const pending = tasks.filter((t) => !t.done && !completed.includes(t.id));
  const ready = pending.filter((t) => (t.dependsOn ?? []).every((d) => completed.includes(d) || tasks.find((x) => x.id === d)?.done));
  if (!ready.length) return [];

  const ungrouped = ready.filter((t) => !t.parallelGroup);
  if (ungrouped.length) return [ungrouped[0]!];

  const firstGroup = ready.find((t) => t.parallelGroup)?.parallelGroup;
  if (!firstGroup) return [ready[0]!];
  return ready.filter((t) => t.parallelGroup === firstGroup).slice(0, Math.max(1, parallel));
}

/** Requirements whose test track is missing or skipped — need waivers. */
export function missingTestTasks(tasks: Task[]): string[] {
  const reqs = new Set(tasks.filter((t) => t.track === "impl").map((t) => `${t.capability}/${t.requirement}`));
  const tested = new Set(tasks.filter((t) => t.track === "test").map((t) => `${t.capability}/${t.requirement}`));
  return [...reqs].filter((r) => !tested.has(r));
}
