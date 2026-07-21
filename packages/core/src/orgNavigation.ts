import type { Workspace } from "./paths.js";
import type { HarnessYaml } from "./schemas.js";
import { effectiveStages } from "./profileAssets.js";
import { profileArchTasks, profileReqTasks } from "./profileResolve.js";
import { orgCompletedTasks, readOrgStageProgress } from "./orgStageProgress.js";
import { STAGE_TASKS, type DeliveryStage } from "./stages.js";
import { listUnlinkedAppliedCrs } from "./changeRequest.js";
import { readMeta } from "./metaStore.js";

export type OrgStage = "req" | "arch";

export interface OrgTaskFocus {
  stage: OrgStage;
  task: string;
  prdSlug?: string;
  moduleId?: string;
}

export type DeliveryFocus =
  | { kind: "org"; stage: OrgStage; task: string; prdSlug?: string; moduleId?: string }
  | { kind: "pending-cr"; crId: string; prdSlug?: string; suggestedCli: string }
  | { kind: "change"; change: string }
  | { kind: "workspace" };

export interface DeliveryTracks {
  /** Changes without sourceCr, grouped by prdRef (or "(none)") */
  baseline: { prd: string; changes: string[] }[];
  /** Applied CRs awaiting a Dev Change, and changes linked via sourceCr */
  delta: {
    pendingCrs: { id: string; prd?: string; suggestedCli: string }[];
    linkedChanges: { change: string; crId: string; prd?: string }[];
  };
}

function orgTaskIds(harness: HarnessYaml, profile: string, stage: OrgStage): string[] {
  const ids = stage === "req" ? profileReqTasks(harness, profile) : profileArchTasks(harness, profile);
  if (ids.length) return ids;
  return STAGE_TASKS[stage].filter((t) => t.required).map((t) => t.id);
}

/** Next incomplete org-stage task for a profile (req or arch). */
export function nextOrgTask(ws: Workspace, stage: OrgStage, profile: string): OrgTaskFocus | null {
  const harness = ws.readHarness();
  const tasks = orgTaskIds(harness, profile, stage);
  const completed = new Set(orgCompletedTasks(ws, stage));
  const progress = readOrgStageProgress(ws)[stage];

  for (const task of tasks) {
    if (!completed.has(task)) {
      return {
        stage,
        task,
        prdSlug: progress?.prdSlug,
        moduleId: progress?.moduleId
      };
    }
  }

  if (progress?.current && tasks.includes(progress.current) && !completed.has(progress.current)) {
    return {
      stage,
      task: progress.current,
      prdSlug: progress.prdSlug,
      moduleId: progress.moduleId
    };
  }

  return null;
}

function orgStagesIncomplete(
  ws: Workspace,
  harness: HarnessYaml,
  profile: string,
  stages: DeliveryStage[]
): OrgTaskFocus | null {
  for (const stage of stages) {
    if (stage !== "req" && stage !== "arch") continue;
    const next = nextOrgTask(ws, stage, profile);
    if (next) return next;
  }
  return null;
}

/** Build baseline / delta track summaries for workspace navigation. */
export function buildDeliveryTracks(ws: Workspace): DeliveryTracks {
  const byPrd = new Map<string, string[]>();
  const linkedChanges: DeliveryTracks["delta"]["linkedChanges"] = [];

  for (const id of ws.listChanges()) {
    let meta;
    try {
      meta = readMeta(ws, id);
    } catch {
      continue;
    }
    if (meta.sourceCr) {
      linkedChanges.push({ change: id, crId: meta.sourceCr, prd: meta.prdRef });
    } else {
      const prd = meta.prdRef ?? "(none)";
      const list = byPrd.get(prd) ?? [];
      list.push(id);
      byPrd.set(prd, list);
    }
  }

  const pendingCrs = listUnlinkedAppliedCrs(ws).map((cr) => {
    const prd = cr.target.prd;
    return {
      id: cr.id,
      prd,
      suggestedCli: `hx change create <id> --domains <domain>${prd ? ` --prd ${prd}` : ""} --from-cr ${cr.id}`
    };
  });

  return {
    baseline: [...byPrd.entries()].map(([prd, changes]) => ({ prd, changes })),
    delta: { pendingCrs, linkedChanges }
  };
}

/**
 * Infer default delivery focus:
 * incomplete org tasks → pending CR (delta) → sole active change → workspace home.
 */
export function inferDeliveryFocus(ws: Workspace): DeliveryFocus {
  const cfg = ws.readConfig();
  const harness = ws.readHarness();
  const profile = cfg.profile;
  const stages = effectiveStages(cfg, harness);

  const orgFocus = orgStagesIncomplete(ws, harness, profile, stages);
  if (orgFocus) {
    return {
      kind: "org",
      stage: orgFocus.stage,
      task: orgFocus.task,
      prdSlug: orgFocus.prdSlug,
      moduleId: orgFocus.moduleId
    };
  }

  const pending = listUnlinkedAppliedCrs(ws);
  if (pending.length) {
    const cr = pending[0]!;
    const prd = cr.target.prd;
    return {
      kind: "pending-cr",
      crId: cr.id,
      prdSlug: prd,
      suggestedCli: `hx change create <id> --domains <domain>${prd ? ` --prd ${prd}` : ""} --from-cr ${cr.id}`
    };
  }

  const changes = ws.listChanges();
  if (changes.length === 1) return { kind: "change", change: changes[0]! };
  return { kind: "workspace" };
}
