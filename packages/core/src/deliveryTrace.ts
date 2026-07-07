import fs from "node:fs";
import { Workspace, readYaml, writeYaml } from "./paths.js";
import { DeliveryTraceYaml, type DeliveryTraceEntry } from "./schemas.js";
import { listDeltaFiles, parseDelta } from "./artifactStore.js";
import type { Task } from "./plan.js";

export function readDeliveryTrace(ws: Workspace, change: string) {
  const f = ws.deliveryTraceFile(change);
  if (!fs.existsSync(f)) return DeliveryTraceYaml.parse({});
  return DeliveryTraceYaml.parse(readYaml(f));
}

export function writeDeliveryTrace(ws: Workspace, change: string, data: DeliveryTraceYaml): void {
  writeYaml(ws.deliveryTraceFile(change), data);
}

/** Scaffold delivery-trace.yaml from delta spec requirements after propose. */
export function scaffoldDeliveryTrace(ws: Workspace, change: string): string {
  const trace = DeliveryTraceYaml.parse({ version: 1, acceptance_criteria: {}, requirements: {} });
  for (const { capability, file } of listDeltaFiles(ws, change)) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    for (const section of delta.sections) {
      for (const req of section.requirements) {
        const key = `${capability}/${req.name}`;
        trace.requirements[key] = {
          requirement: req.name,
          design_refs: [],
          scenarios: req.scenarios.map((s) => s.name),
          tasks: [],
          code_hints: []
        };
      }
    }
  }
  writeDeliveryTrace(ws, change, trace);
  return ws.deliveryTraceFile(change);
}

/** Sync task ids and design refs from tasks.md back into delivery-trace.yaml. */
export function syncDeliveryTraceFromTasks(ws: Workspace, change: string, tasks: Task[]): void {
  const trace = readDeliveryTrace(ws, change);
  for (const t of tasks) {
    const key = `${t.capability}/${t.requirement}`;
    const entry: DeliveryTraceEntry = trace.requirements[key] ?? {
      requirement: t.requirement,
      design_refs: [],
      scenarios: [],
      tasks: [],
      code_hints: []
    };
    if (!entry.tasks.includes(t.id)) entry.tasks.push(t.id);
    if (t.designRef && !entry.design_refs.includes(t.designRef)) entry.design_refs.push(t.designRef);
    if (t.filesHint) {
      for (const f of t.filesHint.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!entry.code_hints.includes(f)) entry.code_hints.push(f);
      }
    }
    trace.requirements[key] = entry;
  }
  writeDeliveryTrace(ws, change, trace);
}

export function getTraceEntryForTask(ws: Workspace, change: string, task: Task): DeliveryTraceEntry | undefined {
  const trace = readDeliveryTrace(ws, change);
  return trace.requirements[`${task.capability}/${task.requirement}`];
}
