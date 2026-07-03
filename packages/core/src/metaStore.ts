import fs from "node:fs";
import YAML from "yaml";
import { MetaYaml, type GateHistoryEntry, type ApprovalRecord, type WaiverRecord, type PhaseState } from "./schemas.js";
import { Workspace, ensureDir, writeYaml } from "./paths.js";
import { sha256, runsLogHash } from "./telemetry.js";
import path from "node:path";

/**
 * Exclusive meta.yaml writer (FR-050): every mutation goes through this module,
 * which stamps a contentHash. `verifyMeta` lets CI detect manual edits and
 * checks that recorded gate results are bound to the actual sensor log.
 */

function canonical(meta: MetaYaml): string {
  const { contentHash: _omit, ...rest } = meta;
  return JSON.stringify(rest);
}

export function writeMeta(ws: Workspace, meta: MetaYaml): void {
  meta.contentHash = sha256(canonical(meta));
  writeYaml(ws.metaFile(meta.change), meta);
}

export function readMeta(ws: Workspace, change: string): MetaYaml {
  return MetaYaml.parse(YAML.parse(fs.readFileSync(ws.metaFile(change), "utf8")));
}

export interface MetaVerifyResult {
  ok: boolean;
  problems: string[];
}

export function verifyMeta(ws: Workspace, change: string): MetaVerifyResult {
  const problems: string[] = [];
  let meta: MetaYaml;
  try {
    meta = readMeta(ws, change);
  } catch (e) {
    return { ok: false, problems: [`meta.yaml unreadable or invalid: ${(e as Error).message}`] };
  }
  if (!meta.contentHash) problems.push("meta.yaml missing contentHash (was it written by hand?)");
  else if (meta.contentHash !== sha256(canonical(meta)))
    problems.push("meta.yaml contentHash mismatch — file was edited outside the hx CLI");

  const lastGate = meta.gateHistory.at(-1);
  if (lastGate?.logHash) {
    const actual = runsLogHash(ws, change);
    if (actual !== lastGate.logHash)
      problems.push("gate result logHash does not match sensor run log — logs or meta were tampered with");
  }
  return { ok: problems.length === 0, problems };
}

export function initMeta(ws: Workspace, change: string, profile: string, domains: string[]): MetaYaml {
  const meta = MetaYaml.parse({
    change,
    status: "proposed",
    profile,
    touchedDomains: domains
  });
  ensureDir(ws.changeDir(change));
  writeMeta(ws, meta);
  return meta;
}

export function setStatus(ws: Workspace, change: string, status: PhaseState): MetaYaml {
  const meta = readMeta(ws, change);
  meta.status = status;
  writeMeta(ws, meta);
  return meta;
}

export function recordGate(ws: Workspace, change: string, entry: Omit<GateHistoryEntry, "at" | "logHash">): MetaYaml {
  const meta = readMeta(ws, change);
  meta.gateHistory.push({
    ...entry,
    at: new Date().toISOString(),
    logHash: runsLogHash(ws, change)
  });
  writeMeta(ws, meta);
  return meta;
}

export function recordApproval(ws: Workspace, change: string, gate: string, approver: string): ApprovalRecord {
  const meta = readMeta(ws, change);
  const specsDir = ws.deltaSpecsDir(change);
  let artifactContent = "";
  if (fs.existsSync(specsDir)) {
    for (const cap of fs.readdirSync(specsDir).sort()) {
      const f = path.join(specsDir, cap, "spec.md");
      if (fs.existsSync(f)) artifactContent += fs.readFileSync(f, "utf8");
    }
  }
  const record: ApprovalRecord = {
    gate,
    approver,
    at: new Date().toISOString(),
    artifactHash: sha256(artifactContent)
  };
  meta.approvals.push(record);
  writeMeta(ws, meta);
  return record;
}

export function addWaiver(ws: Workspace, change: string, waiver: WaiverRecord): void {
  const meta = readMeta(ws, change);
  meta.waivers.push(waiver);
  writeMeta(ws, meta);
}

export function activeWaivers(meta: MetaYaml, now = new Date()): WaiverRecord[] {
  return meta.waivers.filter((w) => new Date(w.expiresAt) > now);
}

export function expiredWaivers(meta: MetaYaml, now = new Date()): WaiverRecord[] {
  return meta.waivers.filter((w) => new Date(w.expiresAt) <= now);
}
