import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  applyBudget,
  commandJudge,
  heuristicJudge,
  listDeltaFiles,
  readRubric,
  redact,
  runRubric,
  type Judge,
  type RubricFile,
  type RubricRule
} from "@harnessx/core";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { block, cfg } from "./helpers.js";

function matchSimple(rel: string, pattern: string): boolean {
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, "(?:.*/)?")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*") +
      "$"
  );
  return re.test(rel);
}

function walkMatch(root: string, pattern: string, out: string[], dir = root): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (pattern.includes("**") || matchSimple(rel + "/", pattern)) walkMatch(root, pattern, out, abs);
    } else if (matchSimple(rel, pattern)) {
      out.push(abs);
    }
  }
}

function expandGlobs(root: string, patterns: string[]): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    if (!pattern.includes("*")) {
      const abs = path.isAbsolute(pattern) ? pattern : path.join(root, pattern);
      if (fs.existsSync(abs)) out.push(abs);
      continue;
    }
    walkMatch(root, pattern.replace(/^\.\//, ""), out);
  }
  return [...new Set(out)];
}

function resolvePath(wsBase: string, p: string): string {
  return path.isAbsolute(p) ? p : path.join(wsBase, p);
}

function loadRulesText(ctx: SensorContext): { text: string; file?: string } {
  const c = cfg(ctx);
  const text =
    ctx.resolved?.rules_text ??
    ctx.def.rules_text ??
    (typeof c.rules_text === "string" ? c.rules_text : undefined);
  const file =
    ctx.resolved?.rules_file ??
    ctx.def.rules_file ??
    (typeof c.rules_file === "string" ? c.rules_file : undefined);

  if (text) return { text, file };
  if (file) {
    const abs = resolvePath(ctx.ws.base, file);
    if (!fs.existsSync(abs)) {
      throw new Error(`rules_file missing: ${file}`);
    }
    return { text: fs.readFileSync(abs, "utf8"), file: abs };
  }
  // Fall back to pack rules.md / rules.yaml via resolved.rules
  for (const r of ctx.resolved?.rules ?? ctx.def.rules ?? []) {
    const abs = resolvePath(ctx.ws.base, r);
    if (fs.existsSync(abs)) return { text: fs.readFileSync(abs, "utf8"), file: abs };
  }
  return { text: "" };
}

function collectInputContent(ctx: SensorContext): string {
  const inputs =
    ctx.resolved?.input ??
    ctx.def.input ??
    (Array.isArray(cfg(ctx).input) ? (cfg(ctx).input as string[]) : undefined);

  const parts: string[] = [];

  if (inputs?.length) {
    const roots = [
      ctx.change ? ctx.ws.changeDir(ctx.change) : undefined,
      ctx.ws.root,
      ctx.ws.base
    ].filter(Boolean) as string[];

    for (const root of roots) {
      for (const f of expandGlobs(root, inputs)) {
        try {
          parts.push(`# FILE: ${path.relative(ctx.ws.root, f)}\n${fs.readFileSync(f, "utf8")}`);
        } catch {
          /* skip unreadable */
        }
      }
      if (parts.length) break;
    }
  } else if (ctx.change) {
    const proposal = path.join(ctx.ws.changeDir(ctx.change), "proposal.md");
    if (fs.existsSync(proposal)) parts.push(fs.readFileSync(proposal, "utf8"));
    for (const { file } of listDeltaFiles(ctx.ws, ctx.change)) {
      parts.push(fs.readFileSync(file, "utf8"));
    }
  }

  return parts.join("\n\n");
}

function rubricFromYamlOrText(file: string | undefined, text: string): RubricFile {
  if (file && /\.ya?ml$/i.test(file)) {
    try {
      return readRubric(file);
    } catch {
      /* fall through */
    }
  }
  // Try parse YAML rules in text
  if (/^\s*rules\s*:/m.test(text)) {
    try {
      const parsed = YAML.parse(text) as RubricFile;
      if (parsed?.rules?.length) return parsed;
    } catch {
      /* free text */
    }
  }

  const rule: RubricRule = {
    id: "rules-text",
    status: "enforced",
    check: text.trim() || "Review task output against provided rules",
    // Light heuristic: flag common unmeasurable wording when no LLM judge
    pattern:
      "\\b(quickly|user-friendly|appropriately|as needed|robust|seamless|etc\\.?|TODO|FIXME)\\b",
    severity: "warn"
  };
  return { rules: [rule] };
}

