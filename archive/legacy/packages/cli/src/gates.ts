import { Command } from "commander";
import fs from "node:fs";
import {
  Workspace,
  nextTask,
  stageGateCheck,
  stageAdvance,
  orgStageGateCheck,
  isOrgStage,
  buildContextPack,
  renderContextPack,
  writeTaskPack,
  generateTasks,
  missingTestTasks,
  gitChangedFiles,
  installHooks,
  ciInit,
  verifyMeta,
  recordApproval,
  recordStageApproval,
  scaffoldDesign,
  readMeta,
  agentGateCheck,
  gateStopHookResponse,
  markAgentSessionFromPrompt,
  type RunnerOptions,
  type DeliveryStage
} from "@harnessx/core";
import { builtinSensors, sensorEngines } from "@harnessx/sensors";
import { registerPrdGuidePack } from "./prd.js";
import { registerArchGuidePack } from "./arch.js";
import { EXIT_FAIL } from "./exitCodes.js";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = (w: Workspace): RunnerOptions => ({
  builtins: builtinSensors, engines: sensorEngines,
  changedFiles: gitChangedFiles(w.root)
});

function printGate(res: { blockers: string[]; warnings: string[]; passed: boolean; stage?: string; task?: string }) {
  for (const b of res.blockers) console.error(`BLOCKER  ${b}`);
  for (const w of res.warnings) console.warn(`warning  ${w}`);
  const label = res.stage && res.task ? `${res.stage}/${res.task}` : "-";
  console.log(res.passed ? `GATE PASS (${label})` : `GATE BLOCKED (${label})`);
}

function changeCmd(program: Command): Command {
  return (
    (program.commands.find((c) => c.name() === "change") as Command | undefined) ??
    program.command("change").description("Manage change workspaces and delivery verbs")
  );
}

function registerDesign(cmd: Command): void {
  cmd
    .argument("<change>")
    .description("Scaffold design.md; requires the propose gate to pass")
    .action(async (change: string) => {
      const w = ws();
      const res = await stageGateCheck(w, change, "dev", "design", runnerOpts(w));
      if (!res.passed) {
        printGate(res);
        process.exit(EXIT_FAIL);
      }
      console.log(`wrote ${scaffoldDesign(w, change)}`);
    });
}

function registerPlan(cmd: Command): void {
  cmd
    .argument("<change>")
    .description("Generate dual-track tasks.md from delta specs")
    .action((change: string) => {
      const res = generateTasks(ws(), change);
      console.log(`wrote ${res.file} (${res.tasks.length} tasks)`);
      const missing = missingTestTasks(res.tasks);
      for (const m of missing) console.warn(`warning: requirement without test task (needs waiver): ${m}`);
    });
}

function registerApply(cmd: Command): void {
  cmd
    .argument("<change>")
    .description("Drive implementation task-by-task with fast-suite self-correction")
    .option("--runner <cmd>", "command executed per task; receives HX_TASK_* env vars")
    .option("--max-retries <n>", "self-correction attempts per task", "3")
    .option("--limit <n>", "process at most N tasks")
    .option("--parallel <n>", "max concurrent tasks within the same @group", "1")
    .option("--fan-out <n>", "run apply+verify in N isolated worktrees; pick best")
    .option("--dry-run", "print apply plan without running runners")
    .action(
      async (
        change: string,
        opts: { runner?: string; maxRetries: string; limit?: string; parallel?: string; fanOut?: string; dryRun?: boolean }
      ) => {
        if (opts.dryRun) {
          console.log(
            `dry-run: would apply change "${change}" (retries=${opts.maxRetries}, limit=${opts.limit ?? "all"}, parallel=${opts.parallel ?? "1"})`
          );
          return;
        }
        const { runApplyCommand } = await import("./orchestration.js");
        await runApplyCommand(change, opts);
      }
    );
}

