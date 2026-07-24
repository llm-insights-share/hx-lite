import fs from "node:fs";
import path from "node:path";
import { parseUiPageInventory } from "@harnessx/core/designLayout.js";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import { hasPlaceholderContent, isPlaceholderTableRow } from "./placeholder.js";
import type { SensorContext } from "./types.js";

function block(findings: Finding[], ctx: SensorContext, summary: string): SensorReport {
  const blockers = findings.filter((f) => f.severity === "block");
  return {
    sensor: ctx.def.id,
    status: blockers.length ? "fail" : "pass",
    summary,
    findings,
    fix_hint: ctx.def.fix_hint,
    agent_instruction: blockers.length ? "Fix each finding, then re-run hx req/arch check --task …" : undefined
  };
}

function requireSlug(ctx: SensorContext): string | undefined {
  return ctx.prdSlug;
}

function readOverview(ctx: SensorContext): string {
  const file = ctx.ws.archOverviewFile();
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function hasSection(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** True when a ## heading exists and its body has substantive content (not empty scaffold). */
function sectionBodyFilled(text: string, heading: RegExp): boolean {
  const lines = text.split("\n");
  for (let start = 0; start < lines.length; start++) {
    if (!heading.test(lines[start]!)) continue;
    let i = start + 1;
    const body: string[] = [];
    while (i < lines.length && !/^##\s+/.test(lines[i]!)) {
      body.push(lines[i]!);
      i += 1;
    }
    const joined = body.join("\n").trim();
    if (!joined) continue;
    const dataRows = body.filter(
      (l) => l.trim().startsWith("|") && !/^\|\s*---/.test(l) && !/层次|选型|接口|协议|Page|页面|提供方|消费方/.test(l)
    );
    if (dataRows.length > 0 && dataRows.every((r) => /\|\s*\|\s*\|/.test(r) || isPlaceholderTableRow(r))) continue;
    const nonEmpty = body.map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("|") && !/^-\s*$/.test(l));
    const bulletFilled = body.filter((l) => /^-\s+\S/.test(l.trim()) && !/：\s*$/.test(l.trim()) && l.trim().length > 3);
    if (nonEmpty.length >= 1 || bulletFilled.length >= 1 || (dataRows.length > 0 && !dataRows.every(isPlaceholderTableRow))) {
      return true;
    }
  }
  return false;
}

/** Optional: notes that business understanding happened (guide-driven). */
export const reqBizUnderstanding = (ctx: SensorContext): SensorReport => {
  const slug = requireSlug(ctx);
  const findings: Finding[] = [];
  if (!slug) {
    return block(
      [{ severity: "warn", message: "no PRD slug — biz-understanding is soft; pass with --prd when available" }],
      ctx,
      "skipped (no slug)"
    );
  }
  const research = ctx.ws.prdResearchFile(slug);
  const prd = ctx.ws.prdFile(slug);
  const hasResearch = fs.existsSync(research) && sectionBodyFilled(fs.readFileSync(research, "utf8"), /##\s*(发现|Findings)/i);
  const hasPrdGoals =
    fs.existsSync(prd) && sectionBodyFilled(fs.readFileSync(prd, "utf8"), /##\s*(业务背景|Goals|目标)/i);
  if (!hasResearch && !hasPrdGoals) {
    findings.push({
      severity: "warn",
      message: "no research findings or PRD goals yet — optional biz-understanding incomplete"
    });
  }
  return block(findings, ctx, findings.length ? "biz-understanding incomplete (warn)" : "biz-understanding notes present");
};

/** docs/prd/<slug>/research.md present and filled */
export const reqResearchComplete = (ctx: SensorContext): SensorReport => {
  const slug = requireSlug(ctx);
  if (!slug) return block([{ severity: "block", message: "prdSlug required" }], ctx, "no slug");
  const file = ctx.ws.prdResearchFile(slug);
  const findings: Finding[] = [];
  if (!fs.existsSync(file)) {
    findings.push({
      severity: "block",
      message: `research missing — run: hx req research init ${slug} (or hx req prd init with sidecars)`
    });
    return block(findings, ctx, "research missing");
  }
  const text = fs.readFileSync(file, "utf8");
  if (!sectionBodyFilled(text, /##\s*(发现|Findings)/i) && !sectionBodyFilled(text, /##\s*(干系人|Stakeholders)/i)) {
    findings.push({ severity: "block", message: "research.md still scaffold-only — fill Findings / Stakeholders" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} research issue(s)` : "research complete");
};

/** Org requirements analysis: analysis.md filled */
export const reqAnalysisComplete = (ctx: SensorContext): SensorReport => {
  const slug = requireSlug(ctx);
  if (!slug) return block([{ severity: "block", message: "prdSlug required" }], ctx, "no slug");
  const findings: Finding[] = [];
  const analysisFile = ctx.ws.prdAnalysisFile(slug);
  if (!fs.existsSync(analysisFile)) {
    findings.push({ severity: "block", message: "analysis.md missing — hx req analysis init <slug>" });
    return block(findings, ctx, "analysis missing");
  }
  const analysis = fs.readFileSync(analysisFile, "utf8");
  if (!sectionBodyFilled(analysis, /##\s*(问题|Problem|痛点|Opportunity)/i)) {
    findings.push({ severity: "block", message: "fill Problem / Opportunity section in analysis.md" });
  }
  if (!sectionBodyFilled(analysis, /##\s*(用户|Persona|Users)/i)) {
    findings.push({ severity: "block", message: "fill Users section in analysis.md" });
  }
  if (!sectionBodyFilled(analysis, /##\s*(优先级|Priority)/i)) {
    findings.push({ severity: "block", message: "fill Priority section in analysis.md" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} analysis issue(s)` : "requirements analysis complete");
};

/** Org prototype at docs/prd/<slug>/prototype/pages.md */
export const orgPrototypeComplete = (ctx: SensorContext): SensorReport => {
  const slug = requireSlug(ctx);
  if (!slug) return block([{ severity: "block", message: "prdSlug required" }], ctx, "no slug");
  const file = ctx.ws.prdPrototypePagesFile(slug);
  const findings: Finding[] = [];
  if (!fs.existsSync(file)) {
    findings.push({
      severity: "block",
      file: `docs/prd/${slug}/prototype/pages.md`,
      message: "org prototype pages missing — run hx req prototype init <slug> (dirs), then author pages.md via req command/skill"
    });
    return block(findings, ctx, "org prototype missing");
  }
  const pages = parseUiPageInventory(fs.readFileSync(file, "utf8"));
  if (pages.length === 0) {
    findings.push({ severity: "block", message: "no pages listed in org prototype inventory" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} prototype issue(s)` : "org prototype complete");
};

function overviewSectionSensor(sectionLabel: string, patterns: RegExp[]) {
  return (ctx: SensorContext): SensorReport => {
    const text = readOverview(ctx);
    const findings: Finding[] = [];
    if (!text.trim()) {
      findings.push({
        severity: "block",
        message: "docs/architecture/overview.md missing — run hx arch init (dirs), then author HLD via arch command/skill"
      });
      return block(findings, ctx, "overview missing");
    }
    if (!patterns.some((p) => sectionBodyFilled(text, p))) {
      findings.push({ severity: "block", message: `overview missing filled section: ${sectionLabel}` });
    }
    return block(findings, ctx, findings.length ? `${sectionLabel} incomplete` : `${sectionLabel} present`);
  };
}

export const archTechSelectionComplete = overviewSectionSensor("技术选型 / Technology Selection", [
  /##\s*(技术选型|Technology Selection|Tech Stack)/i
]);

export const archDatabaseDesignComplete = overviewSectionSensor("数据库设计 / Database Design", [
  /##\s*(数据库设计|Database Design|Data Model|持久化)/i
]);

export const archInterfaceDesignComplete = overviewSectionSensor("接口设计 / Interface Design", [
  /##\s*(接口设计|Interface Design|外部接口|System Interfaces|API 边界)/i
]);

export const archKeyMechanismsComplete = overviewSectionSensor("关键机制 / Key Mechanisms", [
  /##\s*(关键设计机制|Key Mechanisms|关键机制)/i,
  /##\s*ADR/i
]);

/** Test execution report under change */
export const testReportComplete = (ctx: SensorContext): SensorReport => {
  if (!ctx.change) return { sensor: ctx.def.id, status: "error", summary: "requires change id", findings: [] };
  const file = path.join(ctx.ws.changeDir(ctx.change), "test-report.md");
  const findings: Finding[] = [];
  if (!fs.existsSync(file)) {
    findings.push({
      severity: "block",
      message: "test-report.md missing — run hx test report init <change> (dirs), then author report via test-execution command/skill."
    });
    return block(findings, ctx, "test report missing");
  }
  const text = fs.readFileSync(file, "utf8");
  if (hasPlaceholderContent(text) || text.trim().length < 40) {
    findings.push({ severity: "block", message: "test-report.md still placeholder or empty" });
  }
  if (!hasSection(text, [/结果|Result|Pass|Fail|执行/i])) {
    findings.push({ severity: "warn", message: "test-report.md may lack results summary" });
  }
  return block(findings, ctx, findings.length ? `${findings.length} test-report issue(s)` : "test report present");
};
