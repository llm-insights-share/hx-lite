import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { readMeta } from "./metaStore.js";

function readTemplate(ws: Workspace, guideId: string): string {
  const harness = ws.readHarness();
  const tpl = harness.guides.find((g) => g.id === guideId);
  if (!tpl) return "";
  const f = path.join(ws.base, tpl.source);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
}

function isZhCn(ws: Workspace): boolean {
  try {
    return ws.readConfig().locale === "zh-CN";
  } catch {
    return false;
  }
}

/** Scaffold organization-level PRD at docs/prd/<slug>.md plus sidecar artifacts. */
export function scaffoldPrd(ws: Workspace, slug: string, title: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`invalid PRD slug "${slug}" (use kebab-case)`);
  ensureDir(ws.prdDir());
  const file = ws.prdFile(slug);
  if (fs.existsSync(file)) throw new Error(`PRD already exists: ${file}`);
  const raw = readTemplate(ws, "prd-template");
  const zh = isZhCn(ws);
  const body =
    raw ||
    (zh
      ? `# PRD：${title}\n\n## 基本信息\n\n- 需求标题：${title}\n- 需求ID：${slug}\n\n## 业务背景与目标\n\n## 范围定义\n\n### In Scope\n\n### Out of Scope\n\n## 用户故事\n\n## 验收标准\n\n## 非功能需求\n\n## 评审结论\n`
      : `# PRD: ${title}\n\n## Basics\n\n- Title: ${title}\n- PRD ID: ${slug}\n\n## Goals\n\n## Scope\n\n### In Scope\n\n### Out of Scope\n\n## User Stories\n\n## Acceptance Criteria\n\n## Non-Functional Requirements\n\n## Review Conclusion\n`);
  fs.writeFileSync(file, body.replaceAll("{{slug}}", slug).replaceAll("{{title}}", title), "utf8");
  scaffoldPrdSidecars(ws, slug, title);
  return file;
}

/** Create research / analysis / prototype sidecars under docs/prd/<slug>/. */
export function scaffoldPrdSidecars(ws: Workspace, slug: string, title?: string): string[] {
  const zh = isZhCn(ws);
  const label = title ?? slug;
  const created: string[] = [];
  ensureDir(ws.prdArtifactDir(slug));
  ensureDir(path.join(ws.prdArtifactDir(slug), "prototype"));

  const research = ws.prdResearchFile(slug);
  if (!fs.existsSync(research)) {
    fs.writeFileSync(
      research,
      zh
        ? `# 需求调研：${label}\n\n## 干系人\n\n## 调研方法\n\n## 发现（Findings）\n\n## 待确认问题\n`
        : `# Requirements research: ${label}\n\n## Stakeholders\n\n## Methods\n\n## Findings\n\n## Open questions\n`,
      "utf8"
    );
    created.push(research);
  }

  const analysis = ws.prdAnalysisFile(slug);
  if (!fs.existsSync(analysis)) {
    fs.writeFileSync(
      analysis,
      zh
        ? `# 需求分析：${label}\n\n## 问题与机会\n\n## 用户与场景\n\n## 优先级（P0/P1）\n\n## 方案要点\n`
        : `# Requirements analysis: ${label}\n\n## Problem / Opportunity\n\n## Users and scenarios\n\n## Priority (P0/P1)\n\n## Approach\n`,
      "utf8"
    );
    created.push(analysis);
  }

  const pages = ws.prdPrototypePagesFile(slug);
  if (!fs.existsSync(pages)) {
    fs.writeFileSync(
      pages,
      zh
        ? `# 产品原型页面清单：${label}\n\n| 页面 | 路由 | Shell / 复用 |\n| --- | --- | --- |\n| 首页 | / | new |\n`
        : `# Prototype page inventory: ${label}\n\n| Page | Route | Shell |\n| --- | --- | --- |\n| Home | / | new |\n`,
      "utf8"
    );
    created.push(pages);
  }
  return created;
}

export function scaffoldPrdResearch(ws: Workspace, slug: string, title?: string): string {
  scaffoldPrdSidecars(ws, slug, title);
  return ws.prdResearchFile(slug);
}

export function scaffoldPrdAnalysis(ws: Workspace, slug: string, title?: string): string {
  scaffoldPrdSidecars(ws, slug, title);
  return ws.prdAnalysisFile(slug);
}

export function scaffoldPrdPrototype(ws: Workspace, slug: string, title?: string): string {
  scaffoldPrdSidecars(ws, slug, title);
  return ws.prdPrototypePagesFile(slug);
}

/** Resolve PRD slug for a change: meta.prdRef → change id → proposal link. */
export function resolvePrdSlug(ws: Workspace, change: string): string | undefined {
  try {
    const meta = readMeta(ws, change);
    if (meta.prdRef) return meta.prdRef;
  } catch {
    /* change may not exist */
  }
  if (fs.existsSync(ws.prdFile(change))) return change;
  const proposal = path.join(ws.changeDir(change), "proposal.md");
  if (fs.existsSync(proposal)) {
    const text = fs.readFileSync(proposal, "utf8");
    const m = text.match(/docs\/prd\/([a-z0-9][a-z0-9-]*)\.md/i);
    if (m) return m[1];
  }
  return undefined;
}

export function listPrdSlugs(ws: Workspace): string[] {
  const dir = ws.prdDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}
