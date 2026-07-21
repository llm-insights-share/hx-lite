import type { Workspace } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { nextTask } from "./stageGate.js";
import { effectiveStages } from "./profileAssets.js";
import { inferDeliveryFocus, nextOrgTask, buildDeliveryTracks, type OrgStage, type DeliveryTracks } from "./orgNavigation.js";
import { listPrdSlugs } from "./prd.js";
import { readOrgStageProgress } from "./orgStageProgress.js";
import type { DeliveryStage } from "./stages.js";

export type NavigationScope = "workspace" | "org" | "change";

export interface NavigationReportBase {
  scope: NavigationScope;
  profile: string;
  activeStages: DeliveryStage[];
  suggestedCli: string;
  gateCli?: string;
  guideCli?: string;
  statusCli?: string;
  hint?: string;
}

export interface WorkspaceNavigationReport extends NavigationReportBase {
  scope: "workspace";
  changes: string[];
  focus?: ReturnType<typeof inferDeliveryFocus>;
  tracks?: DeliveryTracks;
}

export interface OrgNavigationReport extends NavigationReportBase {
  scope: "org";
  stage: OrgStage;
  task: string;
  prdSlug?: string;
  moduleId?: string;
}

export interface ChangeNavigationReport extends NavigationReportBase {
  scope: "change";
  change: string;
  stage: DeliveryStage;
  task: string;
}

export type NavigationReport = WorkspaceNavigationReport | OrgNavigationReport | ChangeNavigationReport;

function workspaceMeta(ws: Workspace) {
  const cfg = ws.readConfig();
  const harness = ws.readHarness();
  return { cfg, harness, stages: effectiveStages(cfg, harness), profile: cfg.profile };
}

function reqInitCli(task: string, slug: string): string {
  switch (task) {
    case "biz-understanding":
    case "requirements-research":
      return `hx req research init ${slug}`;
    case "requirements-analysis":
      return `hx req analysis init ${slug}`;
    case "prototype-design":
      return `hx req prototype init ${slug}`;
    case "prd-writing":
      return `hx req prd init ${slug} --title "..."`;
    default:
      return `hx req check --task ${task} --prd ${slug}`;
  }
}

function archInitCli(task: string, moduleId?: string): string {
  switch (task) {
    case "subsystem-division":
      return `hx arch init --title "..."`;
    case "internal-interface":
      return moduleId ? `hx arch lld init ${moduleId}` : `hx arch lld init <module>`;
    default:
      return `hx arch check --task ${task}`;
  }
}

export function changeTaskCli(changeId: string, stage: DeliveryStage, task: string): string {
  if (stage === "dev") {
    switch (task) {
      case "plan":
        return `hx change plan ${changeId}`;
      case "propose":
        return `hx change propose ${changeId} --title "..."`;
      case "design":
        return `hx change design ${changeId}`;
      case "apply":
        return `hx change apply ${changeId}`;
      case "verify":
        return `hx change verify ${changeId}`;
      case "archive":
        return `hx change archive ${changeId}`;
      default:
        break;
    }
  }
  if (stage === "test") {
    switch (task) {
      case "test-case-design":
        return `hx test-cases init ${changeId}`;
      case "test-execution":
        return `hx test report init ${changeId}`;
      default:
        break;
    }
  }
  return `hx gate check ${changeId} --stage ${stage} --task ${task}`;
}

export function resolvePrdSlugForReq(ws: Workspace, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const stored = readOrgStageProgress(ws).req?.prdSlug;
  if (stored) return stored;
  const slugs = listPrdSlugs(ws);
  return slugs[0];
}

export function buildOrgNavigationReport(
  ws: Workspace,
  stage: OrgStage,
  opts: { task?: string; prdSlug?: string; moduleId?: string } = {}
): OrgNavigationReport {
  const { stages, profile } = workspaceMeta(ws);
  const focus = opts.task
    ? { stage, task: opts.task, prdSlug: opts.prdSlug, moduleId: opts.moduleId }
    : nextOrgTask(ws, stage, profile);

  if (!focus) {
    return {
      scope: "org",
      profile,
      activeStages: stages,
      stage,
      task: opts.task ?? "complete",
      prdSlug: opts.prdSlug,
      moduleId: opts.moduleId,
      suggestedCli: `hx stage status --stage ${stage}`,
      statusCli: `hx stage status --stage ${stage}`,
      hint: `${stage} stage tasks complete for profile ${profile}`
    };
  }

  const task = focus.task;
  const prdSlug = opts.prdSlug ?? focus.prdSlug;
  const moduleId = opts.moduleId ?? focus.moduleId;
  const gateCli =
    stage === "req" && prdSlug
      ? `hx gate check --stage req --task ${task} --prd ${prdSlug}`
      : stage === "req"
        ? `hx req check --task ${task} --prd <slug>`
        : moduleId
          ? `hx arch check --task ${task} --module ${moduleId}`
          : `hx arch check --task ${task}`;

  const suggestedCli =
    stage === "req"
      ? prdSlug
        ? reqInitCli(task, prdSlug)
        : `hx req prd init <slug> --title "..."`
      : archInitCli(task, moduleId);

  return {
    scope: "org",
    profile,
    activeStages: stages,
    stage,
    task,
    prdSlug,
    moduleId,
    suggestedCli,
    gateCli,
    guideCli: stage === "req" && prdSlug ? `hx guide prd-pack ${prdSlug}` : `hx guide arch-pack`,
    statusCli: `hx stage status --stage ${stage}`,
    hint: prdSlug ? `PRD context: ${prdSlug}` : "set PRD slug with hx req prd init <slug>"
  };
}

