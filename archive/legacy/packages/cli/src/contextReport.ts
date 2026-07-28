import {
  Workspace,
  buildNavigationReport,
  buildOrgNavigationReport,
  buildChangeNavigationReport,
  buildWorkspaceNavigationReport,
  resolvePrdSlugForReq,
  type NavigationReport,
  type OrgStage
} from "@harnessx/core";
import { ideEntryForTask, type IdeEntryHint } from "./ideEntry.js";

export type ContextScope = NavigationReport["scope"];

type WithIde<T> = T & { ide?: IdeEntryHint };

export type WorkspaceContextReport = WithIde<Extract<NavigationReport, { scope: "workspace" }>>;
export type OrgContextReport = WithIde<Extract<NavigationReport, { scope: "org" }>>;
export type ChangeContextReport = WithIde<Extract<NavigationReport, { scope: "change" }>>;
export type ContextReport = WorkspaceContextReport | OrgContextReport | ChangeContextReport;

function withIde(ws: Workspace, report: NavigationReport): ContextReport {
  const cfg = ws.readConfig();
  if (report.scope === "org") {
    return { ...report, ide: ideEntryForTask(cfg.adapter?.target, report.stage, report.task) };
  }
  if (report.scope === "change") {
    return { ...report, ide: ideEntryForTask(cfg.adapter?.target, report.stage, report.task) };
  }
  if (report.focus?.kind === "org") {
    return {
      ...report,
      ide: ideEntryForTask(cfg.adapter?.target, report.focus.stage, report.focus.task)
    };
  }
  if (report.focus?.kind === "change") {
    const ch = buildChangeNavigationReport(ws, report.focus.change);
    return { ...report, ide: ideEntryForTask(cfg.adapter?.target, ch.stage, ch.task) };
  }
  return report;
}

export function buildOrgReport(
  stage: OrgStage,
  opts: { task?: string; prdSlug?: string; moduleId?: string; root?: string }
): OrgContextReport {
  const w = Workspace.locate(opts.root ?? process.cwd());
  return withIde(w, buildOrgNavigationReport(w, stage, opts)) as OrgContextReport;
}

export function buildChangeReport(changeId: string, root = process.cwd()): ChangeContextReport {
  const w = Workspace.locate(root);
  return withIde(w, buildChangeNavigationReport(w, changeId)) as ChangeContextReport;
}

export function buildWorkspaceReport(root = process.cwd()): WorkspaceContextReport {
  const w = Workspace.locate(root);
  return withIde(w, buildWorkspaceNavigationReport(w)) as WorkspaceContextReport;
}

export interface BuildContextReportOpts {
  change?: string;
  stage?: OrgStage;
  prdSlug?: string;
  task?: string;
  moduleId?: string;
  root?: string;
}

export function buildContextReport(opts: BuildContextReportOpts = {}): ContextReport {
  const w = Workspace.locate(opts.root ?? process.cwd());
  return withIde(
    w,
    buildNavigationReport(w, {
      change: opts.change,
      stage: opts.stage,
      prdSlug: opts.prdSlug,
      task: opts.task,
      moduleId: opts.moduleId
    })
  );
}

/** @deprecated use buildChangeReport */
export function buildNextReport(changeId: string, root = process.cwd()): ChangeContextReport {
  return buildChangeReport(changeId, root);
}

export { resolvePrdSlugForReq };
