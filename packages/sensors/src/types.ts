import type { Workspace } from "@harnessx/core/paths.js";
import type { SensorDef, SensorReport } from "@harnessx/core/schemas.js";
import type { ResolvedSensorConfig } from "@harnessx/core/sensorConfig.js";

export interface SensorContext {
  ws: Workspace;
  change?: string;
  def: SensorDef;
  /** Changed files relative to repo root (relevance heuristics, NFR-001). */
  changedFiles?: string[];
  /** Pre-phase: PRD slug for prd-complete */
  prdSlug?: string;
  /** Pre-phase: module id for arch-lld-complete */
  archModule?: string;
  /** Merged pack + inline sensor config. */
  config?: Record<string, unknown>;
  resolved?: ResolvedSensorConfig;
}

export type BuiltinSensor = (ctx: SensorContext) => Promise<SensorReport> | SensorReport;
