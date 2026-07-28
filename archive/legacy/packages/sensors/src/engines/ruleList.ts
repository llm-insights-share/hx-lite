import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { block, cfg } from "./helpers.js";

function expandGlobs(root: string, patterns: string[]): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    if (!pattern.includes("*")) {
      const abs = path.isAbsolute(pattern) ? pattern : path.join(root, pattern);
      if (fs.existsSync(abs)) out.push(abs);
      continue;
    }
    walkMatch(root, pattern, out);
  }
  return [...new Set(out)];
}

function walkMatch(root: string, pattern: string, out: string[], dir = root): void {
  if (!fs.existsSync(dir)) return;
  const relPat = pattern.replace(/^\.\//, "");
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (relPat.includes("**") || matchSimple(rel + "/", relPat)) walkMatch(root, pattern, out, abs);
    } else if (matchSimple(rel, relPat)) {
      out.push(abs);
    }
  }
}

function matchSimple(rel: string, pattern: string): boolean {
  // Support ** matching across path segments including empty (a/**/*.md matches a/x.md)
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

type RuleAssert = {
  exists?: boolean;
  not_exists?: boolean;
  match?: string;
  not_match?: string;
  min_sections?: number;
};

/**
 * Declarative rule-list engine for sensor.rule.
 * Loads rules from ctx.resolved.rules files or config.rules array.
 */
export const ruleListEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const findings: Finding[] = [];
  const ruleSets: Array<Record<string, unknown>> = [];

  if (Array.isArray(c.rules) && c.rules.length && typeof c.rules[0] === "object") {
    ruleSets.push(...(c.rules as Array<Record<string, unknown>>));
  }

  const ruleFiles = [...(ctx.resolved?.rules ?? []), ...(ctx.def.rules ?? [])];
  for (const rf of ruleFiles) {
    if (typeof rf !== "string") continue;
    const abs = path.isAbsolute(rf) ? rf : path.join(ctx.ws.base, rf);
    if (!fs.existsSync(abs)) {
      findings.push({ severity: "block", message: `rules file missing: ${rf}` });
      continue;
    }
    try {
      const raw = YAML.parse(fs.readFileSync(abs, "utf8")) as { rules?: Array<Record<string, unknown>> };
      if (Array.isArray(raw?.rules)) ruleSets.push(...raw.rules);
    } catch (e) {
      findings.push({ severity: "block", message: `failed to parse rules ${rf}: ${(e as Error).message}` });
    }
  }

  for (const rule of ruleSets) {
    const id = String(rule.id ?? "rule");
    const when = (rule.when as Record<string, unknown> | undefined) ?? {};
    const filesPat = (when.files as string[] | undefined) ?? ["**/*"];
    const files = expandGlobs(ctx.ws.root, filesPat);
    const assert = (rule.assert as RuleAssert | undefined) ?? {};
    const severity = (rule.severity as Finding["severity"]) ?? "block";
    const message = String(rule.message ?? `rule ${id} failed`);
    const fix_hint = rule.fix_hint ? String(rule.fix_hint) : undefined;

    if (assert.exists === true && files.length === 0) {
      findings.push({ severity, rule: id, message, fix_hint });
      continue;
    }
    if (assert.not_exists === true && files.length > 0) {
      findings.push({ severity, rule: id, message, fix_hint, file: path.relative(ctx.ws.root, files[0]!) });
      continue;
    }

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(ctx.ws.root, file);
      if (assert.match) {
        if (!new RegExp(assert.match, "m").test(text)) {
          findings.push({ severity, rule: id, message, fix_hint, file: rel });
        }
      }
      if (assert.not_match) {
        if (new RegExp(assert.not_match, "m").test(text)) {
          findings.push({ severity, rule: id, message, fix_hint, file: rel });
        }
      }
      if (typeof assert.min_sections === "number") {
        const count = (text.match(/^##\s+/gm) ?? []).length;
        if (count < assert.min_sections) {
          findings.push({
            severity,
            rule: id,
            message: `${message} (found ${count} ## sections, need ${assert.min_sections})`,
            fix_hint,
            file: rel
          });
        }
      }
    }
  }

  return block(findings, ctx, findings.length ? `${findings.length} rule violation(s)` : "all rules passed");
};
