import fs from "node:fs";
import path from "node:path";
import { parseUiPageInventory } from "@harnessx/core/designLayout.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

function block(findings: Finding[], ctx: SensorContext, summary: string): SensorReport {
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length ? "Complete prototype artifacts before advancing design gate." : undefined
  };
}

function uiInScope(ws: import("@harnessx/core").Workspace, change: string): boolean {
  const proposal = path.join(ws.changeDir(change), "proposal.md");
  const design = path.join(ws.designDir(change), "overview.md");
  const blob = [proposal, design].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  return /ui|page|screen|frontend|wireframe|prototype/i.test(blob);
}

/** prototype-complete: when UI is in scope, design/ui/pages.md must list wireframe pages. */
export const prototypeComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  if (!uiInScope(ctx.ws, ctx.change)) {
    return block([], ctx, "UI not in scope — prototype check skipped");
  }
  const pagesFile = path.join(ctx.ws.designDir(ctx.change), "ui", "pages.md");
  const findings: Finding[] = [];
  if (!fs.existsSync(pagesFile)) {
    findings.push({
      severity: "block",
      file: "design/ui/pages.md",
      message: "UI in scope but design/ui/pages.md missing — use prototype-wireframe skill"
    });
    return block(findings, ctx, "prototype pages missing");
  }
  const pages = parseUiPageInventory(fs.readFileSync(pagesFile, "utf8"));
  if (pages.length === 0) {
    findings.push({ severity: "block", file: "design/ui/pages.md", message: "no pages listed in wireframe inventory" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} prototype issue(s)` : "prototype wireframe complete");
};

/** uat-complete: UAT checklist present with scenario rows before verify/archive. */
export const uatComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const candidates = [
    path.join(ctx.ws.changeDir(ctx.change), "uat-checklist.md"),
    path.join(ctx.ws.changeDir(ctx.change), "requirements", "uat-checklist.md"),
    path.join(ctx.ws.changeDir(ctx.change), "requirements", "uat.md")
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  const findings: Finding[] = [];
  if (!file) {
    findings.push({
      severity: "block",
      message: "UAT checklist missing — copy uat-checklist template to change/uat-checklist.md"
    });
    return block(findings, ctx, "UAT checklist missing");
  }
  const text = fs.readFileSync(file, "utf8");
  if (!/\|.*Scenario.*\|/i.test(text) && !/## Scenario Walkthrough/i.test(text)) {
    findings.push({ severity: "warn", file: path.relative(ctx.ws.root, file), message: "UAT checklist has no scenario table" });
  }
  if (!/\[x\].*Product owner|Sign-off|Approver/i.test(text) && !/\[ \].*Product owner/i.test(text)) {
    findings.push({ severity: "warn", file: path.relative(ctx.ws.root, file), message: "UAT sign-off section not found" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} UAT issue(s)` : "UAT checklist present");
};