/**
 * Rules + LLM/heuristic judge engine.
 * Collects `input` globs (or change proposal+deltas), applies rules_text/rules_file.
 */
export const rulesLlmEngine = (ctx: SensorContext): SensorReport => {
  let loaded: { text: string; file?: string };
  try {
    loaded = loadRulesText(ctx);
  } catch (e) {
    return block(
      [{ severity: "block", message: (e as Error).message }],
      ctx,
      "rules file missing"
    );
  }

  if (!loaded.text.trim() && !(ctx.resolved?.rules?.length || ctx.def.rules?.length)) {
    // No free-text rules: fall back to scanning rubrics like classic rubric engine
    const files: string[] = [];
    for (const r of [...(ctx.resolved?.rules ?? []), ...(ctx.def.rules ?? [])]) {
      const abs = resolvePath(ctx.ws.base, r);
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
    if (files.length === 0) {
      return block(
        [{ severity: "block", message: "rules check has no rules_text, rules_file, or rubrics" }],
        ctx,
        "no rules"
      );
    }
    const content = applyBudget(redact(collectInputContent(ctx)), ctx.def.budget_tokens);
    const judge: Judge = process.env.HX_JUDGE_CMD ? commandJudge(process.env.HX_JUDGE_CMD) : heuristicJudge;
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
          fix_hint: "Address the rule concern or record reviewer feedback: hx rubric feedback"
        });
      }
    }
    return block(
      findings,
      ctx,
      evaluated ? `rules: ${findings.length} finding(s) / ${evaluated} rule(s)` : "no active rules"
    );
  }

  const content = collectInputContent(ctx);
  if (!content.trim()) {
    return block(
      [{ severity: "warn", message: "no input content collected for rules judge (check input globs or change artifacts)" }],
      ctx,
      "no input"
    );
  }

  const rubric = rubricFromYamlOrText(loaded.file, loaded.text);
  const judge: Judge = process.env.HX_JUDGE_CMD
    ? commandJudge(process.env.HX_JUDGE_CMD)
    : (rule, prepared) => {
        // With free-text rules + LLM cmd absent: use heuristic pattern if present
        if (rule.pattern) return heuristicJudge(rule, prepared);
        // No pattern: treat empty / placeholder-only content as violation
        if (prepared.replace(/\s+/g, "").length < 40) {
          return { violation: true, note: "content too short for rules review" };
        }
        return { violation: false, note: "heuristic pass (set HX_JUDGE_CMD for LLM judge)" };
      };

  const findings: SensorReport["findings"] = [];
  for (const f of runRubric(rubric, content, { judge, budgetTokens: ctx.def.budget_tokens })) {
    findings.push({
      severity: f.severity === "block" ? "block" : f.severity === "warn" ? "warn" : "info",
      rule: f.rule,
      message: `[${f.status}] ${f.message}`,
      fix_hint: ctx.def.fix_hint
    });
  }

  // Free-text rules with LLM: also send the rules as context via a synthetic check when judge is command
  if (process.env.HX_JUDGE_CMD && loaded.text.trim() && !/\.ya?ml$/i.test(loaded.file ?? "")) {
    try {
      const metaRule: RubricRule = {
        id: "rules-llm",
        status: "enforced",
        check: loaded.text.trim(),
        severity: ctx.def.on_fail === "warn" ? "warn" : "block"
      };
      const verdict = judge(metaRule, applyBudget(redact(content), ctx.def.budget_tokens));
      if (verdict.violation) {
        findings.push({
          severity: metaRule.severity,
          rule: metaRule.id,
          message: verdict.note ?? "LLM judge reported a rules violation",
          fix_hint: ctx.def.fix_hint
        });
      }
    } catch (e) {
      return {
        sensor: ctx.def.id,
        status: "error",
        summary: `judge failed: ${(e as Error).message}`,
        findings: [{ severity: "block", message: (e as Error).message }],
        fix_hint: ctx.def.fix_hint
      };
    }
  }

  return block(
    findings,
    ctx,
    findings.length ? `rules: ${findings.length} finding(s)` : "rules ok"
  );
};
