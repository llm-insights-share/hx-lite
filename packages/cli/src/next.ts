import { Command } from "commander";
import { Workspace } from "@harnessx/core";
import { buildContextReport, buildChangeReport, type ContextReport } from "./contextReport.js";
import { EXIT_USAGE, exitWith } from "./exitCodes.js";

const ws = () => Workspace.locate(process.cwd());

function resolveChangeArg(change?: string): string {
  const w = ws();
  if (change) return change;
  const changes = w.listChanges();
  if (changes.length === 1) return changes[0]!;
  if (!changes.length) throw new Error("no active changes — pass <change> or run hx change create");
  throw new Error(`multiple active changes: ${changes.join(", ")} — pass <change>`);
}

function printContextReport(report: ContextReport): void {
  console.log(`scope\t${report.scope}`);
  console.log(`profile\t${report.profile}`);
  console.log(`stages\t${report.activeStages.join(",")}`);
  if (report.scope === "workspace") {
    console.log(`changes\t${report.changes.join(",") || "(none)"}`);
    if (report.focus) console.log(`focus\t${report.focus.kind}`);
    if (report.tracks) {
      for (const g of report.tracks.baseline) {
        console.log(`track-baseline\tprd=${g.prd}\t${g.changes.join(",") || "(none)"}`);
      }
      for (const p of report.tracks.delta.pendingCrs) {
        console.log(`track-delta-pending\t${p.id}\t${p.suggestedCli}`);
      }
      for (const l of report.tracks.delta.linkedChanges) {
        console.log(`track-delta-linked\t${l.crId}→${l.change}`);
      }
    }
  }
  if (report.scope === "org") {
    console.log(`stage/task\t${report.stage}/${report.task}`);
    if (report.prdSlug) console.log(`prd\t${report.prdSlug}`);
    if (report.moduleId) console.log(`module\t${report.moduleId}`);
  }
  if (report.scope === "change") {
    console.log(`change\t${report.change}`);
    console.log(`stage/task\t${report.stage}/${report.task}`);
  }
  if (report.gateCli) console.log(`gate\t${report.gateCli}`);
  console.log(`suggested\t${report.suggestedCli}`);
  if (report.guideCli) console.log(`guide\t${report.guideCli}`);
  if (report.statusCli) console.log(`status\t${report.statusCli}`);
  if (report.ide?.slash) console.log(`ide-slash\t${report.ide.slash}`);
  if (report.ide?.skillPath) console.log(`ide-skill\t${report.ide.skillPath}`);
  if (report.ide?.note) console.log(`ide-note\t${report.ide.note}`);
  if (report.hint) console.log(`hint\t${report.hint}`);
}

export function registerNextCommand(program: Command): void {
  program
    .command("next [change]")
    .description("Suggest the next CLI and IDE entry (workspace, org stage, or change)")
    .option("--stage <stage>", "org stage: req|arch")
    .option("--prd <slug>", "PRD slug for req stage")
    .option("--task <id>", "task id override")
    .option("--module <id>", "module id for arch internal-interface")
    .option("--json", "print machine-readable JSON")
    .action((change: string | undefined, opts: { stage?: string; prd?: string; task?: string; module?: string; json?: boolean }) => {
      let report: ContextReport;
      try {
        if (change) {
          report = buildChangeReport(resolveChangeArg(change));
        } else if (opts.stage === "req" || opts.stage === "arch") {
          report = buildContextReport({
            stage: opts.stage,
            prdSlug: opts.prd,
            task: opts.task,
            moduleId: opts.module
          });
        } else if (opts.stage) {
          throw new Error("--stage must be req or arch when no <change> is given");
        } else {
          report = buildContextReport({});
        }
      } catch (e) {
        exitWith(EXIT_USAGE, `hx: ${(e as Error).message}`);
      }
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      printContextReport(report);
    });
}

// Re-export for tui and tests
export { buildChangeReport as buildNextReport } from "./contextReport.js";
export type { ChangeContextReport as NextReport } from "./contextReport.js";
