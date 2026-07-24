import {
  Workspace,
  listPrdSlugs,
  orgCompletedTasks,
  STAGE_INFO,
  readMeta,
  type OrgStage
} from "@harnessx/core";
import { runDoctor } from "./doctor.js";
import {
  buildWorkspaceReport,
  buildOrgReport,
  buildChangeReport,
  resolvePrdSlugForReq
} from "./contextReport.js";
import { tuiStrings, type TuiLocale } from "./tuiLocale.js";
import type { TuiContext } from "./tuiMenus.js";

const ws = () => Workspace.locate(process.cwd());

export type ContextScreen =
  | { kind: "home" }
  | { kind: "org"; stage: OrgStage; prdSlug?: string; moduleId?: string }
  | { kind: "change"; change: string }
  | { kind: "change-picker" }
  | { kind: "prd-picker"; stage: OrgStage };

let changePickerItems: string[] = [];

export function getChangePickerItems(): string[] {
  return changePickerItems;
}

function orgProgressSummary(stage: OrgStage, locale: TuiLocale): string {
  const completed = orgCompletedTasks(ws(), stage);
  const loc = locale === "zh" ? "zh" : "en";
  return tuiStrings(locale).tasksMarkedDone(STAGE_INFO[stage].display[loc], completed.length);
}

export function printContextScreen(screen: ContextScreen, locale: TuiLocale, ctx: TuiContext): void {
  const labels = tuiStrings(locale);
  if (screen.kind === "home") {
    const report = buildWorkspaceReport();
    const doctor = runDoctor();
    console.log(labels.homeTitle);
    console.log(`${labels.profile}: ${report.profile}  ${labels.stages}: ${report.activeStages.join(", ")}`);
    console.log(`${labels.changes}: ${report.changes.join(", ") || labels.none}`);
    if (report.focus?.kind === "org") {
      console.log(`${labels.focus}: ${labels.focusOrg(report.focus.stage, report.focus.task)}`);
    } else if (report.focus?.kind === "pending-cr") {
      console.log(`${labels.focus}: ${labels.focusPendingCr(report.focus.crId)}`);
    } else if (report.focus?.kind === "change") {
      console.log(`${labels.focus}: ${labels.focusChange(report.focus.change)}`);
    }
    console.log(`doctor: ${doctor.ok ? labels.doctorOk : labels.doctorIssues}`);
    if (report.activeStages.includes("req")) console.log(orgProgressSummary("req", locale));
    if (report.activeStages.includes("arch")) console.log(orgProgressSummary("arch", locale));
    printTracks(report, locale);
    if (report.hint) console.log(`${labels.hint}: ${report.hint}`);
    return;
  }

  if (screen.kind === "org") {
    const prdSlug = screen.stage === "req" ? resolvePrdSlugForReq(ws(), screen.prdSlug) : screen.prdSlug;
    const report = buildOrgReport(screen.stage, { prdSlug, moduleId: screen.moduleId });
    const doctor = runDoctor();
    printReport(report, labels.orgStageTitle(screen.stage), locale);
    console.log(`doctor: ${doctor.ok ? labels.doctorOk : labels.doctorIssues}`);
    return;
  }

  if (screen.kind === "change") {
    const report = buildChangeReport(screen.change);
    const doctor = runDoctor();
    printReport(report, labels.changeTitle, locale);
    console.log(`doctor: ${doctor.ok ? labels.doctorOk : labels.doctorIssues}`);
    return;
  }

  if (screen.kind === "change-picker") {
    printChangePicker(locale);
    return;
  }

  if (screen.kind === "prd-picker") {
    console.log(labels.selectPrdTitle);
    listPrdSlugs(ws()).forEach((slug, i) => console.log(`  ${i + 1}. ${slug}`));
  }
}