export function buildChangeNavigationReport(ws: Workspace, changeId: string): ChangeNavigationReport {
  const { harness, stages, profile } = workspaceMeta(ws);
  const meta = readMeta(ws, changeId);
  const nt = nextTask(harness, meta, stages);
  return {
    scope: "change",
    profile,
    activeStages: stages,
    change: changeId,
    stage: meta.stage,
    task: meta.task,
    suggestedCli: changeTaskCli(changeId, meta.stage, meta.task),
    gateCli: `hx gate check ${changeId} --stage ${meta.stage} --task ${meta.task}`,
    guideCli: `hx guide pack ${changeId} --stage ${meta.stage} --task ${meta.task}`,
    statusCli: `hx stage status ${changeId} --stage ${meta.stage}`,
    hint: nt
      ? `after current gate passes, next task: ${nt.stage}/${nt.task}`
      : "no further tasks in active profile stages"
  };
}

export function buildWorkspaceNavigationReport(ws: Workspace): WorkspaceNavigationReport {
  const { stages, profile } = workspaceMeta(ws);
  const changes = ws.listChanges();
  const focus = inferDeliveryFocus(ws);
  const tracks = buildDeliveryTracks(ws);

  let suggestedCli = "hx doctor";
  let gateCli: string | undefined;
  let guideCli: string | undefined;
  let statusCli = "hx stage status --stage req";
  let hint: string | undefined;

  if (focus.kind === "org") {
    const org = buildOrgNavigationReport(ws, focus.stage, {
      task: focus.task,
      prdSlug: focus.prdSlug,
      moduleId: focus.moduleId
    });
    suggestedCli = org.suggestedCli;
    gateCli = org.gateCli;
    guideCli = org.guideCli;
    statusCli = org.statusCli ?? statusCli;
    hint = `focus: ${focus.stage}/${focus.task}`;
  } else if (focus.kind === "pending-cr") {
    suggestedCli = focus.suggestedCli;
    hint = `delta track: CR ${focus.crId} applied — create or link a change`;
    statusCli = "hx cr list";
  } else if (focus.kind === "change") {
    const ch = buildChangeNavigationReport(ws, focus.change);
    suggestedCli = ch.suggestedCli;
    gateCli = ch.gateCli;
    guideCli = ch.guideCli;
    statusCli = ch.statusCli;
    hint = `focus: change ${focus.change} (${ch.stage}/${ch.task})`;
  } else if (changes.length === 0) {
    hint = stages.includes("req")
      ? "start with hx req prd init <slug> or hx stage status --stage req"
      : "run hx change create <id> --domains <domain>";
    if (stages.includes("req") && listPrdSlugs(ws).length === 0) {
      suggestedCli = 'hx req prd init <slug> --title "..."';
    } else if (!stages.includes("req") && !stages.includes("arch")) {
      suggestedCli = "hx change create <id> --domains <domain>";
    }
  } else {
    hint = `multiple changes: ${changes.join(", ")} — pick one with hx next <change>`;
    suggestedCli = `hx next ${changes[0]}`;
  }

  return {
    scope: "workspace",
    profile,
    activeStages: stages,
    changes,
    focus,
    tracks,
    suggestedCli,
    gateCli,
    guideCli,
    statusCli,
    hint
  };
}

export interface BuildNavigationReportOpts {
  change?: string;
  stage?: OrgStage;
  prdSlug?: string;
  task?: string;
  moduleId?: string;
}

export function buildNavigationReport(ws: Workspace, opts: BuildNavigationReportOpts = {}): NavigationReport {
  if (opts.change) return buildChangeNavigationReport(ws, opts.change);
  if (opts.stage === "req" || opts.stage === "arch") {
    return buildOrgNavigationReport(ws, opts.stage, {
      task: opts.task,
      prdSlug: opts.prdSlug,
      moduleId: opts.moduleId
    });
  }
  return buildWorkspaceNavigationReport(ws);
}
