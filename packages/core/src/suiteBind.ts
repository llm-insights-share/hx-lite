import type { HarnessYaml, SensorDef } from "./schemas.js";
import { suiteKey, type DeliveryStage } from "./stages.js";
import { ensureProfileSuiteBinding, resolveSuiteName } from "./profileResolve.js";

export type BindableSensor = Pick<SensorDef, "id" | "stage" | "task" | "trigger">;

/** Named suite id for auto-bind (never use stage.task as suite key). */
export function defaultSuiteName(stage: DeliveryStage, taskId: string): string {
  return `${stage}-${taskId}`;
}

/**
 * Append a task-triggered sensor to a named suite and ensure
 * profile suite mappings / tasks[] point at a suite that includes it.
 * file-save / schedule sensors are skipped.
 */
export function bindTaskSensorToSuites(harness: HarnessYaml, sensor: BindableSensor, profile?: string): boolean {
  if (!sensor.stage || !sensor.task) return false;
  if (sensor.trigger && sensor.trigger !== "task") return false;

  const stage = sensor.stage as DeliveryStage;
  const taskId = sensor.task;
  const profileNames = profile ? [profile] : Object.keys(harness.profiles);

  for (const name of profileNames) {
    const p = harness.profiles[name];
    if (!p) continue;

    let target =
      resolveSuiteName(harness, name, stage, taskId) ??
      p.suites?.[suiteKey(stage, taskId)] ??
      defaultSuiteName(stage, taskId);

    // Migrate accidental stage.task suite keys to named packs.
    if (target === suiteKey(stage, taskId)) {
      target = defaultSuiteName(stage, taskId);
    }

    if (!harness.suites[target]) harness.suites[target] = [];
    if (!harness.suites[target]!.includes(sensor.id)) harness.suites[target]!.push(sensor.id);

    ensureProfileSuiteBinding(p, stage, taskId, target);
  }
  return true;
}
