import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  Workspace,
  resolveAssets,
  promoteAsset,
  backfillMetrics,
  writeLock,
  verifyLock,
  scanAssetDir,
  loadAssetDir,
  type AssetStatus
} from "@harnessx/core";
import { builtinSensors, sensorEngines } from "@harnessx/sensors";
import { compileAdapters, adapterDrift, availableTargets, exportQoderQuest, TARGETS, computeTier } from "@harnessx/adapters";
import { runScheduled, startWatcher, buildFixPack } from "@harnessx/core";
import { registerHubCommands } from "./hubCommands.js";
import { EXIT_FAIL } from "./exitCodes.js";

const ws = () => Workspace.locate(process.cwd());
const runnerOpts = () => ({ builtins: builtinSensors, engines: sensorEngines });

export function registerAssetCommands(program: Command): void {
  const asset = program.command("asset").description("Local asset model");
  asset.command("list").description("List resolved assets").option("--change <id>").action((opts: { change?: string }) => {
    const res = resolveAssets(ws(), { changeId: opts.change });
    for (const [id, a] of res.resolved) {
      console.log(`${id}\t${a.manifest.kind}\t${a.manifest.status}\t${a.layer}\tv${a.manifest.version}`);
    }
    for (const p of res.problems) console.warn(`warning: ${p}`);
  });
  asset
    .command("promote <dir>")
    .description("Promote an asset directory to a new lifecycle status")
    .requiredOption("--to <status>", "trial | enforced | deprecated")
    .action((dir: string, opts: { to: string }) => {
      const m = promoteAsset(path.resolve(dir), opts.to as AssetStatus);
      console.log(`${m.id} → ${m.status}`);
    });
  asset.command("backfill <dir>").description("Backfill metrics from telemetry").action((dir: string) => {
    const a = loadAssetDir(path.resolve(dir), "local");
    if (!a) throw new Error("no asset.yaml found");
    const m = backfillMetrics(ws(), a);
    console.log(`metrics: runs=${m.metrics["runs"]}, failures=${m.metrics["failures"]}`);
  });
  asset.command("scan <dir>").description("Injection scan of guide content").action((dir: string) => {
    const findings = scanAssetDir(path.resolve(dir));
    for (const f of findings) console.error(`INJECTION ${f}`);
    if (findings.length) process.exit(EXIT_FAIL);
    console.log("no injection patterns found");
  });

  const lock = program.command("lock").description("harness.lock pin and verify");
  lock.command("write").description("Write harness.lock from resolved assets").action(() => {
    const l = writeLock(ws());
    console.log(`locked ${Object.keys(l.assets).length} asset(s)`);
  });
  lock.command("verify").description("Verify harness.lock hashes").action(() => {
    const res = verifyLock(ws());
    for (const p of res.problems) console.error(`LOCK ${p}`);
    if (!res.ok) process.exit(EXIT_FAIL);
    console.log("harness.lock verified");
  });

  registerHubCommands(program, { mode: "hx" });

  const adapter = program.command("adapter").description("Single-source adapter compilation");
  adapter
    .command("sync")
    .description("Compile harness assets into IDE targets")
    .option("--targets <list>", "comma-separated targets", "cursor,trae,qoder,claude,generic")
    .action((opts: { targets: string }) => {
      const results = compileAdapters(ws(), opts.targets.split(","));
      for (const r of results) {
        console.log(`${r.target} (Tier ${r.tier}): ${r.files.length} file(s)`);
        for (const f of r.files) console.log(`  + ${f}`);
      }
    });
  adapter
    .command("targets")
    .description("List adapter targets and capability tiers")
    .option("--json", "print machine-readable JSON")
    .action((opts: { json?: boolean }) => {
      const rows = availableTargets().map((t) => {
        const spec = TARGETS[t]!;
        const caps = Object.entries(spec.capabilities)
          .filter(([, v]) => v)
          .map(([k]) => k);
        return { target: t, tier: computeTier(spec.capabilities), capabilities: caps };
      });
      if (opts.json) {
        console.log(JSON.stringify({ ok: true, targets: rows }, null, 2));
        return;
      }
      for (const r of rows) console.log(`${r.target}\tTier ${r.tier}\t${r.capabilities.join(",")}`);
    });
  adapter
    .command("drift")
    .description("Detect hand-edits to generated adapter files")
    .option("--targets <list>", "targets to check", "cursor,trae,qoder,claude,generic")
    .action((opts: { targets: string }) => {
      void opts;
      const w = ws();
      const candidates: string[] = [];
      const collect = (dir: string) => {
        const abs = path.join(w.root, dir);
        if (!fs.existsSync(abs)) return;
        const visit = (d: string) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) visit(p);
            else candidates.push(path.relative(w.root, p));
          }
        };
        visit(abs);
      };
      for (const dir of [".cursor", ".trae", ".qoder", ".claude"]) collect(dir);
      for (const f of ["CLAUDE.md", "AGENTS.md"]) if (fs.existsSync(path.join(w.root, f))) candidates.push(f);
      const drift = adapterDrift(w, candidates);
      for (const d of drift) console.error(`DRIFT ${d.file}: ${d.state}`);
      if (drift.length) process.exit(EXIT_FAIL);
      console.log("no adapter drift");
    });
  adapter.command("quest <change>").description("Export a Qoder Quest spec from delta specs + tasks").action((change: string) => {
    console.log(`wrote ${exportQoderQuest(ws(), change)}`);
  });

  program
    .command("watch")
    .description("File-save trigger daemon")
    .action(() => {
      const w = ws();
      console.log("watching for file-save triggered sensors (ctrl-c to stop)");
      startWatcher(w, runnerOpts(), (file, reports) => {
        for (const r of reports) console.log(`[${r.status}] ${r.sensor} ← ${file}: ${r.summary}`);
      });
    });

  program
    .command("schedule")
    .argument("<action>", "run")
    .description("Run trigger:schedule sensors (CI cron entry)")
    .action(async (action: string) => {
      if (action !== "run") throw new Error(`unknown schedule action: ${action}`);
      const reports = await runScheduled(ws(), runnerOpts());
      for (const r of reports) console.log(`[${r.status}] ${r.sensor}: ${r.summary}`);
      if (reports.some((r) => r.status !== "pass")) process.exit(EXIT_FAIL);
    });

  program
    .command("fix")
    .requiredOption("--change <id>")
    .requiredOption("--sensor <id>")
    .option("--runner <cmd>", "launch a fix session command with HX_FIX_PACK env")
    .description("Build a fix Context Pack from the last failing sensor report")
    .action((opts: { change: string; sensor: string; runner?: string }) => {
      const pack = buildFixPack(ws(), opts.change, opts.sensor);
      console.log(`fix pack: ${pack.file} (${pack.findings} finding(s))`);
      if (opts.runner) {
        const r = spawnSync(opts.runner, { shell: true, stdio: "inherit", env: { ...process.env, HX_FIX_PACK: pack.file } });
        process.exit(r.status ?? 0);
      }
    });
}
