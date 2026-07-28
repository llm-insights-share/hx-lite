import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  Workspace,
  validateHarnessCompleteness,
  verifyLock,
  resolveHubContext,
  hubConfigSource
} from "@harnessx/core";
import { TARGETS, computeTier, availableTargets } from "@harnessx/adapters";
import { EXIT_CONFIG, EXIT_FAIL, exitWith } from "./exitCodes.js";

const ws = () => Workspace.locate(process.cwd());

export interface DoctorReport {
  ok: boolean;
  findings: { level: "error" | "warn" | "info"; code: string; message: string; suggestion?: string }[];
  adapterTier?: number;
  profile?: string;
}

export function runDoctor(root = process.cwd()): DoctorReport {
  const findings: DoctorReport["findings"] = [];
  let workspace: Workspace;
  try {
    workspace = Workspace.locate(root);
  } catch {
    findings.push({
      level: "error",
      code: "NO_HARNESS",
      message: "harnessX/ not found",
      suggestion: "Run hx project create or hx init in this directory"
    });
    return { ok: false, findings };
  }

  if (!fs.existsSync(workspace.harnessFile)) {
    findings.push({ level: "error", code: "NO_HARNESS_YAML", message: "harness.yaml missing" });
  }

  let profile: string | undefined;
  try {
    const cfg = workspace.readConfig();
    profile = cfg.profile;
    findings.push({ level: "info", code: "PROFILE", message: `profile=${cfg.profile}` });
    if (cfg.adapter?.target) findings.push({ level: "info", code: "ADAPTER", message: `adapter.target=${cfg.adapter.target}` });
  } catch (e) {
    findings.push({
      level: "warn",
      code: "CONFIG",
      message: `config.yaml: ${(e as Error).message}`,
      suggestion: "Run hx init or hx project create"
    });
  }

  try {
    const completeness = validateHarnessCompleteness(workspace, { profile });
    for (const f of completeness.findings) {
      findings.push({
        level: f.level === "error" ? "error" : f.level === "warn" ? "warn" : "info",
        code: f.code,
        message: f.message,
        suggestion: f.suggestion
      });
    }
  } catch (e) {
    findings.push({ level: "warn", code: "COMPLETENESS", message: (e as Error).message });
  }

  if (fs.existsSync(workspace.lockFile)) {
    const lock = verifyLock(workspace);
    if (!lock.ok) {
      for (const p of lock.problems) findings.push({ level: "error", code: "LOCK", message: p, suggestion: "hx lock write" });
    } else {
      findings.push({ level: "info", code: "LOCK", message: "harness.lock verified" });
    }
  } else {
    findings.push({ level: "warn", code: "LOCK", message: "harness.lock missing", suggestion: "hx lock write" });
  }

  const tierFile = path.join(workspace.root, ".harnessx-adapter-tier");
  let adapterTier: number | undefined;
  if (fs.existsSync(tierFile)) {
    adapterTier = parseInt(fs.readFileSync(tierFile, "utf8").trim(), 10);
    findings.push({ level: "info", code: "ADAPTER_TIER", message: `adapter tier=${adapterTier}` });
  } else {
    findings.push({ level: "warn", code: "ADAPTER_TIER", message: "adapter not synced", suggestion: "hx adapter sync" });
  }

  try {
    const cfg = workspace.readConfig();
    const hubRef = hubConfigSource(cfg.hub);
    if (hubRef) {
      resolveHubContext(workspace, { hubRef, action: "hub.search", offline: true });
      findings.push({ level: "info", code: "HUB", message: `hub source configured (${hubRef})` });
    }
  } catch (e) {
    findings.push({ level: "warn", code: "HUB", message: (e as Error).message });
  }

  for (const t of availableTargets()) {
    const spec = TARGETS[t];
    if (!spec) continue;
    void computeTier(spec.capabilities);
  }

  const ok = !findings.some((f) => f.level === "error");
  return { ok, findings, adapterTier, profile };
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check harness workspace health (config, completeness, lock, adapter)")
    .option("--json", "print machine-readable JSON")
    .action((opts: { json?: boolean }) => {
      const report = runDoctor();
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        for (const f of report.findings) {
          const sug = f.suggestion ? ` → ${f.suggestion}` : "";
          console.log(`${f.level.toUpperCase()}\t${f.code}\t${f.message}${sug}`);
        }
        console.log(report.ok ? "doctor: ok" : "doctor: issues found");
      }
      if (!report.ok) exitWith(EXIT_CONFIG);
    });
}
