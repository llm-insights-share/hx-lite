import fs from "node:fs";
import path from "node:path";
import { Workspace, readYaml, writeYaml } from "./paths.js";
import { OrgStageProgress } from "./schemas.js";
import type { DeliveryStage } from "./stages.js";

export function orgStageProgressFile(ws: Workspace): string {
  return path.join(ws.root, "docs", ".stage-progress.yaml");
}

export function readOrgStageProgress(ws: Workspace): OrgStageProgress {
  const file = orgStageProgressFile(ws);
  if (!fs.existsSync(file)) return OrgStageProgress.parse({ version: "1.0" });
  return OrgStageProgress.parse(readYaml(file));
}

export function writeOrgStageProgress(ws: Workspace, data: OrgStageProgress): void {
  const file = orgStageProgressFile(ws);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeYaml(file, data);
}

export function markOrgTaskComplete(
  ws: Workspace,
  stage: "req" | "arch",
  taskId: string,
  opts?: { prdSlug?: string; moduleId?: string }
): OrgStageProgress {
  const store = readOrgStageProgress(ws);
  const entry = store[stage] ?? { completed: [] };
  if (!entry.completed.includes(taskId)) entry.completed = [...entry.completed, taskId];
  entry.current = taskId;
  if (opts?.prdSlug) entry.prdSlug = opts.prdSlug;
  if (opts?.moduleId) entry.moduleId = opts.moduleId;
  store[stage] = entry;
  writeOrgStageProgress(ws, store);
  return store;
}

export function orgCompletedTasks(ws: Workspace, stage: DeliveryStage): string[] {
  if (stage !== "req" && stage !== "arch") return [];
  return readOrgStageProgress(ws)[stage]?.completed ?? [];
}
