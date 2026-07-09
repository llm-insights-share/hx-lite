import fs from "node:fs";
import path from "node:path";
import { Workspace, writeYaml, readYaml } from "./paths.js";
import { ApprovalRecord, PrephaseApprovals } from "./schemas.js";
import { sha256 } from "./telemetry.js";

/** Workspace-level PRD/arch human approvals (pre-phase, outside change meta). */
export function prephaseApprovalsFile(ws: Workspace): string {
  return path.join(ws.root, "docs", ".prephase-approvals.yaml");
}

export function readPrephaseApprovals(ws: Workspace): PrephaseApprovals {
  const file = prephaseApprovalsFile(ws);
  if (!fs.existsSync(file)) {
    return PrephaseApprovals.parse({ version: "1.0", prd: {}, arch: undefined });
  }
  return PrephaseApprovals.parse(readYaml(file));
}

export function writePrephaseApprovals(ws: Workspace, data: PrephaseApprovals): void {
  writeYaml(prephaseApprovalsFile(ws), data);
}

export function prdArtifactHash(ws: Workspace, slug: string): string {
  const file = ws.prdFile(slug);
  return fs.existsSync(file) ? sha256(fs.readFileSync(file, "utf8")) : "";
}

export function archArtifactHash(ws: Workspace): string {
  let content = "";
  const overview = ws.archOverviewFile();
  const registry = ws.archRegistryFile();
  if (fs.existsSync(overview)) content += fs.readFileSync(overview, "utf8");
  if (fs.existsSync(registry)) content += fs.readFileSync(registry, "utf8");
  return content ? sha256(content) : "";
}

/** Record human sign-off for org-level PRD or global arch HLD. */
export function recordPrephaseApproval(
  ws: Workspace,
  gate: "prd" | "arch",
  approver: string,
  prdSlug?: string
): ApprovalRecord {
  const store = readPrephaseApprovals(ws);
  const artifactHash = gate === "prd" ? prdArtifactHash(ws, prdSlug!) : archArtifactHash(ws);
  if (!artifactHash) {
    throw new Error(gate === "prd" ? `PRD file missing for slug "${prdSlug}"` : "architecture overview/registry missing — run hx arch init");
  }
  const record: ApprovalRecord = {
    gate,
    approver,
    at: new Date().toISOString(),
    artifactHash
  };
  if (gate === "prd") {
    if (!prdSlug) throw new Error("--prd <slug> required for gate prd");
    store.prd[prdSlug] = record;
  } else {
    store.arch = record;
  }
  writePrephaseApprovals(ws, store);
  return record;
}

export function prdApproval(ws: Workspace, slug: string): ApprovalRecord | undefined {
  return readPrephaseApprovals(ws).prd[slug];
}

export function archApproval(ws: Workspace): ApprovalRecord | undefined {
  return readPrephaseApprovals(ws).arch;
}

/** True when approval exists and still matches current artifact content. */
export function isPrephaseApproved(ws: Workspace, gate: "prd" | "arch", prdSlug?: string): boolean {
  const record = gate === "prd" ? prdApproval(ws, prdSlug!) : archApproval(ws);
  if (!record) return false;
  const current = gate === "prd" ? prdArtifactHash(ws, prdSlug!) : archArtifactHash(ws);
  return Boolean(current) && record.artifactHash === current;
}
