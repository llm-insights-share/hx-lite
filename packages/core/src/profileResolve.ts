import type { HarnessYaml, ProfileDef, ProfileTaskEntry, ProfileTasksByStage } from "./schemas.js";
import { DEFAULT_PROFILE_STAGES, type DeliveryStage, DELIVERY_STAGES, STAGE_TASKS, suiteKey } from "./stages.js";

const STAGE_TASK_FIELD: Record<DeliveryStage, "req_tasks" | "arch_tasks" | "dev_tasks" | "test_tasks"> = {
  req: "req_tasks",
  arch: "arch_tasks",
  dev: "dev_tasks",
  test: "test_tasks"
};

function defaultTaskIds(profile: string, stage: DeliveryStage): string[] {
  const defaults = DEFAULT_PROFILE_STAGES[profile];
  const field = STAGE_TASK_FIELD[stage];
  const fromDefaults = defaults?.[field];
  if (fromDefaults?.length) return fromDefaults;
  if (defaults?.stages.includes(stage)) {
    return STAGE_TASKS[stage].filter((t) => t.required).map((t) => t.id);
  }
  return [];
}

/** Build suite map from preferred `tasks.*.suite` entries. */
export function suiteMapFromTasks(tasks: ProfileTasksByStage | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tasks) return out;
  for (const stage of DELIVERY_STAGES) {
    for (const entry of tasks[stage] ?? []) {
      if (entry.suite) out[suiteKey(stage, entry.id)] = entry.suite;
    }
  }
  return out;
}

/**
 * Normalize a raw ProfileDef into preferred shape:
 * - `tasks` per stage with `{ id, suite? }`
 * - legacy `*_tasks` + `suites` map filled for consumers still reading them
 */
export function normalizeProfile(raw: ProfileDef, profileName?: string): ProfileDef {
  const defaults = profileName ? DEFAULT_PROFILE_STAGES[profileName] : undefined;
  const stages = (raw.stages?.length ? raw.stages : defaults?.stages ?? ["dev"]) as DeliveryStage[];
  const legacySuites = { ...(raw.suites ?? {}) };
  const tasks: ProfileTasksByStage = {};

  for (const stage of DELIVERY_STAGES) {
    if (!stages.includes(stage)) continue;
    const field = STAGE_TASK_FIELD[stage];
    const fromTasks = raw.tasks?.[stage];
    let entries: ProfileTaskEntry[];

    if (fromTasks?.length) {
      entries = fromTasks.map((e) => {
        const key = suiteKey(stage, e.id);
        return {
          id: e.id,
          suite: e.suite ?? legacySuites[key]
        };
      });
    } else {
      const ids =
        (raw[field] as string[] | undefined)?.length
          ? (raw[field] as string[])
          : profileName
            ? defaultTaskIds(profileName, stage)
            : [];
      entries = ids.map((id) => {
        const key = suiteKey(stage, id);
        return { id, suite: legacySuites[key] };
      });
    }

    if (entries.length) tasks[stage] = entries;
  }

  const suites = { ...legacySuites, ...suiteMapFromTasks(tasks) };
  const req_tasks = tasks.req?.map((e) => e.id);
  const arch_tasks = tasks.arch?.map((e) => e.id);
  const dev_tasks = tasks.dev?.map((e) => e.id);
  const test_tasks = tasks.test?.map((e) => e.id);

  return {
    stages,
    tasks,
    req_tasks,
    arch_tasks,
    dev_tasks,
    test_tasks,
    suites
  };
}

export function resolveProfile(harness: HarnessYaml, profile: string): ProfileDef {
  const p = harness.profiles[profile];
  if (!p) throw new Error(`profile "${profile}" not defined in harness.yaml`);
  return normalizeProfile(p, profile);
}

export function profileStages(harness: HarnessYaml, profile: string): DeliveryStage[] {
  return resolveProfile(harness, profile).stages;
}

export function profileTaskEntries(
  harness: HarnessYaml,
  profile: string,
  stage: DeliveryStage
): ProfileTaskEntry[] {
  return resolveProfile(harness, profile).tasks?.[stage] ?? [];
}

export function profileTaskIds(harness: HarnessYaml, profile: string, stage: DeliveryStage): string[] {
  const entries = profileTaskEntries(harness, profile, stage);
  if (entries.length) return entries.map((e) => e.id);
  return defaultTaskIds(profile, stage);
}

export function profileDevTasks(harness: HarnessYaml, profile: string): string[] {
  return profileTaskIds(harness, profile, "dev");
}

export function profileTestTasks(harness: HarnessYaml, profile: string): string[] {
  const ids = profileTaskIds(harness, profile, "test");
  if (ids.length) return ids;
  if (profileStages(harness, profile).includes("test")) return ["test-case-design", "test-execution"];
  return [];
}

export function profileReqTasks(harness: HarnessYaml, profile: string): string[] {
  return profileTaskIds(harness, profile, "req");
}

export function profileArchTasks(harness: HarnessYaml, profile: string): string[] {
  return profileTaskIds(harness, profile, "arch");
}

/** Suite name for a stage task (from normalized profile). */
export function resolveSuiteName(
  harness: HarnessYaml,
  profile: string,
  stage: DeliveryStage,
  taskId: string
): string | undefined {
  const p = resolveProfile(harness, profile);
  const key = suiteKey(stage, taskId);
  if (p.suites[key]) return p.suites[key];
  const entry = p.tasks?.[stage]?.find((e) => e.id === taskId);
  return entry?.suite;
}

/** Resolve sensor ids bound to a profile stage/task via its suite. */
export function resolveSuiteSensors(
  harness: HarnessYaml,
  profile: string,
  stage: DeliveryStage,
  taskId: string
): string[] {
  const suiteName = resolveSuiteName(harness, profile, stage, taskId);
  if (!suiteName) return [];
  return harness.suites[suiteName] ?? [];
}

export function normalizeHarnessProfiles(harness: HarnessYaml): HarnessYaml {
  const profiles: Record<string, ProfileDef> = {};
  for (const [name, p] of Object.entries(harness.profiles)) {
    profiles[name] = normalizeProfile(p, name);
  }
  return { ...harness, profiles };
}

/** Ensure a profile has stage.task → suiteName binding (updates tasks + legacy suites). */
export function ensureProfileSuiteBinding(
  profile: ProfileDef,
  stage: DeliveryStage,
  taskId: string,
  suiteName: string
): void {
  const key = suiteKey(stage, taskId);
  if (!profile.suites) profile.suites = {};
  if (!profile.suites[key]) profile.suites[key] = suiteName;

  if (!profile.tasks) profile.tasks = {};
  const field = STAGE_TASK_FIELD[stage];
  let list = profile.tasks[stage];
  // Seed from legacy *_tasks so a sparse hub bind does not drop the enabled set.
  if (!list?.length) {
    const legacyIds = profile[field] ?? [];
    list = legacyIds.map((id) => ({
      id,
      suite: profile.suites?.[suiteKey(stage, id)]
    }));
  }
  const idx = list.findIndex((e) => e.id === taskId);
  if (idx >= 0) {
    list[idx] = { ...list[idx]!, suite: list[idx]!.suite ?? suiteName };
  } else {
    list.push({ id: taskId, suite: suiteName });
  }
  profile.tasks[stage] = list;

  const ids = profile[field] ?? list.map((e) => e.id);
  if (!ids.includes(taskId)) {
    profile[field] = [...ids, taskId];
  } else if (!profile[field]?.length) {
    profile[field] = list.map((e) => e.id);
  }
}
