import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { readMeta } from "./metaStore.js";
import { readArchRegistry, writeArchRegistry, resolveModuleByCapability } from "./archRegistry.js";
import type { ArchModule } from "./schemas.js";
import { ArchRegistry } from "./schemas.js";

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

/** Scaffold global HLD overview + empty registry. */
export function scaffoldArchHld(ws: Workspace, title: string): { overview: string; registry: string } {
  ensureDir(ws.archDir());
  const overview = ws.archOverviewFile();
  if (!fs.existsSync(overview)) {
    const raw = readTemplate(ws, "arch-hld-template");
    const zh = isZhCn(ws);
    const body =
      raw ||
      (zh
        ? `# 全局概要设计：${title}\n\n## 系统边界与上下游\n\n## 架构方案与模块划分\n\n### 模块职责\n\n| 模块 | 职责 | 输入 | 输出 | 关键约束 |\n|---|---|---|---|---|\n\n## 数据流与关键流程\n\n## 非功能设计\n\n## ADR\n\n### ADR-001\n- Decision:\n- Alternatives:\n- Consequences:\n\n## 风险清单\n`
        : `# Global HLD: ${title}\n\n## System Boundary\n\n## Architecture & Modules\n\n### Module Responsibilities\n\n| Module | Responsibility | Input | Output | Constraints |\n|---|---|---|---|---|\n\n## Data Flows\n\n## Non-Functional Design\n\n## ADR\n\n### ADR-001\n- Decision:\n- Alternatives:\n- Consequences:\n\n## Risks\n`);
    fs.writeFileSync(overview, body.replaceAll("{{title}}", title), "utf8");
  }
  const registryFile = ws.archRegistryFile();
  if (!fs.existsSync(registryFile)) {
    writeArchRegistry(ws, ArchRegistry.parse({ version: "1.0", modules: [] }));
  }
  return { overview, registry: registryFile };
}

/** Scaffold module LLD; registers module in registry if missing. */
export function scaffoldArchLld(ws: Workspace, moduleId: string, title: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(moduleId)) throw new Error(`invalid module id "${moduleId}"`);
  ensureDir(ws.archModuleDir(moduleId));
  for (const sub of ["api", "data", "sequences"]) ensureDir(path.join(ws.archModuleDir(moduleId), sub));
  const lld = ws.archModuleLld(moduleId);
  if (!fs.existsSync(lld)) {
    const raw = readTemplate(ws, "arch-lld-template");
    const zh = isZhCn(ws);
    const body =
      raw ||
      (zh
        ? `# 模块详细设计：${title}\n\n- 模块ID：${moduleId}\n\n## 组件与职责\n\n## 接口契约\n\n| 接口ID | 类型 | 输入 | 输出 | 错误码 | 幂等策略 |\n|---|---|---|---|---|---|\n| IF-001 | API | | | | |\n\n## 数据模型与存储\n\n## 核心流程与状态机\n\n## 异常处理与降级\n\n## 安全与权限控制\n`
        : `# Module LLD: ${title}\n\n- Module ID: ${moduleId}\n\n## Components\n\n## Interface Contracts\n\n| ID | Type | Input | Output | Errors | Idempotency |\n|---|---|---|---|---|---|\n| IF-001 | API | | | | |\n\n## Data Model\n\n## Core Flows\n\n## Error Handling\n\n## Security\n`);
    fs.writeFileSync(lld, body.replaceAll("{{module}}", moduleId).replaceAll("{{title}}", title), "utf8");
  }
  const registry = readArchRegistry(ws);
  if (!registry.modules.some((m) => m.id === moduleId)) {
    registry.modules.push({
      id: moduleId,
      name: title,
      lld: `modules/${moduleId}/lld.md`,
      capabilities: [moduleId],
      status: "draft"
    });
    writeArchRegistry(ws, registry);
  }
  return lld;
}

export function resolveModulesForChange(ws: Workspace, change: string): ArchModule[] {
  const meta = readMeta(ws, change);
  const registry = readArchRegistry(ws);
  const out = new Map<string, ArchModule>();
  for (const id of meta.archModules ?? []) {
    const m = registry.modules.find((x) => x.id === id);
    if (m) out.set(m.id, m);
  }
  for (const cap of meta.touchedDomains) {
    const m = resolveModuleByCapability(registry, cap);
    if (m) out.set(m.id, m);
  }
  return [...out.values()];
}

export { resolveModuleByCapability, readArchRegistry, writeArchRegistry };
