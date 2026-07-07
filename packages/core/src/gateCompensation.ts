import fs from "node:fs";
import path from "node:path";
import { Workspace } from "./paths.js";
import type { HarnessYaml } from "./schemas.js";

/**
 * Tier → Gate compensation (v0.3): weaker IDE adapters trigger stronger L3 checks.
 * Tier is read from config.yaml or inferred from compiled adapter metadata.
 */

export type Tier = 0 | 1 | 2;

export interface CompensationProfile {
  tier: Tier;
  /** Extra sensor ids appended to gate suites for this tier. */
  extraSensors: string[];
  /** When true, warn-level sensor failures become blockers. */
  escalateWarnToBlock: boolean;
  /** Recommend headless apply loop instead of IDE-only execution. */
  requireHeadlessApply: boolean;
}

const TIER_DEFAULTS: Record<Tier, Omit<CompensationProfile, "tier">> = {
  0: { extraSensors: ["typecheck", "lint", "unit-changed", "spec-validate"], escalateWarnToBlock: true, requireHeadlessApply: true },
  1: { extraSensors: [], escalateWarnToBlock: false, requireHeadlessApply: false },
  2: { extraSensors: ["typecheck", "lint", "spec-validate"], escalateWarnToBlock: true, requireHeadlessApply: true }
};

/** Reads `.harnessx-adapter-tier` written by `hx adapter sync` or config override. */
export function detectAdapterTier(ws: Workspace): Tier {
  const config = ws.readConfig();
  if (config.adapter?.tier !== undefined) return config.adapter.tier as Tier;

  const marker = path.join(ws.root, ".harnessx-adapter-tier");
  if (fs.existsSync(marker)) {
    const n = parseInt(fs.readFileSync(marker, "utf8").trim(), 10);
    if (n === 0 || n === 1 || n === 2) return n;
  }
  return 2;
}

export function resolveCompensation(ws: Workspace): CompensationProfile {
  const config = ws.readConfig();
  if (config.compensation?.enabled === false) {
    return { tier: detectAdapterTier(ws), extraSensors: [], escalateWarnToBlock: false, requireHeadlessApply: false };
  }
  const tier = detectAdapterTier(ws);
  const defaults = TIER_DEFAULTS[tier];
  const extra = config.compensation?.extra_verify_sensors ?? defaults.extraSensors;
  return {
    tier,
    extraSensors: [...extra],
    escalateWarnToBlock: config.compensation?.escalate_warn_to_block ?? defaults.escalateWarnToBlock,
    requireHeadlessApply: defaults.requireHeadlessApply
  };
}

/** Augments a suite's sensor list with tier-compensation extras (deduped, registered only). */
export function augmentSuiteIds(harness: HarnessYaml, suiteName: string | undefined, extraIds: string[]): string[] {
  if (!suiteName) return extraIds.filter((id) => harness.sensors.some((s) => s.id === id));
  const base = harness.suites[suiteName] ?? [];
  const registered = new Set(harness.sensors.map((s) => s.id));
  const out = [...base];
  for (const id of extraIds) {
    if (registered.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
