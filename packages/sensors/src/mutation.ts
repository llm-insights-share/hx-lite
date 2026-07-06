import fs from "node:fs";
import path from "node:path";
import { changeScenarios, scanTestsForScenarios } from "@harnessx/core";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

const STUB_RE = /not implemented.*FR-026/i;
const TAUTLOGY_RE = /expect\s*\(\s*(?:true|1|null|undefined)\s*\)\s*\.to(?:Be|Equal)\s*\(\s*(?:true|1|null|undefined)\s*\)/;

/** Heuristic checks that mapped tests would catch real regressions (mutation probe lite). */
export function analyzeTestStrength(content: string): string[] {
  const problems: string[] = [];
  if (STUB_RE.test(content)) problems.push("test is still an FR-026 failing stub");
  if (TAUTLOGY_RE.test(content)) problems.push("contains tautological assertion");
  const expects = [...content.matchAll(/\bexpect\s*\(/g)];
  const asserts = [...content.matchAll(/\bassert[\s.(]/g)];
  if (expects.length === 0 && asserts.length === 0) problems.push("no expect/assert calls");
  if (expects.length === 1 && content.length < 120 && !/Scenario:/.test(content) && !TAUTLOGY_RE.test(content)) {
    problems.push("single shallow assertion — unlikely to catch regressions");
  }
  return problems;
}

/**
 * sensor.mutation (lite): flags weak scenario tests that would not catch mutations.
 * Full Stryker integration can replace this builtin in strict profiles.
 */
export const mutationProbe = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) {
    return { sensor: ctx.def.id, status: "error", summary: "mutation-probe requires a change", findings: [] };
  }

  const scenarios = changeScenarios(ctx.ws, ctx.change);
  const testHits = scanTestsForScenarios(ctx.ws.root);
  const findings: Finding[] = [];

  for (const s of scenarios) {
    const files = testHits.get(s.scenario) ?? [];
    for (const rel of files) {
      const abs = path.join(ctx.ws.root, rel);
      if (!fs.existsSync(abs)) continue;
      const problems = analyzeTestStrength(fs.readFileSync(abs, "utf8"));
      for (const p of problems) {
        findings.push({
          severity: "block",
          file: rel,
          rule: "mutation-probe",
          message: `Scenario "${s.scenario}" test may not catch mutations: ${p}`,
          fix_hint: "Add assertions that fail when behaviour regresses; avoid stubs and tautologies"
        });
      }
    }
  }

  return {
    sensor: ctx.def.id,
    status: findings.length ? "fail" : "pass",
    summary: findings.length ? `${findings.length} weak test(s) for mapped scenarios` : "mapped scenario tests look mutation-resistant",
    findings,
    agent_instruction: findings.length
      ? "Strengthen tests so a wrong implementation would fail — mutation probing treats tautologies and stubs as uncovered."
      : undefined
  };
};
