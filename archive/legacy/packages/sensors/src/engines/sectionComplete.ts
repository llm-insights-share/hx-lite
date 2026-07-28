import fs from "node:fs";
import path from "node:path";
import { interpolateSensorTemplate } from "@harnessx/core/sensorConfig.js";
import { resolvePrdSlug } from "@harnessx/core";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { hasPlaceholderContent } from "../placeholder.js";
import { block, cfg } from "./helpers.js";

function resolvePath(ctx: SensorContext, template: string): string {
  const slug = ctx.prdSlug ?? (ctx.change ? resolvePrdSlug(ctx.ws, ctx.change) : undefined);
  const filled = interpolateSensorTemplate(template, {
    change: ctx.change,
    slug,
    module: ctx.archModule,
    root: ctx.ws.root,
    base: ctx.ws.base
  });
  return path.isAbsolute(filled) ? filled : path.join(ctx.ws.root, filled);
}

function sectionBodyFilled(text: string, heading: RegExp, minChars: number): boolean {
  const lines = text.split("\n");
  for (let start = 0; start < lines.length; start++) {
    if (!heading.test(lines[start]!)) continue;
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i]!)) break;
      body.push(lines[i]!);
    }
    const joined = body.join("\n").trim();
    if (joined.length >= minChars && !hasPlaceholderContent(joined)) return true;
    const nonEmpty = body.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    if (nonEmpty.join(" ").length >= minChars) return true;
  }
  return heading.test(text) && minChars === 0;
}

/** Generic markdown section completeness engine. */
export const sectionCompleteEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const target = (c.target as Record<string, unknown> | undefined) ?? {};
  const pathTemplate =
    (target.path_template as string | undefined) ??
    (c.path_template as string | undefined) ??
    (c.path as string | undefined);

  const findings: Finding[] = [];
  if (!pathTemplate) {
    return block([{ severity: "block", message: "section-complete config missing target.path_template" }], ctx, "misconfigured");
  }

  // Special path helpers
  let file: string;
  if (pathTemplate === "@prd" || pathTemplate === "prd") {
    const slug = ctx.prdSlug ?? (ctx.change ? resolvePrdSlug(ctx.ws, ctx.change) : undefined);
    if (!slug) {
      return block(
        [{ severity: "block", message: "PRD slug unknown — pass prdSlug or link via meta.prdRef" }],
        ctx,
        "PRD not linked"
      );
    }
    file = ctx.ws.prdFile(slug);
  } else if (pathTemplate === "@arch-overview") {
    file = ctx.ws.archOverviewFile();
  } else if (pathTemplate === "@arch-lld") {
    if (!ctx.archModule) {
      return block([{ severity: "block", message: "archModule required for LLD path" }], ctx, "no module");
    }
    file = ctx.ws.archModuleLld(ctx.archModule);
  } else {
    file = resolvePath(ctx, pathTemplate);
  }

  if (!fs.existsSync(file)) {
    const msg =
      typeof c.missing_file_message === "string"
        ? interpolateSensorTemplate(c.missing_file_message, {
            change: ctx.change,
            slug: ctx.prdSlug,
            module: ctx.archModule
          })
        : `file missing: ${path.relative(ctx.ws.root, file)}`;
    findings.push({ severity: "block", message: msg });
    return block(findings, ctx, "file missing");
  }

  const text = fs.readFileSync(file, "utf8");
  const sections = (c.sections as Array<Record<string, unknown>> | undefined) ?? [];
  const requireBody = c.require_body !== false;
  const minDefault = typeof c.min_body_chars === "number" ? c.min_body_chars : requireBody ? 1 : 0;

  for (const sec of sections) {
    const id = String(sec.id ?? sec.heading ?? "section");
    const headingSrc = String(sec.heading ?? "");
    if (!headingSrc) continue;
    const heading = new RegExp(headingSrc, "i");
    const minChars = typeof sec.min_body_chars === "number" ? sec.min_body_chars : minDefault;
    const severity = (sec.severity as Finding["severity"]) ?? "block";
    const filled = minChars > 0 ? sectionBodyFilled(text, heading, minChars) : heading.test(text);
    if (!filled) {
      const template =
        typeof c.messages === "object" && c.messages && typeof (c.messages as Record<string, unknown>).missing_section === "string"
          ? ((c.messages as Record<string, unknown>).missing_section as string)
          : `missing section: ${id}`;
      findings.push({
        severity,
        rule: `section:${id}`,
        message: template.replaceAll("{id}", id)
      });
    }
  }

  // Extra pattern checks (any-of lists)
  const anyOf = (c.require_any as Array<Record<string, unknown>> | undefined) ?? [];
  for (const rule of anyOf) {
    const pats = ((rule.patterns as string[]) ?? []).map((p) => new RegExp(p, "i"));
    if (pats.length && !pats.some((p) => p.test(text))) {
      findings.push({
        severity: (rule.severity as Finding["severity"]) ?? "block",
        rule: String(rule.id ?? "require_any"),
        message: String(rule.message ?? `missing required pattern group ${rule.id}`)
      });
    }
  }

  const placeholder = (c.placeholder as Record<string, unknown> | undefined) ?? {};
  if (placeholder.enabled !== false && hasPlaceholderContent(text)) {
    findings.push({
      severity: "block",
      rule: "placeholder",
      message: String(placeholder.message ?? "document still contains template placeholders")
    });
  }

  return block(findings, ctx, findings.length ? `${findings.length} section issue(s)` : "sections complete");
};
