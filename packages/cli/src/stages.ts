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

function printStageTasks(stage: DeliveryStage, completed: string[] = []) {
  const w = ws();
  const harness = w.readHarness();
  const profile = w.readConfig().profile;
  const rows =
    stage === "req" || stage === "arch"
      ? STAGE_TASKS[stage].map((t) => ({ task: t, done: completed.includes(t.id) }))
      : stageStatus(harness, profile, stage, completed);
  console.log(`\n${STAGE_INFO[stage].display.zh} (${stage}) — ${STAGE_INFO[stage].output.zh}`);
  console.log("| 任务 | 必选 | 状态 |");
  console.log("| --- | --- | --- |");
  for (const { task, done } of rows) {
    console.log(`| ${task.title.zh} | ${task.required ? "是" : "否"} | ${done ? "完成" : "待办"} |`);
  }
}

export function registerReqCommands(program: Command): void {
  const req = program.command("req").description("Requirements stage (org-level PRD)");
  req.command("status").description("Show req stage task completion").action(() => {
    printStageTasks("req", orgCompletedTasks(ws(), "req"));
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
    .action((change: string) => {
      const w = ws();
      const meta = readMeta(w, change);
      printStageTasks("dev", meta.stageProgress?.dev?.completed ?? []);
      console.log(`\ncurrent: ${meta.stage}/${meta.task}`);
    });
}

export function registerTestCommands(program: Command): void {
  const test = program.command("test").description("Testing stage");
  test
    .command("status <change>")
    .description("Show test stage task progress")
    .action((change: string) => {
      const w = ws();
      const meta = readMeta(w, change);
      printStageTasks("test", meta.stageProgress?.test?.completed ?? []);
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
    .option("--stage <stage>", "req|arch|dev|test")
    .action((change: string | undefined, opts: { stage?: DeliveryStage }) => {
      const w = ws();
      const st = opts.stage ?? (change ? "dev" : "req");
      if (isOrgStage(st)) {
        printStageTasks(st, orgCompletedTasks(w, st));
        return;
      }
      if (!change) throw new Error("change id required for dev/test stage status");
      const meta = readMeta(w, change);
      printStageTasks(st, meta.stageProgress?.[st]?.completed ?? []);
      console.log(`\ncurrent: ${meta.stage}/${meta.task}`);
    });
}
