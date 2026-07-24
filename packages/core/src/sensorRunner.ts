import { spawnSync } from "node:child_process";
import { Workspace } from "./paths.js";
import { SensorReport, type HarnessYaml, type SensorDef, type SuiteResult } from "./schemas.js";
import { appendRun } from "./telemetry.js";
import { recordFailure } from "./failureCatalog.js";
import {
  buildShellSensorEnv,
  resolveSensorConfig,
  type ResolvedSensorConfig
} from "./sensorConfig.js";

/** Registered TS sensor handlers (invoked via inline expr `handler.<id>`). */
export type SensorHandlerFn = (ctx: {
  ws: Workspace;
  change?: string;
  def: SensorDef;
  changedFiles?: string[];
  prdSlug?: string;
  archModule?: string;
  config?: Record<string, unknown>;
  resolved?: ResolvedSensorConfig;
}) => Promise<SensorReport> | SensorReport;

/** @deprecated Use SensorHandlerFn — kept as type alias for call sites. */
export type BuiltinSensorFn = SensorHandlerFn;
export type SensorEngineFn = SensorHandlerFn;

export interface RunnerOptions {
  /** TS handlers for `handler.<id>` predicates. */
  builtins: Record<string, SensorHandlerFn>;
  engines?: Record<string, SensorEngineFn>;
  changedFiles?: string[];
  waivedSensors?: string[];
  prdSlug?: string;
  archModule?: string;
}

/**
 * Executes one sensor with retry semantics.
 * Fail-closed: crashes, timeouts and unparseable output all yield status=error → blocker.
 */
export async function runSensor(
  ws: Workspace,
  def: SensorDef,
  change: string | undefined,
  opts: RunnerOptions
): Promise<SensorReport> {
  const attempts = def.on_fail === "retry" ? def.max_retries + 1 : 1;
  let report: SensorReport = { sensor: def.id, status: "error", summary: "sensor did not run", findings: [] };
  for (let i = 0; i < attempts; i++) {
    report = await runOnce(ws, def, change, opts);
    if (report.status === "pass") break;
  }
  appendRun(ws, {
    kind: "sensor",
    change,
    name: def.id,
    status: report.status,
    detail: report.status === "pass" ? { summary: report.summary } : report
  });
  if (report.status !== "pass") recordFailure(ws, { sensor: def.id, change, report });
  return report;
}

function stripBoolEq(s: string): string {
  return s.replace(/\s*==\s*true\s*$/i, "").trim();
}

async function runOnce(ws: Workspace, def: SensorDef, change: string | undefined, opts: RunnerOptions): Promise<SensorReport> {
  try {
    const resolved = resolveSensorConfig(ws, def);
    const ctx = {
      ws,
      change,
      def,
      changedFiles: opts.changedFiles,
      prdSlug: opts.prdSlug,
      archModule: opts.archModule,
      config: resolved.config,
      resolved
    };

    if (resolved.check === "inline") {
      const expr = stripBoolEq(resolved.expr ?? "");
      const handlerMatch = expr.match(/^handler\.([\w-]+)$/i);
      if (handlerMatch) {
        const id = handlerMatch[1]!;
        const fn = opts.builtins[id];
        if (!fn) return errorReport(def, `handler "${id}" is not registered`);
        return SensorReport.parse(await fn(ctx));
      }
      const fn = opts.engines?.inline;
      if (!fn) return errorReport(def, 'inline check requires "inline" engine registration');
      return SensorReport.parse(await fn(ctx));
    }

    if (resolved.check === "rules") {
      const fn = opts.engines?.rules;
      if (!fn) return errorReport(def, 'rules check requires "rules" engine registration');
      return SensorReport.parse(await fn(ctx));
    }

    if (resolved.check === "shell") {
      if (!resolved.run) return errorReport(def, "shell sensor missing run command");
      let profile = "";
      try {
        profile = ws.readConfig().profile ?? "";
      } catch {
        /* ignore */
      }
      return runShellSensor(ws, { ...def, run: resolved.run }, change, {
        env: buildShellSensorEnv(ws, def, change, {
          config: resolved.config,
          prdSlug: opts.prdSlug,
          changedFiles: opts.changedFiles,
          profile
        })
      });
    }

    return errorReport(def, `unknown check kind`);
  } catch (e) {
    return errorReport(def, `sensor crashed: ${(e as Error).message}`);
  }
}

