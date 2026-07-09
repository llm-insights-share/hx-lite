import fs from "node:fs";
import { extractApiPaths } from "./designLayout.js";
import { Workspace } from "./paths.js";

/** Read module LLD text from docs/architecture/modules/<id>/lld.md */
export function readArchModuleLld(ws: Workspace, moduleId: string): string {
  const f = ws.archModuleLld(moduleId);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
}

/** Extract API paths from module LLD (tables + openapi snippets). */
export function extractModuleApiPaths(lldText: string): string[] {
  return extractApiPaths(lldText);
}

/** Relative path from repo root for module LLD (for @design= handoff). */
export function archModuleLldRel(ws: Workspace, moduleId: string): string {
  return `docs/architecture/modules/${moduleId}/lld.md`;
}