export function registerGateCommands(program: Command): void {
  const gate = program.command("gate").description("Quality gates (fail-closed)");

  gate
    .command("check [change]")
    .description("Run stage/task gate sensors")
    .requiredOption("--stage <stage>", "delivery stage: req|arch|dev|test")
    .requiredOption("--task <task>", "task within stage")
    .option("--prd <slug>", "PRD slug (req stage)")
    .option("--module <id>", "module id (arch internal-interface)")
    .option("--json", "print machine-readable JSON")
    .action(
      async (
        change: string | undefined,
        opts: { stage: DeliveryStage; task: string; prd?: string; module?: string; json?: boolean }
      ) => {
        const w = ws();
        let res: Awaited<ReturnType<typeof stageGateCheck>> | Awaited<ReturnType<typeof orgStageGateCheck>>;
        if (isOrgStage(opts.stage)) {
          res = await orgStageGateCheck(w, opts.stage, opts.task, runnerOpts(w), {
            prdSlug: opts.prd,
            moduleId: opts.module
          });
        } else {
          if (!change) throw new Error("change id required for dev/test gate check");
          res = await stageGateCheck(w, change, opts.stage, opts.task, runnerOpts(w));
        }
        if (opts.json) {
          console.log(JSON.stringify({ ok: res.passed, code: res.passed ? 0 : EXIT_FAIL, ...res }, null, 2));
        } else {
          printGate(res);
        }
        if (!res.passed) process.exit(EXIT_FAIL);
      }
    );

  gate.command("advance <change>").description("Advance change to next stage/task after gate passes").action(async (change: string) => {
    const w = ws();
    const res = await stageAdvance(w, change, runnerOpts(w));
    printGate(res);
    if (res.toTask) console.log(`advanced: ${res.fromStage}/${res.fromTask} → ${res.toStage}/${res.toTask}`);
    if (!res.passed) process.exit(EXIT_FAIL);
  });

  gate
    .command("approve [change]")
    .description("Record a human approval for a named gate")
    .requiredOption("--gate <gate>", "gate being approved (design-to-plan|prd|arch|arch-lld|test-cases)")
    .requiredOption("--approver <name>")
    .option("--prd <slug>", "PRD slug (required when --gate prd)")
    .option("--module <id>", "module id (required when --gate arch-lld)")
    .action((change: string | undefined, opts: { gate: string; approver: string; prd?: string; module?: string }) => {
      const w = ws();
      if (opts.gate === "prd" || opts.gate === "arch" || opts.gate === "arch-lld") {
        if (opts.gate === "arch-lld" && !opts.module) throw new Error("--module required for gate arch-lld");
        const rec =
          opts.gate === "arch-lld"
            ? recordStageApproval(w, opts.gate, opts.approver, opts.prd, opts.module)
            : recordStageApproval(w, opts.gate, opts.approver, opts.prd);
        const target =
          opts.gate === "prd" ? `prd:${opts.prd}` : opts.gate === "arch-lld" ? `arch-lld:${opts.module}` : "arch:hld";
        console.log(`approved gate "${opts.gate}" (${target}) by ${rec.approver} at ${rec.at} (artifact ${rec.artifactHash.slice(0, 12)})`);
        return;
      }
      if (!change) throw new Error("change id required for change-scoped gates");
      const rec = recordApproval(w, change, opts.gate, opts.approver);
      console.log(`approved gate "${rec.gate}" by ${rec.approver} at ${rec.at} (artifact ${rec.artifactHash.slice(0, 12)})`);
    });

  gate
    .command("agent-check")
    .description("Run machine-readable gate check for IDE hooks")
    .option("--change <id>", "change id (dev/test)")
    .option("--stage <stage>", "delivery stage: req|arch|dev|test")
    .option("--task <task>", "task id within stage")
    .option("--prd <slug>", "PRD slug for req stage")
    .option("--module <id>", "module id for arch internal-interface")
    .option("--json", "print JSON result")
    .action(async (opts: { change?: string; stage?: DeliveryStage; task?: string; prd?: string; module?: string; json?: boolean }) => {
      const w = ws();
      const res = await agentGateCheck(w, runnerOpts(w), opts);
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        printGate(res);
      }
      if (!res.passed) process.exit(EXIT_FAIL);
    });

  gate
    .command("mark-session")
    .description("Record slash prompt context for stop hook")
    .requiredOption("--prompt <text>", "raw user prompt text")
    .action((opts: { prompt: string }) => {
      const mark = markAgentSessionFromPrompt(ws(), opts.prompt);
      if (!mark) {
        console.log("no-hx-slash");
        return;
      }
      console.log(`marked ${mark.stage}/${mark.task}` + (mark.change ? ` change=${mark.change}` : ""));
    });

  gate
    .command("stop-hook")
    .description("Emit Cursor stop-hook followup JSON from gate status")
    .option("--loop-limit <n>", "max automatic followups", "3")
    .action(async (opts: { loopLimit: string }) => {
      const raw = fs.readFileSync(0, "utf8");
      let input: { status?: string; loop_count?: number } = {};
      try {
        input = raw ? (JSON.parse(raw) as { status?: string; loop_count?: number }) : {};
      } catch {
        input = {};
      }
      const out = await gateStopHookResponse(ws(), runnerOpts(ws()), input, Number(opts.loopLimit || "3"));
      process.stdout.write(JSON.stringify(out) + "\n");
    });

  gate.command("hook-check").description("Fast pre-commit/pre-push check for active changes").action(async () => {
    const w = ws();
    if (!fs.existsSync(w.harnessFile)) return;
    let failed = false;
    for (const change of w.listChanges()) {
      const meta = readMeta(w, change);
      if (meta.stage !== "dev" || meta.task !== "apply") continue;
      const res = await stageGateCheck(w, change, "dev", "apply", runnerOpts(w));
      if (!res.passed) {
        printGate(res);
        failed = true;
      }
    }
    if (failed) process.exit(EXIT_FAIL);
    console.log("[hx] gate hook-check ok");
  });

  gate.command("replay").description("CI replay: re-run gates for all active changes").action(async () => {
    const w = ws();
    const harness = w.readHarness();
    let failed = false;
    for (const change of w.listChanges()) {
      const meta = readMeta(w, change);
      const next = nextTask(harness, meta);
      if (!next) continue;
      const res = await stageGateCheck(w, change, next.stage, next.task, runnerOpts(w));
      console.log(`${change} [${next.stage}/${next.task}]: ${res.passed ? "pass" : "BLOCKED"}`);
      if (!res.passed) {
        printGate(res);
        failed = true;
      }
    }
    if (failed) process.exit(EXIT_FAIL);
  });

  const guide = program.command("guide").description("Guide / context pack engine");
  guide
    .command("pack <change>")
    .description("Assemble stage/task Context Pack")
    .requiredOption("--stage <stage>", "req|arch|dev|test")
    .requiredOption("--task <task>", "task id within stage")
    .option("--out <file>", "write pack to file instead of stdout")
    .action((change: string, opts: { stage: DeliveryStage; task: string; out?: string }) => {
      const pack = buildContextPack(ws(), change, opts.stage, opts.task);
      const text = renderContextPack(pack);
      if (opts.out) {
        fs.writeFileSync(opts.out, text);
        console.log(`wrote ${opts.out} (${pack.sections.length} sections, ${pack.assembledInMs}ms)`);
      } else {
        console.log(text);
      }
    });

  guide
    .command("task-pack <change> <taskId>")
    .description("Write apply-task context pack")
    .option("--out <file>", "write pack to file (default: changes/<id>/tasks/<taskId>-pack.md)")
    .action((change: string, taskId: string, opts: { out?: string }) => {
      const w = ws();
      const res = writeTaskPack(w, change, taskId);
      const dest = opts.out ?? res.file;
      if (opts.out && opts.out !== res.file) {
        fs.copyFileSync(res.file, dest);
      }
      console.log(`wrote ${dest} (${res.pack.sections.length} sections, ${res.pack.assembledInMs}ms)`);
    });

  registerPrdGuidePack(guide);
  registerArchGuidePack(guide);

  const change = changeCmd(program);
  registerDesign(change.command("design"));
  registerPlan(change.command("plan"));
  registerApply(change.command("apply"));

  registerDesign(program.command("design").description("Alias of hx change design"));
  registerPlan(program.command("plan").description("Alias of hx change plan"));
  registerApply(program.command("apply").description("Alias of hx change apply"));

  program
    .command("hooks")
    .argument("<action>", "install")
    .description("Install git hooks for local enforcement")
    .action((action: string) => {
      if (action !== "install") throw new Error(`unknown hooks action: ${action}`);
      for (const f of installHooks(ws().root)) console.log(`installed ${f}`);
    });

  program
    .command("ci")
    .argument("<action>", "init")
    .description("Generate CI replay workflow + branch protection docs")
    .action((action: string) => {
      if (action !== "init") throw new Error(`unknown ci action: ${action}`);
      for (const f of ciInit(ws().root)) console.log(`wrote ${f}`);
    });

  const meta = program.command("meta").description("meta.yaml integrity");
  meta
    .command("verify [change]")
    .description("Verify meta.yaml content hashes")
    .option("--all", "verify every active change")
    .action((change: string | undefined, opts: { all?: boolean }) => {
      const w = ws();
      const targets = opts.all || !change ? w.listChanges() : [change];
      let failed = false;
      for (const c of targets) {
        const res = verifyMeta(w, c);
        console.log(`${c}: ${res.ok ? "ok" : "TAMPERED"}`);
        for (const p of res.problems) console.error(`  - ${p}`);
        if (!res.ok) failed = true;
      }
      if (failed) process.exit(EXIT_FAIL);
    });
}
