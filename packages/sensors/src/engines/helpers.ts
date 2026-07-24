import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";

export type EngineFn = (ctx: SensorContext) => Promise<SensorReport> | SensorReport;

export function cfg(ctx: SensorContext): Record<string, unknown> {
  return (ctx.config ?? ctx.resolved?.config ?? {}) as Record<string, unknown>;
}

export function block(
  findings: SensorReport["findings"],
  ctx: SensorContext,
  summary: string,
  agent?: string
): SensorReport {
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length ? agent ?? "Fix each finding, then re-run the gate check." : undefined
  };
}
