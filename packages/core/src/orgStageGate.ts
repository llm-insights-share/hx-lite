import type { Workspace } from "./paths.js";
import type { SuiteResult } from "./schemas.js";
import { runSensor, type RunnerOptions } from "./sensorRunner.js";
import { resolveCompensation, augmentSuiteIds } from "./gateCompensation.js";
import { resolveSuiteName, profileReqTasks, profileArchTasks } from "./profileResolve.js";
import { STAGE_TASKS, taskById, type DeliveryStage } from "./stages.js";
import { markOrgTaskComplete } from "./orgStageProgress.js";
import { appendRun } from "./telemetry.js";

export interface OrgStageGateCheckResult {
  stage: "req" | "arch";
  task: string;
  suite?: SuiteResult;
  blockers: string[];
  warnings: string[];
  passed: boolean;
  prdSlug?: string;
  moduleId?: string;
}

export interface OrgStageGateOpts {
  prdSlug?: string;
  moduleId?: string;
  /** Record task as completed in docs/.stage-progress.yaml when passed */
  recordProgress?: boolean;
  profile?: string;
}

async function runOrgSuite(
  ws: Workspace,
  suiteName: string,
  opts: RunnerOptions,
  taskId: string
): Promise<SuiteResult> {
  const harness = ws.readHarness();
  const compensation = resolveCompensation(ws);
  const ids = augmentSuiteIds(harness, suiteName, []);
  const result: SuiteResult = { suite: suiteName, passed: true, reports: [], blockers: [], warnings: [], fixHints: [] };
  if (!harness.suites[suiteName] && ids.length === 0) {
    return {
      suite: suiteName,
      passed: false,
      reports: [],
      blockers: [`suite "${suiteName}" is not defined in harness.yaml (fail-closed)`],
      warnings: [],
      fixHints: []
    };
  }
  for (const id of ids) {
    const def = harness.sensors.find((s) => s.id === id);
    if (!def) {
      result.blockers.push(`sensor "${id}" referenced by suite "${suiteName}" is not registered (fail-closed)`);
      continue;
    }
    const report = await runSensor(ws, def, undefined, opts);
    result.reports.push(report);
    if (report.status === "pass") continue;
    const label = `${def.id}: ${report.summary}`;
    if (report.status === "error") result.blockers.push(`${label} [sensor error — fail-closed]`);
    else if (def.on_fail === "warn" && !compensation.escalateWarnToBlock) result.warnings.push(label);
    else result.blockers.push(label);
    if (report.fix_hint) result.fixHints.push(`${def.id}: ${report.fix_hint}`);
  }
  result.passed = result.blockers.length === 0;
  appendRun(ws, {
    kind: "suite",
    name: suiteName,
    status: result.passed ? "pass" : "fail",
    detail: { blockers: result.blockers, task: taskId, org: true }
  });
  return result;
}

/** Org-level gate check for req/arch tasks (no change workspace required). */
export async function orgStageGateCheck(
  ws: Workspace,
  stage: "req" | "arch",
  taskId: string,
  runnerOpts: RunnerOptions,
  gateOpts: OrgStageGateOpts = {}
): Promise<OrgStageGateCheckResult> {
  const harness = ws.readHarness();
  const profile = gateOpts.profile ?? ws.readConfig().profile;
  const task = taskById(stage, taskId);
  if (!task) {
    return {
      stage,
      task: taskId,
      blockers: [`unknown task "${taskId}" for stage "${stage}"`],
      warnings: [],
      passed: false,
      prdSlug: gateOpts.prdSlug,
      moduleId: gateOpts.moduleId
    };
  }

  if (stage === "req" && !gateOpts.prdSlug && taskId !== "biz-understanding") {
    /* biz-understanding may be notes-only; other req tasks need PRD slug */
    if (["requirements-research", "requirements-analysis", "prototype-design", "prd-writing"].includes(taskId)) {
      return {
        stage,
        task: taskId,
        blockers: [`--prd <slug> required for req/${taskId}`],
        warnings: [],
        passed: false
      };
    }
  }
  if (stage === "arch" && taskId === "internal-interface" && !gateOpts.moduleId) {
    return {
      stage,
      task: taskId,
      blockers: [`--module <id> required for arch/internal-interface`],
      warnings: [],
      passed: false
    };
  }

  const suiteName = resolveSuiteName(harness, profile, stage, taskId);
  const blockers: string[] = [];
  const warnings: string[] = [];
  let suite: SuiteResult | undefined;

  const opts: RunnerOptions = {
    ...runnerOpts,
    prdSlug: gateOpts.prdSlug,
    archModule: gateOpts.moduleId
  };

  if (suiteName) {
    suite = await runOrgSuite(ws, suiteName, opts, taskId);
    blockers.push(...suite.blockers);
    warnings.push(...suite.warnings);
  } else if (task.required) {
    blockers.push(`no suite bound for ${stage}.${taskId} in profile "${profile}" (fail-closed for required task)`);
  } else {
    warnings.push(`no suite bound for optional task ${stage}.${taskId} — skipped`);
  }

  const passed = blockers.length === 0;
  if (passed && gateOpts.recordProgress !== false) {
    markOrgTaskComplete(ws, stage, taskId, { prdSlug: gateOpts.prdSlug, moduleId: gateOpts.moduleId });
  }

  return {
    stage,
    task: taskId,
    suite,
    blockers,
    warnings,
    passed,
    prdSlug: gateOpts.prdSlug,
    moduleId: gateOpts.moduleId
  };
}

/** Run all required (or profile-listed) org tasks for a stage. */
export async function orgStageGateCheckAll(
  ws: Workspace,
  stage: "req" | "arch",
  runnerOpts: RunnerOptions,
  gateOpts: OrgStageGateOpts = {}
): Promise<OrgStageGateCheckResult[]> {
  const harness = ws.readHarness();
  const profile = gateOpts.profile ?? ws.readConfig().profile;
  const taskIds =
    stage === "req"
      ? profileReqTasks(harness, profile).length
        ? profileReqTasks(harness, profile)
        : STAGE_TASKS.req.filter((t) => t.required).map((t) => t.id)
      : profileArchTasks(harness, profile).length
        ? profileArchTasks(harness, profile)
        : STAGE_TASKS.arch.filter((t) => t.required).map((t) => t.id);

  const results: OrgStageGateCheckResult[] = [];
  for (const id of taskIds) {
    results.push(await orgStageGateCheck(ws, stage, id, runnerOpts, gateOpts));
  }
  return results;
}

export function isOrgStage(stage: DeliveryStage): stage is "req" | "arch" {
  return stage === "req" || stage === "arch";
}
