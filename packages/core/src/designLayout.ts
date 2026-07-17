import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";

/** Resolves HLD overview: design/overview.md takes precedence over legacy design.md. */
export function resolveDesignOverview(ws: Workspace, change: string): string | null {
  const modern = ws.designOverviewFile(change);
  if (fs.existsSync(modern)) return modern;
  const legacy = ws.designFile(change);
  return fs.existsSync(legacy) ? legacy : null;
}

export function readDesignOverview(ws: Workspace, change: string): string {
  const f = resolveDesignOverview(ws, change);
  return f ? fs.readFileSync(f, "utf8") : "";
}

/** Lists LLD files under design/{api,ui,data}/ relative to change dir. */
export function listDesignLldFiles(ws: Workspace, change: string): string[] {
  const base = ws.designDir(change);
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  const visit = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) visit(abs, rel);
      else if (/\.(md|yaml|yml|sql|json)$/i.test(e.name) && e.name !== "overview.md") out.push(`design/${rel}`);
    }
  };
  for (const sub of ["api", "ui", "data", "sequences"]) visit(path.join(base, sub), sub);
  return out.sort();
}

/** Parse simple page inventory table rows from design/ui/pages.md. */
export function parseUiPageInventory(text: string): { page: string; route: string; shell: string }[] {
  const pages: { page: string; route: string; shell: string }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (/^\|\s*Page\s*\|/i.test(line) || /^\|\s*页面\s*\|/.test(line) || /^\|\s*---/.test(line)) continue;
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cols.length >= 2 && cols[0] && !cols[0].startsWith("-")) {
      pages.push({ page: cols[0], route: cols[1] ?? "", shell: cols[2] ?? "" });
    }
  }
  return pages;
}

/** Extract REST paths from overview API Surface table or openapi snippets. */
export function extractApiPaths(designText: string): string[] {
  const paths = new Set<string>();
  for (const m of designText.matchAll(/\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*(\/[^\s|]+)/gi)) {
    paths.add(m[2]!);
  }
  for (const m of designText.matchAll(/["'](\/v\d\/[^"']+)["']/g)) paths.add(m[1]!);
  return [...paths];
}

/** Infer code path hints from capability and requirement name (heuristic for plan). */
export function inferCodeHints(ws: Workspace, capability: string, requirement: string, track: "test" | "impl"): string[] {
  const hints: string[] = [];
  const slug = requirement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (track === "test") {
    hints.push(`tests/${capability}/${slug}.test.ts`);
    hints.push(`apps/**/tests/**/${slug}*.test.ts`);
  } else {
    hints.push(`src/**/${capability}/**`);
    hints.push(`apps/**/src/**`);
  }
  return hints;
}
