import fs from "node:fs";
import path from "node:path";
import { listDeltaFiles } from "@harnessx/core/artifactStore.js";
import { readDeliveryTrace } from "@harnessx/core/deliveryTrace.js";
import { readDesignOverview, listDesignLldFiles, parseUiPageInventory, extractApiPaths } from "@harnessx/core/designLayout.js";
import { readTasks } from "@harnessx/core/plan.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

const HLD_SECTIONS = [
  "## Context",
  "## API Surface",
  "## Decisions (ADR)",
  "## Architecture Constraints",
  "## Observability",
  "## Rollback Plan"
];
const HLD_OPTIONAL = ["## Data Model", "## UI Layout", "## Design Tokens"];
const REQ_FILES = ["prd-summary.md", "user-stories.md", "nfr.md"];

function block(findings: Finding[], ctx: SensorContext, summary: string): SensorReport {
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length ? "Fix each finding, then re-run hx gate check." : undefined
  };
}

/** requirements-complete: requirements/ scaffold files exist and proposal links PRD. */
export const requirementsComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const findings: Finding[] = [];
  const reqDir = path.join(ctx.ws.changeDir(ctx.change), "requirements");
  if (!fs.existsSync(reqDir)) {
    findings.push({ severity: "block", message: "requirements/ directory missing — run hx propose to scaffold" });
    return block(findings, ctx, "requirements analysis artifacts missing");
  }
  for (const f of REQ_FILES) {
    const p = path.join(reqDir, f);
    if (!fs.existsSync(p)) findings.push({ severity: "block", file: `requirements/${f}`, message: `missing ${f}` });
  }
  const proposal = path.join(ctx.ws.changeDir(ctx.change), "proposal.md");
  if (fs.existsSync(proposal)) {
    const text = fs.readFileSync(proposal, "utf8");
    if (!/## PRD Reference|docs\/prd\//i.test(text) && !text.includes("prd-summary")) {
      findings.push({
        severity: "warn",
        message: "proposal.md should reference PRD (## PRD Reference or docs/prd/)"
      });
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} requirements issue(s)` : "requirements artifacts present");
};

/** design-hld-complete: overview has mandatory HLD sections. */
export const designHldComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const text = readDesignOverview(ctx.ws, ctx.change);
  const findings: Finding[] = [];
  if (!text.trim()) {
    findings.push({ severity: "block", message: "design overview missing — run hx design" });
    return block(findings, ctx, "HLD missing");
  }
  for (const sec of HLD_SECTIONS) {
    if (!text.includes(sec)) findings.push({ severity: "block", message: `overview missing section "${sec}"` });
  }
  for (const sec of HLD_OPTIONAL) {
    if (!text.includes(sec)) findings.push({ severity: "info", message: `overview missing optional section "${sec}"` });
  }
  return block(findings, ctx, findings.length ? `${findings.length} HLD section(s) missing` : "HLD complete");
};

/** design-lld-complete: UI pages in inventory have component specs or explicit reuse. */
export const designLldComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const findings: Finding[] = [];
  const pagesFile = path.join(ctx.ws.designDir(ctx.change), "ui", "pages.md");
  if (!fs.existsSync(pagesFile)) {
    return block(findings, ctx, "no design/ui/pages.md — skip LLD UI check");
  }
  const pages = parseUiPageInventory(fs.readFileSync(pagesFile, "utf8"));
  const compDir = path.join(ctx.ws.designDir(ctx.change), "ui", "components");
  for (const p of pages) {
    const slug = p.page
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const spec = path.join(compDir, `${slug}.md`);
    const reuse = /reuse|existing/i.test(p.shell);
    if (!reuse && !fs.existsSync(spec)) {
      findings.push({
        severity: "warn",
        message: `page "${p.page}" has no design/ui/components/${slug}.md (or mark shell as reuse)`
      });
    }
  }
  const lld = listDesignLldFiles(ctx.ws, ctx.change);
  if (lld.length === 0 && pages.length > 0) {
    findings.push({ severity: "warn", message: "no LLD files under design/api|ui|data — add detailed design artifacts" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} LLD issue(s)` : "LLD checks passed");
};

/** design-spec-align: API paths in design appear in delta specs. */
export const designSpecAlign = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const designText = readDesignOverview(ctx.ws, ctx.change);
  const apiPaths = extractApiPaths(designText);
  if (apiPaths.length === 0) return block([], ctx, "no API paths in design — skip align check");

  let specBlob = "";
  for (const { file } of listDeltaFiles(ctx.ws, ctx.change)) specBlob += fs.readFileSync(file, "utf8") + "\n";
  const findings: Finding[] = [];
  for (const p of apiPaths) {
    const fragment = p.split("/").pop() ?? p;
    if (!specBlob.includes(p) && !specBlob.includes(fragment)) {
      findings.push({
        severity: "warn",
        message: `API path ${p} in design not found in delta specs`
      });
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} design↔spec mismatch(es)` : "design aligned with specs");
};

/** plan-coverage: impl tasks should carry @design= for enterprise handoff. */
export const planCoverage = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const tasks = readTasks(ctx.ws, ctx.change);
  const findings: Finding[] = [];
  for (const t of tasks.filter((x) => x.track === "impl")) {
    if (!t.designRef) {
      findings.push({
        severity: "warn",
        message: `task ${t.id} (${t.requirement}) missing @design= handoff ref`
      });
    }
  }
  const trace = readDeliveryTrace(ctx.ws, ctx.change);
  if (Object.keys(trace.requirements).length === 0 && tasks.length > 0) {
    findings.push({ severity: "warn", message: "delivery-trace.yaml empty — run hx plan to sync" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} plan coverage issue(s)` : "plan handoff complete");
};

/** design-drift: code_hints in delivery-trace should exist on disk after apply. */
export const designDrift = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const trace = readDeliveryTrace(ctx.ws, ctx.change);
  const findings: Finding[] = [];
  for (const [key, entry] of Object.entries(trace.requirements)) {
    for (const hint of entry.code_hints ?? []) {
      if (hint.includes("*")) continue;
      const abs = path.join(ctx.ws.root, hint);
      if (!fs.existsSync(abs)) {
        findings.push({
          severity: "warn",
          rule: "design-drift",
          message: `${key}: code hint missing on disk: ${hint}`
        });
      }
    }
  }
  return block(findings, ctx, findings.length ? `${findings.length} design drift issue(s)` : "code hints present");
};
