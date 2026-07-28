import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir } from "./paths.js";
import { readMeta } from "./metaStore.js";

/** Scaffold organization-level req directory layout for a PRD slug. */
export function scaffoldPrd(ws: Workspace, slug: string, title: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`invalid PRD slug "${slug}" (use kebab-case)`);
  void title; // template content is now provided by commands/skills
  ensureDir(ws.prdDir());
  ensureDir(ws.prdArtifactDir(slug));
  scaffoldPrdSidecars(ws, slug, title);
  return ws.prdArtifactDir(slug);
}

/** Ensure research / analysis / prototype sidecar directories under docs/prd/<slug>/. */
export function scaffoldPrdSidecars(ws: Workspace, slug: string, title?: string): string[] {
  void title;
  const created: string[] = [];
  ensureDir(ws.prdArtifactDir(slug));
  ensureDir(path.join(ws.prdArtifactDir(slug), "prototype"));
  created.push(ws.prdArtifactDir(slug), path.join(ws.prdArtifactDir(slug), "prototype"));
  return created;
}

export function scaffoldPrdResearch(ws: Workspace, slug: string, title?: string): string {
  scaffoldPrdSidecars(ws, slug, title);
  return ws.prdArtifactDir(slug);
}

export function scaffoldPrdAnalysis(ws: Workspace, slug: string, title?: string): string {
  scaffoldPrdSidecars(ws, slug, title);
  return ws.prdArtifactDir(slug);
}

export function scaffoldPrdPrototype(ws: Workspace, slug: string, title?: string): string {
  scaffoldPrdSidecars(ws, slug, title);
  return path.join(ws.prdArtifactDir(slug), "prototype");
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
  const slugs = new Set<string>();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
      slugs.add(entry.name);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      slugs.add(entry.name.replace(/\.md$/, ""));
    }
  }
  return [...slugs].sort();
}
