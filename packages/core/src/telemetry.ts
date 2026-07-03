import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir, Workspace } from "./paths.js";

export interface RunRecord {
  at: string;
  kind: "sensor" | "gate" | "suite" | "steer" | "janitor" | "apply";
  change?: string;
  name: string;
  status: "pass" | "fail" | "error" | "info";
  detail?: unknown;
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** NFR-005: JSON Lines telemetry, global and per-change. */
export function appendRun(ws: Workspace, record: Omit<RunRecord, "at">): RunRecord {
  const full: RunRecord = { at: new Date().toISOString(), ...record };
  const line = JSON.stringify(full) + "\n";
  ensureDir(ws.runsDir);
  fs.appendFileSync(path.join(ws.runsDir, "telemetry.jsonl"), line);
  if (record.change) {
    const dir = ws.changeRunsDir(record.change);
    ensureDir(dir);
    fs.appendFileSync(path.join(dir, "telemetry.jsonl"), line);
  }
  return full;
}

/** Hash of a change's run log — bound to gate results in meta.yaml (FR-050). */
export function runsLogHash(ws: Workspace, change: string): string {
  const file = path.join(ws.changeRunsDir(change), "telemetry.jsonl");
  if (!fs.existsSync(file)) return sha256("");
  return sha256(fs.readFileSync(file));
}

export function readRuns(ws: Workspace, change?: string): RunRecord[] {
  const file = change
    ? path.join(ws.changeRunsDir(change), "telemetry.jsonl")
    : path.join(ws.runsDir, "telemetry.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RunRecord);
}