function errorReport(def: SensorDef, message: string): SensorReport {
  return {
    sensor: def.id,
    status: "error",
    summary: message,
    findings: [{ severity: "block", message }],
    fix_hint: def.fix_hint,
    agent_instruction:
      "This sensor errored; the gate is blocked (fail-closed). Fix the sensor configuration or the underlying issue."
  };
}

export interface ShellSensorOpts {
  env?: Record<string, string>;
}

/** Shell sensor protocol: exit 0 = pass; JSON on stdout is parsed as a SensorReport when present. */
export function runShellSensor(
  ws: Workspace,
  def: SensorDef,
  change?: string,
  opts: ShellSensorOpts = {}
): SensorReport {
  let cmd = (def.run as string).replaceAll("$CHANGE", change ?? "");
  const env = opts.env ?? {};
  cmd = cmd
    .replaceAll("$ROOT", env.HX_ROOT ?? ws.root)
    .replaceAll("$BASE", env.HX_BASE ?? ws.base)
    .replaceAll("$SENSOR_ID", env.HX_SENSOR_ID ?? def.id)
    .replaceAll("$OUTPUT_FILE", env.HX_OUTPUT_FILE ?? "")
    .replaceAll("$OUTPUT", env.HX_OUTPUT ?? "")
    .replaceAll("$SCOPE", env.HX_SCOPE ?? "")
    .replaceAll("$PROFILE", env.HX_PROFILE ?? "");

  const res = spawnSync(cmd, {
    shell: true,
    cwd: ws.root,
    timeout: def.timeout_ms,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  if (res.error) return errorReport(def, `spawn failed: ${res.error.message}`);
  if (res.signal) return errorReport(def, `sensor timed out or was killed (${res.signal})`);

  const stdout = (res.stdout ?? "").trim();
  const jsonLine = stdout.split("\n").find((l) => l.startsWith("{"));
  if (jsonLine) {
    try {
      return SensorReport.parse({ sensor: def.id, ...JSON.parse(jsonLine) });
    } catch {
      if (res.status !== 0) return errorReport(def, "sensor emitted unparseable JSON report (fail-closed)");
    }
  }
  if (res.status === 0) return { sensor: def.id, status: "pass", summary: "ok", findings: [] };
  return {
    sensor: def.id,
    status: "fail",
    summary: `exit ${res.status}`,
    findings: [
      {
        severity: "block",
        message: (res.stderr || stdout || `command failed: ${cmd}`).slice(0, 2000)
      }
    ],
    fix_hint: def.fix_hint,
    fix_command: change ? `hx fix --change ${change} --sensor ${def.id}` : undefined
  };
}

/** Runs a named Sensor Suite from harness.yaml; aggregates blockers/warnings. */
export async function runSuite(
  ws: Workspace,
  harness: HarnessYaml,
  suiteName: string,
  change: string | undefined,
  opts: RunnerOptions
): Promise<SuiteResult> {
  const ids = harness.suites[suiteName];
  if (!ids) {
    return {
      suite: suiteName,
      passed: false,
      reports: [],
      blockers: [`suite "${suiteName}" is not defined in harness.yaml (fail-closed)`],
      warnings: [],
      fixHints: []
    };
  }
  const result: SuiteResult = { suite: suiteName, passed: true, reports: [], blockers: [], warnings: [], fixHints: [] };
  for (const id of ids) {
    const def = harness.sensors.find((s) => s.id === id);
    if (!def) {
      result.blockers.push(`sensor "${id}" referenced by suite "${suiteName}" is not registered (fail-closed)`);
      continue;
    }
    const report = await runSensor(ws, def, change, opts);
    result.reports.push(report);
    const waived = opts.waivedSensors?.includes(def.id) ?? false;
    if (report.status === "pass") continue;
    const label = `${def.id}: ${report.summary}`;
    if (waived) result.warnings.push(`${label} (waived)`);
    else if (report.status === "error") result.blockers.push(`${label} [sensor error — fail-closed]`);
    else if (def.on_fail === "warn") result.warnings.push(label);
    else result.blockers.push(label);
    if (report.fix_hint) result.fixHints.push(`${def.id}: ${report.fix_hint}`);
  }
  result.passed = result.blockers.length === 0;
  appendRun(ws, {
    kind: "suite",
    change,
    name: suiteName,
    status: result.passed ? "pass" : "fail",
    detail: { blockers: result.blockers }
  });
  return result;
}
