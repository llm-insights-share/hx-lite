import fs from "node:fs";
import path from "node:path";
import { readRubric, runRubric, commandJudge, listDeltaFiles, type Judge } from "@harnessx/core";
import { resolveLayerRules, loadLayerRulesFromFile } from "../layerRules.js";
import { archBoundary } from "../archBoundary.js";
import { budget } from "../budget.js";
import { driftSensor, integrationSmoke } from "../drift.js";
import { mutationProbe } from "../mutation.js";
import { fixtureHash } from "../builtins.js";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { cfg } from "./helpers.js";

/** Rubric engine with explicit rules paths from config. */
export const rubricEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const files: string[] = [];
  const rules = (c.rules as string[] | undefined) ?? ctx.def.rules ?? ctx.resolved?.rules ?? [];
  for (const r of rules) {
    const abs = path.isAbsolute(r) ? r : path.join(ctx.ws.base, r);
    if (fs.existsSync(abs)) files.push(abs);
  }
  if (files.length === 0) {
    const dir = path.join(ctx.ws.base, "assets", "rubrics");
    if (fs.existsSync(dir)) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name, "rules.yaml");
        if (e.isDirectory() && fs.existsSync(f)) files.push(f);
      }
    }
  }

  const judge: Judge | undefined = process.env.HX_JUDGE_CMD ? commandJudge(process.env.HX_JUDGE_CMD) : undefined;
  let content = "";
  if (ctx.change) {
    const parts: string[] = [];
    const proposal = path.join(ctx.ws.changeDir(ctx.change), "proposal.md");
    if (fs.existsSync(proposal)) parts.push(fs.readFileSync(proposal, "utf8"));
    for (const { file } of listDeltaFiles(ctx.ws, ctx.change)) parts.push(fs.readFileSync(file, "utf8"));
    content = parts.join("\n\n");
  }

  const findings: SensorReport["findings"] = [];
  let evaluated = 0;
  for (const file of files) {
    const rubric = readRubric(file);
    evaluated += rubric.rules.filter((r) => r.status === "trial" || r.status === "enforced").length;
    for (const f of runRubric(rubric, content, { judge, budgetTokens: ctx.def.budget_tokens })) {
      findings.push({
        severity: f.severity === "block" ? "block" : f.severity === "warn" ? "warn" : "info",
        rule: f.rule,
        message: `[${f.status}] ${f.message}`,
        fix_hint: "Address the rubric concern or record reviewer feedback: hx rubric feedback"
      });
    }
  }
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary: evaluated ? `rubric: ${findings.length} finding(s) / ${evaluated} rule(s)` : "no rubric rules found",
    findings,
    fix_hint: ctx.def.fix_hint
  };
};

/** Constraint layers: optional config.constraint_source overrides guide scan. */
export const constraintLayersEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const mode = String(c.mode ?? (ctx.def.id === "budget" ? "budget" : "boundary"));
  if (typeof c.constraint_source === "string") {
    const rules = loadLayerRulesFromFile(ctx.ws.base, c.constraint_source);
    if (!rules) {
      return {
        sensor: ctx.def.id,
        status: "error",
        summary: `constraint file missing: ${c.constraint_source}`,
        findings: [{ severity: "block", message: `constraint file missing: ${c.constraint_source}` }]
      };
    }
  } else {
    resolveLayerRules(ctx.ws); // warm / validate path exists
  }
  return mode === "budget" ? budget(ctx) : archBoundary(ctx);
};

/** Drift engine — optional config.checks list (defaults to full drift). */
export const driftEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  if (c.mode === "integration-smoke" || ctx.def.id === "integration-smoke") return integrationSmoke(ctx);
  return driftSensor(ctx);
};

export const mutationEngine = (ctx: SensorContext): SensorReport => mutationProbe(ctx);

export const fixtureHashEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  // scope already on def; allow config.scope override via def mutation is not needed
  if (Array.isArray(c.scope) && c.scope.length) {
    return fixtureHash({ ...ctx, def: { ...ctx.def, scope: c.scope as string[] } });
  }
  return fixtureHash(ctx);
};
