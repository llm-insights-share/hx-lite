import { Command } from "commander";
import {
  Workspace,
  STAGE_INFO,
  STAGE_TASKS,
  stageStatus,
  readMeta,
  orgCompletedTasks,
  orgStageGateCheck,
  orgStageGateCheckAll,
  isOrgStage,
  type DeliveryStage
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";
import { registerPrdOnParent } from "./prd.js";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = () => ({ builtins: builtinSensors });

function printGate(res: { blockers: string[]; warnings: string[]; passed: boolean; stage?: string; task?: string }) {
  for (const b of res.blockers) console.error(`BLOCKER  ${b}`);
  for (const w of res.warnings) console.warn(`warning  ${w}`);
  const label = res.stage && res.task ? `${res.stage}/${res.task}` : "-";
  console.log(res.passed ? `GATE PASS (${label})` : `GATE BLOCKED (${label})`);
}

function printStageTasks(stage: DeliveryStage, completed: string[] = [], locale: "en" | "zh" = "zh", asJson = false) {
  const w = ws();
  const harness = w.readHarness();
  const profile = w.readConfig().profile;
  const rows =
    stage === "req" || stage === "arch"
      ? STAGE_TASKS[stage].map((t) => ({ task: t, done: completed.includes(t.id) }))
      : stageStatus(harness, profile, stage, completed);
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          stage,
          display: STAGE_INFO[stage].display[locale],
          output: STAGE_INFO[stage].output[locale],
          tasks: rows.map(({ task, done }) => ({
            id: task.id,
            title: task.title[locale],
            required: task.required,
            done
          }))
        },
        null,
        2
      )
    );
    return;
  }
  const reqLabel = locale === "zh" ? "必选" : "req";
  const statusLabel = locale === "zh" ? "状态" : "status";
  const taskLabel = locale === "zh" ? "任务" : "task";
  const yes = locale === "zh" ? "是" : "yes";
  const no = locale === "zh" ? "否" : "no";
  const doneL = locale === "zh" ? "完成" : "done";
  const todoL = locale === "zh" ? "待办" : "todo";
  console.log(`\n${STAGE_INFO[stage].display[locale]} (${stage}) — ${STAGE_INFO[stage].output[locale]}`);
  console.log(`| ${taskLabel} | ${reqLabel} | ${statusLabel} |`);
  console.log("| --- | --- | --- |");
  for (const { task, done } of rows) {
    console.log(`| ${task.title[locale]} | ${task.required ? yes : no} | ${done ? doneL : todoL} |`);
  }
}

