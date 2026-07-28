import fs from "node:fs";
import path from "node:path";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { block, cfg } from "./helpers.js";
import { gateApprovedEngine } from "./gateApproved.js";
import { earsDeltaEngine } from "./earsDelta.js";
import { sectionCompleteEngine } from "./sectionComplete.js";
import { filePresenceEngine } from "./filePresence.js";
import { ruleListEngine } from "./ruleList.js";
import {
  constraintLayersEngine,
  driftEngine,
  mutationEngine,
  fixtureHashEngine
} from "./wrappers.js";

/**
 * Inline predicate engine: fixed expression subset → existing builtins/engines.
 * Does NOT evaluate arbitrary JavaScript.
 */

function stripBoolEq(s: string): string {
  return s.replace(/\s*==\s*true\s*$/i, "").trim();
}

function parseCallArgs(inner: string): { named: Record<string, string>; list: string[] } {
  const named: Record<string, string> = {};
  const list: string[] = [];
  // Split on commas not inside [] 
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of inner) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());

  for (const p of parts) {
    const m = p.match(/^(\w+)\s*=\s*(.+)$/);
    if (m) {
      named[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
    } else {
      list.push(p.replace(/^["']|["']$/g, ""));
    }
  }
  return { named, list };
}

function parseRequireList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    return t
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [t.replace(/^["']|["']$/g, "")];
}

function evalAtom(atom: string, ctx: SensorContext): SensorReport {
  const raw = atom.trim();
  if (!raw) {
    return block([{ severity: "block", message: "empty inline predicate" }], ctx, "empty expr");
  }

  const e = stripBoolEq(raw);
  const c = cfg(ctx);
  const args = (c.args as Record<string, unknown> | undefined) ?? {};

  // approval.<gate>
  const appr = e.match(/^approval\.(prd|arch|arch-lld)$/i);
  if (appr) {
    return gateApprovedEngine({
      ...ctx,
      config: { ...c, gate: appr[1]!.toLowerCase() }
    });
  }

  if (/^fixture\.hash_ok$/i.test(e)) {
    return fixtureHashEngine(ctx);
  }

  if (/^spec\.ears_ok$/i.test(e)) {
    return earsDeltaEngine(ctx);
  }

  if (/^arch\.layers_ok$/i.test(e)) {
    return constraintLayersEngine({
      ...ctx,
      config: { ...c, mode: "boundary" }
    });
  }

  if (/^drift\.ok$/i.test(e)) {
    return driftEngine(ctx);
  }

  if (/^mutation\.ok$/i.test(e)) {
    return mutationEngine(ctx);
  }

  if (/^rules\.list_ok$/i.test(e)) {
    return ruleListEngine(ctx);
  }

  // file.exists(path) / file.min_bytes(path, n)
  const fileExists = e.match(/^file\.exists\((.+)\)$/i);
  if (fileExists) {
    const { named, list } = parseCallArgs(fileExists[1]!);
    const p = named.path ?? list[0];
    if (!p) {
      return block([{ severity: "block", message: "file.exists requires path" }], ctx, "misconfigured");
    }
    return filePresenceEngine({
      ...ctx,
      config: { ...c, paths: [p], min_bytes: 0 }
    });
  }

  const fileMin = e.match(/^file\.min_bytes\((.+)\)$/i);
  if (fileMin) {
    const { named, list } = parseCallArgs(fileMin[1]!);
    const p = named.path ?? list[0];
    const n = Number(named.n ?? named.min ?? list[1] ?? 0);
    if (!p) {
      return block([{ severity: "block", message: "file.min_bytes requires path" }], ctx, "misconfigured");
    }
    return filePresenceEngine({
      ...ctx,
      config: { ...c, paths: [p], min_bytes: Number.isFinite(n) ? n : 0 }
    });
  }

  // doc.sections_complete(...)
  const docSec = e.match(/^doc\.sections_complete\((.*)\)$/i);
  if (docSec || /^doc\.sections_complete$/i.test(e)) {
    const { named } = docSec ? parseCallArgs(docSec[1] ?? "") : { named: {} as Record<string, string> };
    const pathArg =
      named.path ??
      (typeof args.path === "string" ? args.path : undefined) ??
      (typeof c.path === "string" ? c.path : undefined);
    const requireRaw =
      named.require ??
      (Array.isArray(args.require) ? `[${(args.require as string[]).join(",")}]` : undefined);
    const sections = parseRequireList(requireRaw) ?? (Array.isArray(c.sections) ? (c.sections as string[]) : undefined);

    const pathTemplate = pathArg ?? "@prd";
    const sectionObjs =
      sections?.map((id) => ({
        id,
        heading: `##\\s+.*${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*`,
        min_chars: 10
      })) ??
      (c.sections as unknown[]) ??
      undefined;

    return sectionCompleteEngine({
      ...ctx,
      config: {
        ...c,
        target: {
          path_template: pathTemplate,
          ...(sectionObjs ? { sections: sectionObjs } : {})
        },
        path_template: pathTemplate,
        ...(sectionObjs ? { sections: sectionObjs } : {})
      }
    });
  }

  return block(
    [
      {
        severity: "block",
        message: `unknown inline predicate: "${raw}". Supported: approval.*, fixture.hash_ok, spec.ears_ok, file.exists/min_bytes, doc.sections_complete, arch.layers_ok, drift.ok, mutation.ok, rules.list_ok, handler.<id>`
      }
    ],
    ctx,
    "unknown predicate"
  );
}

function mergeAnd(reports: SensorReport[], ctx: SensorContext): SensorReport {
  const findings = reports.flatMap((r) => r.findings);
  const errors = reports.filter((r) => r.status === "error");
  if (errors.length) {
    return {
      sensor: ctx.def.id,
      status: "error",
      summary: errors.map((r) => r.summary).join("; "),
      findings: errors.flatMap((r) => r.findings),
      fix_hint: ctx.def.fix_hint
    };
  }
  const failed = reports.filter((r) => r.status !== "pass");
  return block(
    findings,
    ctx,
    failed.length ? failed.map((r) => r.summary).join("; ") : reports.map((r) => r.summary).filter(Boolean).join("; ") || "ok"
  );
}

/** Evaluate `expr` (AND-combined predicates). */
export function evaluateInlineExpr(expr: string, ctx: SensorContext): SensorReport {
  const parts = expr.split("&&").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return block([{ severity: "block", message: "inline sensor missing expr" }], ctx, "missing expr");
  }
  if (parts.length === 1) return evalAtom(parts[0]!, ctx);
  return mergeAnd(
    parts.map((p) => evalAtom(p, ctx)),
    ctx
  );
}

export const inlineEngine = (ctx: SensorContext): SensorReport => {
  const expr =
    ctx.resolved?.expr ??
    ctx.def.expr ??
    (typeof cfg(ctx).expr === "string" ? (cfg(ctx).expr as string) : undefined);

  if (!expr) {
    return block([{ severity: "block", message: "inline sensor missing expr" }], ctx, "missing expr");
  }

  return evaluateInlineExpr(expr, ctx);
};

/** Resolve a path for file predicates (used in tests). */
export function resolveInlinePath(ctx: SensorContext, template: string): string {
  const filled = template;
  return path.isAbsolute(filled) ? filled : path.join(ctx.ws.root, filled);
}

export function assertFileReadable(abs: string): boolean {
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}
