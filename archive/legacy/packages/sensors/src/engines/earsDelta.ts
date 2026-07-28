import fs from "node:fs";
import { listDeltaFiles, parseDelta } from "@harnessx/core/artifactStore.js";
import { interpolateSensorTemplate } from "@harnessx/core/sensorConfig.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { cfg } from "./helpers.js";

const DEFAULT_VAGUE = ["quickly", "user-friendly", "appropriately", "as needed", "robust", "seamless", "etc"];

function checkEars(
  text: string,
  opts: { requireShall: boolean; patterns: string[]; vagueWords: string[] }
): string[] {
  const problems: string[] = [];
  const t = text.replace(/\s+/g, " ").trim();
  if (t === "" || /^WHEN <trigger>/.test(t)) {
    problems.push("requirement text is empty or an unfilled placeholder");
    return problems;
  }
  if (opts.requireShall && !/\bSHALL\b/.test(t)) {
    problems.push("missing SHALL — use an EARS pattern (ubiquitous / WHEN / WHILE / WHERE / IF...THEN)");
    return problems;
  }
  const patRe = new RegExp(`^\\s*(${opts.patterns.join("|")})\\b`, "i");
  const kw = t.match(patRe)?.[1]?.toUpperCase();
  if (kw) {
    const [trigger] = t.split(/\bTHE SYSTEM\b|\bTHEN\b/i);
    if (!trigger || trigger.replace(new RegExp(`^(${opts.patterns.join("|")})`, "i"), "").trim().length < 3)
      problems.push(`${kw} clause has no trigger/condition content`);
    if (kw === "IF" && !/\bTHEN\b/i.test(t)) problems.push("IF pattern requires THEN before the SHALL response");
  }
  const response = t.split(/\bSHALL\b/i)[1]?.trim() ?? "";
  if (opts.requireShall && response.length < 3) problems.push("SHALL has no response content");
  const vagueRe = new RegExp(`\\b(${opts.vagueWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const vague = t.match(vagueRe);
  if (vague) problems.push(`unmeasurable wording "${vague[0]}" — quantify the behaviour`);
  return problems;
}

/** Config-driven OpenSpec delta + EARS validator. */
export const earsDeltaEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const ears = (c.ears as Record<string, unknown> | undefined) ?? {};
  const requireShall = ears.require_shall !== false && c.require_shall !== false;
  const patterns = (ears.patterns as string[] | undefined) ?? ["WHEN", "WHILE", "WHERE", "IF"];
  const vagueWords = (ears.vague_words as string[] | undefined) ?? (c.vague_words as string[] | undefined) ?? DEFAULT_VAGUE;
  const requireScenario = c.require_scenario !== false;
  const findings: Finding[] = [];

  if (!ctx.change) {
    return { sensor: ctx.def.id, status: "error", summary: "spec-validate requires a change id", findings: [] };
  }

  const deltas = listDeltaFiles(ctx.ws, ctx.change);
  if (deltas.length === 0) {
    const msg =
      typeof c.no_delta_message === "string"
        ? interpolateSensorTemplate(c.no_delta_message, { change: ctx.change })
        : "no delta specs found under changes/<id>/specs/<capability>/spec.md";
    findings.push({ severity: "block", message: msg });
  }

  for (const { capability, file } of deltas) {
    const delta = parseDelta(capability, fs.readFileSync(file, "utf8"));
    if (delta.sections.length === 0) {
      findings.push({
        file,
        severity: "block",
        rule: "delta-format",
        message: `${capability}: no "## ADDED|MODIFIED|REMOVED Requirements" section found`,
        fix_hint: "Wrap requirements in a delta section heading, e.g. `## ADDED Requirements`"
      });
      continue;
    }
    for (const section of delta.sections) {
      for (const req of section.requirements) {
        if (section.op !== "REMOVED" && requireScenario && req.scenarios.length === 0) {
          findings.push({
            file,
            severity: "block",
            rule: "scenario-required",
            message: `${capability} / "${req.name}": requirement has no Scenario`,
            fix_hint: "Add at least one `#### Scenario:` block with GIVEN/WHEN/THEN bullets"
          });
        }
        if (section.op !== "REMOVED") {
          for (const p of checkEars(req.text, { requireShall, patterns, vagueWords })) {
            findings.push({
              file,
              severity: "block",
              rule: "ears",
              message: `${capability} / "${req.name}": ${p}`,
              fix_hint: "Rewrite as EARS, e.g. `WHEN <trigger>, THE SYSTEM SHALL <measurable response>`"
            });
          }
        }
      }
      if (section.requirements.length === 0) {
        findings.push({
          file,
          severity: "warn",
          rule: "empty-section",
          message: `${capability}: empty ${section.op} section`
        });
      }
    }
  }

  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary: blockers.length
      ? `${blockers.length} spec problem(s) across ${deltas.length} delta file(s)`
      : `all ${deltas.length} delta file(s) valid`,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length
      ? "Open each file listed in findings, apply the fix_hint, then re-run: hx gate check"
      : undefined,
    fix_command: blockers.length ? `hx fix --change ${ctx.change} --sensor ${ctx.def.id}` : undefined
  };
};