function resolveLocale(opt?: string): "en" | "zh" {
  if (opt === "en" || opt === "zh") return opt;
  try {
    const loc = ws().readConfig().locale;
    return loc === "zh-CN" ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function registerReqCommands(program: Command): void {
  const req = program.command("req").description("Requirements stage (org-level PRD)");
  req
    .command("status")
    .description("Show req stage task completion")
    .option("--locale <id>", "en|zh")
    .option("--json", "print machine-readable JSON")
    .action((opts: { locale?: string; json?: boolean }) => {
      printStageTasks("req", orgCompletedTasks(ws(), "req"), resolveLocale(opts.locale), !!opts.json);
    });

  req
    .command("check")
    .description("Run org req gate for one task or all required tasks")
    .option("--task <id>", "req task id (omit to run all required)")
    .option("--prd <slug>", "PRD slug")
    .action(async (opts: { task?: string; prd?: string }) => {
      const w = ws();
      if (opts.task) {
        const res = await orgStageGateCheck(w, "req", opts.task, runnerOpts(), { prdSlug: opts.prd });
        printGate(res);
        if (!res.passed) process.exit(1);
        return;
      }
      if (!opts.prd) throw new Error("--prd <slug> required when checking all req tasks");
      const results = await orgStageGateCheckAll(w, "req", runnerOpts(), { prdSlug: opts.prd });
      let failed = false;
      for (const res of results) {
        printGate(res);
        if (!res.passed) failed = true;
      }
      if (failed) process.exit(1);
    });

  const research = req.command("research").description("Requirements research sidecar");
  research
    .command("init <slug>")
    .option("--title <title>")
    .action(async (slug: string, opts: { title?: string }) => {
      const { scaffoldPrdResearch } = await import("@harnessx/core");
      console.log(`Wrote ${scaffoldPrdResearch(ws(), slug, opts.title)}`);
    });

  const analysis = req.command("analysis").description("Requirements analysis sidecar");
  analysis
    .command("init <slug>")
    .option("--title <title>")
    .action(async (slug: string, opts: { title?: string }) => {
      const { scaffoldPrdAnalysis } = await import("@harnessx/core");
      console.log(`Wrote ${scaffoldPrdAnalysis(ws(), slug, opts.title)}`);
    });

  const prototype = req.command("prototype").description("Org-level product prototype");
  prototype
    .command("init <slug>")
    .option("--title <title>")
    .action(async (slug: string, opts: { title?: string }) => {
      const { scaffoldPrdPrototype } = await import("@harnessx/core");
      console.log(`Wrote ${scaffoldPrdPrototype(ws(), slug, opts.title)}`);
    });

  const prd = req.command("prd").description("PRD authoring");
  registerPrdOnParent(prd);
}

export function registerDevCommands(program: Command): void {
  const dev = program.command("dev").description("Development stage (change delivery)");
  dev
    .command("status <change>")
    .description("Show dev stage task progress")
    .option("--locale <id>", "en|zh")
    .option("--json", "print machine-readable JSON")
    .action((change: string, opts: { locale?: string; json?: boolean }) => {
      const w = ws();
      const meta = readMeta(w, change);
      printStageTasks("dev", meta.stageProgress?.dev?.completed ?? [], resolveLocale(opts.locale), !!opts.json);
      if (!opts.json) console.log(`\ncurrent: ${meta.stage}/${meta.task}`);
    });
}

export function registerTestCommands(program: Command): void {
  const test = program.command("test").description("Testing stage");
  test
    .command("status <change>")
    .description("Show test stage task progress")
    .option("--locale <id>", "en|zh")
    .option("--json", "print machine-readable JSON")
    .action((change: string, opts: { locale?: string; json?: boolean }) => {
      const w = ws();
      const meta = readMeta(w, change);
      printStageTasks("test", meta.stageProgress?.test?.completed ?? [], resolveLocale(opts.locale), !!opts.json);
    });

  const report = test.command("report").description("Test execution report");
  report
    .command("init <change>")
    .action(async (change: string) => {
      const { scaffoldTestReport } = await import("@harnessx/core");
      console.log(`wrote ${scaffoldTestReport(ws(), change)}`);
    });
}

export function registerStageStatusCommand(program: Command): void {
  const stage = program.command("stage").description("Four-stage delivery status");
  stage
    .command("status [change]")
    .description("Show stage task completion")
    .option("--stage <stage>", "req|arch|dev|test")
    .option("--locale <id>", "en|zh")
    .option("--json", "print machine-readable JSON")
    .action((change: string | undefined, opts: { stage?: DeliveryStage; locale?: string; json?: boolean }) => {
      const w = ws();
      const st = opts.stage ?? (change ? "dev" : "req");
      const locale = resolveLocale(opts.locale);
      if (isOrgStage(st)) {
        printStageTasks(st, orgCompletedTasks(w, st), locale, !!opts.json);
        return;
      }
      if (!change) throw new Error("change id required for dev/test stage status");
      const meta = readMeta(w, change);
      printStageTasks(st, meta.stageProgress?.[st]?.completed ?? [], locale, !!opts.json);
      if (!opts.json) console.log(`\ncurrent: ${meta.stage}/${meta.task}`);
    });
}
