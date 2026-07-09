import { Command } from "commander";
import fs from "node:fs";
import {
  Workspace,
  scaffoldArchHld,
  scaffoldArchLld,
  readArchRegistry,
  runSensor,
  runHarnessSuite,
  buildArchPack,
  renderContextPack
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = () => ({ builtins: builtinSensors });

function exitOnSuite(res: { passed: boolean; blockers: string[]; warnings: string[] }) {
  for (const b of res.blockers) console.error(`BLOCKER  ${b}`);
  for (const w of res.warnings) console.warn(`warning  ${w}`);
  if (!res.passed) process.exit(1);
  console.log("GATE PASS");
}

export function registerArchCommands(program: Command): void {
  const arch = program.command("arch").description("Organization-level architecture (pre-phase)");

  arch
    .command("init")
    .option("--title <title>", "system title", "System")
    .action((opts: { title: string }) => {
      const res = scaffoldArchHld(ws(), opts.title);
      console.log(`Wrote ${res.overview}`);
      console.log(`Wrote ${res.registry}`);
    });

  arch.command("check").action(async () => {
    const res = await runHarnessSuite(ws(), "arch-check", runnerOpts());
    exitOnSuite(res);
  });

  arch.command("list").action(() => {
    const reg = readArchRegistry(ws());
    for (const m of reg.modules) console.log(`${m.id}\t${m.status}\t[${m.capabilities.join(",")}]`);
  });

  arch
    .command("align <change>")
    .description("Report arch alignment for a change (diagnostic)")
    .action(async (change: string) => {
      const w = ws();
      const def = w.readHarness().sensors.find((s) => s.id === "arch-change-align");
      if (!def) throw new Error("arch-change-align not registered");
      const report = await runSensor(w, def, change, runnerOpts());
      console.log(`${report.status.toUpperCase()}  ${report.summary}`);
      for (const f of report.findings) console.log(`  [${f.severity}] ${f.message}`);
      if (report.status !== "pass") process.exit(1);
    });

  const lld = arch.command("lld").description("Module-level LLD under docs/architecture/modules/");

  lld
    .command("init <module>")
    .requiredOption("--title <title>", "module title")
    .action((moduleId: string, opts: { title: string }) => {
      console.log(`Wrote ${scaffoldArchLld(ws(), moduleId, opts.title)}`);
    });

  lld
    .command("check [module]")
    .option("--all", "check all active modules")
    .action(async (module: string | undefined, opts: { all?: boolean }) => {
      const w = ws();
      const modules = opts.all
        ? readArchRegistry(w)
            .modules.filter((m) => m.status === "active")
            .map((m) => m.id)
        : module
          ? [module]
          : [];
      if (modules.length === 0) throw new Error("specify <module> or --all");
      let failed = false;
      for (const id of modules) {
        const def = w.readHarness().sensors.find((s) => s.id === "arch-lld-complete");
        if (!def) throw new Error("arch-lld-complete not registered");
        const report = await runSensor(w, def, undefined, { ...runnerOpts(), archModule: id });
        if (report.status !== "pass") {
          console.error(`FAIL  ${id}: ${report.summary}`);
          failed = true;
        } else console.log(`PASS  ${id}`);
      }
      if (failed) process.exit(1);
    });
}

export function registerArchGuidePack(guide: Command): void {
  guide
    .command("arch-pack")
    .option("--module <id>", "scope to one module LLD")
    .option("--out <file>", "write pack to file")
    .action((opts: { module?: string; out?: string }) => {
      const pack = buildArchPack(ws(), opts.module);
      const text = renderContextPack(pack);
      if (opts.out) {
        fs.writeFileSync(opts.out, text);
        console.log(`wrote ${opts.out}`);
      } else console.log(text);
    });
}
