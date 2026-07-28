import fs from "node:fs";
import path from "node:path";
import { Workspace, ensureDir, readYaml, writeYaml } from "./paths.js";

/**
 * v0.2 P1: Diff line annotations → structured fix_hints for apply self-correction.
 * Supports HarnessX-native YAML and a generic JSON array format.
 */

export type ReviewSeverity = "critical" | "important" | "minor" | "suggestion";

export interface ReviewAnnotation {
  id: string;
  file: string;
  line?: number;
  endLine?: number;
  severity: ReviewSeverity;
  comment: string;
  author?: string;
  at?: string;
  resolved?: boolean;
}

export interface ReviewAnnotationsYaml {
  version: 1;
  annotations: ReviewAnnotation[];
}

function annotationsFile(ws: Workspace, change: string): string {
  return path.join(ws.changeDir(change), "review-annotations.yaml");
}

export function readReviewAnnotations(ws: Workspace, change: string): ReviewAnnotationsYaml {
  const f = annotationsFile(ws, change);
  if (!fs.existsSync(f)) return { version: 1, annotations: [] };
  const raw = readYaml<ReviewAnnotationsYaml>(f);
  return raw?.annotations ? raw : { version: 1, annotations: [] };
}

export function writeReviewAnnotations(ws: Workspace, change: string, data: ReviewAnnotationsYaml): void {
  ensureDir(ws.changeDir(change));
  writeYaml(annotationsFile(ws, change), data);
}

const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  critical: 0,
  important: 1,
  minor: 2,
  suggestion: 3
};

export function formatFixHints(annotations: ReviewAnnotation[]): string[] {
  return [...annotations]
    .filter((a) => !a.resolved)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map((a) => {
      const loc = a.line != null ? `${a.file}:${a.line}` : a.file;
      return `[${a.severity.toUpperCase()}] ${loc}: ${a.comment}`;
    });
}

export function pendingFixHints(ws: Workspace, change: string): string[] {
  return formatFixHints(readReviewAnnotations(ws, change).annotations);
}

/** Import from HarnessX YAML or generic JSON array. */
export function importReviewAnnotations(ws: Workspace, change: string, sourceFile: string): ReviewAnnotationsYaml {
  const abs = path.resolve(ws.root, sourceFile);
  if (!fs.existsSync(abs)) throw new Error(`review file not found: ${sourceFile}`);
  const text = fs.readFileSync(abs, "utf8");
  let incoming: ReviewAnnotation[] = [];

  if (sourceFile.endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    const arr = Array.isArray(parsed) ? parsed : (parsed as { annotations?: unknown[] }).annotations ?? [];
    incoming = arr.map((item, i) => normalizeAnnotation(item as Record<string, unknown>, i));
  } else {
    const parsed = readYaml<{ annotations?: ReviewAnnotation[] } | ReviewAnnotation[]>(abs);
    if (Array.isArray(parsed)) incoming = parsed.map((a, i) => normalizeAnnotation(a as unknown as Record<string, unknown>, i));
    else incoming = (parsed?.annotations ?? []).map((a, i) => normalizeAnnotation(a as unknown as Record<string, unknown>, i));
  }

  const existing = readReviewAnnotations(ws, change);
  const merged = [...existing.annotations];
  for (const a of incoming) {
    if (!merged.some((m) => m.id === a.id)) merged.push(a);
  }
  const out: ReviewAnnotationsYaml = { version: 1, annotations: merged };
  writeReviewAnnotations(ws, change, out);
  return out;
}

function normalizeAnnotation(raw: Record<string, unknown>, index: number): ReviewAnnotation {
  const sev = String(raw.severity ?? raw.level ?? "important").toLowerCase();
  const severity: ReviewSeverity =
    sev === "critical" || sev === "block" ? "critical" : sev === "minor" || sev === "warn" ? "minor" : sev === "suggestion" || sev === "info" ? "suggestion" : "important";
  return {
    id: String(raw.id ?? `import-${index + 1}`),
    file: String(raw.file ?? raw.path ?? ""),
    line: typeof raw.line === "number" ? raw.line : typeof raw.startLine === "number" ? raw.startLine : undefined,
    endLine: typeof raw.endLine === "number" ? raw.endLine : undefined,
    severity,
    comment: String(raw.comment ?? raw.body ?? raw.message ?? ""),
    author: raw.author ? String(raw.author) : undefined,
    at: raw.at ? String(raw.at) : new Date().toISOString(),
    resolved: Boolean(raw.resolved)
  };
}

export function resolveAnnotation(ws: Workspace, change: string, id: string): void {
  const data = readReviewAnnotations(ws, change);
  const ann = data.annotations.find((a) => a.id === id);
  if (!ann) throw new Error(`annotation not found: ${id}`);
  ann.resolved = true;
  writeReviewAnnotations(ws, change, data);
}