function printReport(
  report: ReturnType<typeof buildOrgReport>,
  title: string,
  locale: TuiLocale
): void {
  const labels = tuiStrings(locale);
  console.log(title);
  console.log(`${labels.profile}: ${report.profile}  ${labels.stages}: ${report.activeStages.join(", ")}`);
  if (report.scope === "org") {
    console.log(`${labels.context}: ${report.stage}/${report.task}`);
    if (report.prdSlug) console.log(labels.prdLine(report.prdSlug));
    if (report.moduleId) console.log(`${labels.module}: ${report.moduleId}`);
  }
  if (report.scope === "change") {
    console.log(`${labels.change}: ${report.change}  ${labels.stageTask}: ${report.stage}/${report.task}`);
  }
  if (report.gateCli) console.log(`${labels.gate}: ${report.gateCli}`);
  console.log(`${labels.suggested}: ${report.suggestedCli}`);
  if (report.guideCli) console.log(`${labels.guide}: ${report.guideCli}`);
  if (report.ide?.slash) console.log(`IDE: ${report.ide.slash}`);
  else if (report.ide?.skillPath) console.log(`IDE: ${report.ide.skillPath}`);
  if (report.hint) console.log(`${labels.hint}: ${report.hint}`);
}

function printTracks(report: ReturnType<typeof buildWorkspaceReport>, locale: TuiLocale): void {
  if (!report.tracks) return;
  const labels = tuiStrings(locale);
  const { baseline, delta } = report.tracks;
  if (baseline.length) {
    console.log(labels.baselineTrack + ":");
    for (const g of baseline) {
      console.log(`  PRD ${g.prd}: ${g.changes.join(", ") || labels.none}`);
    }
  }
  if (delta.pendingCrs.length || delta.linkedChanges.length) {
    console.log(labels.deltaTrack + ":");
    for (const p of delta.pendingCrs) {
      console.log(`  ${labels.focusPendingCr(p.id)}${p.prd ? ` (prd=${p.prd})` : ""} ${labels.pendingCrCreate}`);
    }
    for (const l of delta.linkedChanges) {
      console.log(`  ${l.crId} → ${l.change}${l.prd ? ` (prd=${l.prd})` : ""}`);
    }
  }
}

function printChangePicker(locale: TuiLocale): void {
  const labels = tuiStrings(locale);
  const report = buildWorkspaceReport();
  console.log(labels.selectChangeTitle);
  const flat: string[] = [];
  if (report.tracks?.baseline.length) {
    for (const g of report.tracks.baseline) {
      console.log(`  PRD ${g.prd}:`);
      for (const id of g.changes) {
        flat.push(id);
        console.log(`    ${flat.length}. ${id}`);
      }
    }
  }
  if (report.tracks?.delta.linkedChanges.length) {
    console.log(`  ${labels.deltaFromCr}:`);
    for (const l of report.tracks.delta.linkedChanges) {
      flat.push(l.change);
      console.log(`    ${flat.length}. ${l.change} ← ${l.crId}`);
    }
  }
  if (!flat.length) {
    const changes = ws().listChanges();
    if (!changes.length) {
      console.log(labels.noActiveChanges);
    } else {
      changes.forEach((id, i) => {
        flat.push(id);
        let tag = "";
        try {
          const meta = readMeta(ws(), id);
          if (meta.prdRef) tag = ` prd=${meta.prdRef}`;
          if (meta.sourceCr) tag += ` cr=${meta.sourceCr}`;
        } catch {
          /* ignore */
        }
        console.log(`  ${i + 1}. ${id}${tag}`);
      });
    }
  }
  changePickerItems = flat;
}

export function contextScreenFromCtxNode(
  nodeId: string,
  ctx: TuiContext
): ContextScreen | null {
  if (nodeId === "ctx-home") return { kind: "home" };
  if (nodeId === "ctx-req") return { kind: "org", stage: "req", prdSlug: ctx.prdSlug };
  if (nodeId === "ctx-arch") return { kind: "org", stage: "arch", moduleId: ctx.moduleId };
  if (nodeId === "ctx-change" && ctx.change) return { kind: "change", change: ctx.change };
  return null;
}

export function syncCtxFromScreen(ctx: TuiContext, screen: ContextScreen): TuiContext {
  if (screen.kind === "change") return { ...ctx, change: screen.change };
  if (screen.kind === "org") {
    return { ...ctx, orgStage: screen.stage, prdSlug: screen.prdSlug, moduleId: screen.moduleId };
  }
  return ctx;
}
