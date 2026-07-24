import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { readMeta, writeMeta } from "./metaStore.js";
import { readDesignOverview, listDesignLldFiles } from "./designLayout.js";
import { readArchRegistry, writeArchRegistry, resolveModuleByCapability } from "./archRegistry.js";
import { extractPromotableContent, mergePromotedIntoLld } from "./archPromote.js";
import type { ArchModule } from "./schemas.js";
import { ArchRegistry } from "./schemas.js";

/** Scaffold global arch directories + empty registry. */
export function scaffoldArchHld(ws: Workspace, title: string): { overview: string; registry: string } {
  void title;
  ensureDir(ws.archDir());
  ensureDir(path.join(ws.archDir(), "modules"));
  const registryFile = ws.archRegistryFile();
  if (!fs.existsSync(registryFile)) {
    writeArchRegistry(ws, ArchRegistry.parse({ version: "1.0", modules: [] }));
  }
  return { overview: ws.archDir(), registry: registryFile };
}

/** Scaffold module LLD; registers module in registry if missing. */
export function scaffoldArchLld(ws: Workspace, moduleId: string, title: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(moduleId)) throw new Error(`invalid module id "${moduleId}"`);
  ensureDir(ws.archModuleDir(moduleId));
  for (const sub of ["api", "data", "sequences"]) ensureDir(path.join(ws.archModuleDir(moduleId), sub));
  const lld = ws.archModuleDir(moduleId);
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

export interface PromoteArchResult {
  modules: string[];
  files: string[];
  dryRun: boolean;
}

/** Promote change-level design into module LLD under docs/architecture/modules/. */
export function promoteArchFromChange(
  ws: Workspace,
  change: string,
  opts?: { by?: string; dryRun?: boolean }
): PromoteArchResult {
  const meta = readMeta(ws, change);
  const modules = resolveModulesForChange(ws, change);
  if (modules.length === 0) throw new Error(`no arch modules resolved for change "${change}" — set meta.archModules or registry capabilities`);

  const overview = readDesignOverview(ws, change);
  const lldFiles = listDesignLldFiles(ws, change);
  const changeDir = ws.changeDir(change);
  const extraFiles = lldFiles
    .filter((rel) => fs.existsSync(path.join(changeDir, rel)))
    .map((rel) => ({ rel, content: fs.readFileSync(path.join(changeDir, rel), "utf8") }));
  if (!overview.trim() && extraFiles.length === 0) {
    throw new Error(`no design artifacts to promote for change "${change}"`);
  }
  const content = extractPromotableContent(overview, extraFiles);
  const stamp = new Date().toISOString().slice(0, 10);
  const written: string[] = [];

  for (const mod of modules) {
    const lld = ws.archModuleLld(mod.id);
    if (!fs.existsSync(lld)) scaffoldArchLld(ws, mod.id, mod.name ?? mod.id);
    if (opts?.dryRun) {
      written.push(lld);
      continue;
    }
    const existing = fs.existsSync(lld) ? fs.readFileSync(lld, "utf8") : "";
    const next = mergePromotedIntoLld(existing, change, content, stamp);
    fs.writeFileSync(lld, next, "utf8");
    written.push(lld);
    const registry = readArchRegistry(ws);
    const entry = registry.modules.find((m) => m.id === mod.id);
    if (entry && entry.status === "draft") {
      entry.status = "active";
      writeArchRegistry(ws, registry);
    }
  }

  if (!opts?.dryRun) {
    meta.archPromoted = { at: new Date().toISOString(), by: opts?.by, modules: modules.map((m) => m.id) };
    writeMeta(ws, meta);
  }
  return { modules: modules.map((m) => m.id), files: written, dryRun: Boolean(opts?.dryRun) };
}
