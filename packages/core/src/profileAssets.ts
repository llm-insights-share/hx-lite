import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { AssetManifest, type DeliveryStage, type GuideDef, type HarnessYaml, type SensorDef, GUIDE_KINDS, SENSOR_KINDS } from "./schemas.js";
import { DEFAULT_PROFILE_STAGES, STAGE_TASKS, type DeliveryStage as StageId } from "./stages.js";
import { walkHubPackages, type HubPackageLocation } from "./hubPackagePaths.js";
import { hubAdd, type HubRef } from "./hub.js";
import { Workspace, writeYaml } from "./paths.js";
import { guideDefFromHubAsset } from "./harnessCompose.js";
import { loadAssetDir } from "./assets.js";
import { SKILL_ENTRY } from "./skill.js";

export interface ProfileTaskRef {
  stage: DeliveryStage;
  taskId: string;
}

export interface ResolvedProfileAsset {
  id: string;
  version: string;
  kind: string;
  stage: DeliveryStage;
  task?: string;
  dir: string;
}

export interface ProfileAssetResolution {
  profile: string;
  stages: DeliveryStage[];
  tasks: ProfileTaskRef[];
  assets: ResolvedProfileAsset[];
}

/** Task ids enabled for a profile+stage (defaults from DEFAULT_PROFILE_STAGES / STAGE_TASKS). */
export function profileTaskIdsForStage(profile: string, stage: DeliveryStage): string[] {
  const defaults = DEFAULT_PROFILE_STAGES[profile];
  if (!defaults?.stages.includes(stage)) return [];

  if (stage === "dev" && defaults.dev_tasks?.length) return defaults.dev_tasks;
  if (stage === "test" && defaults.test_tasks?.length) return defaults.test_tasks;
  if (stage === "req" && defaults.req_tasks?.length) return defaults.req_tasks;
  if (stage === "arch" && defaults.arch_tasks?.length) return defaults.arch_tasks;

  // Prefer required tasks for full stages; lite already narrowed via defaults.
  return STAGE_TASKS[stage as StageId].filter((t) => t.required).map((t) => t.id);
}

export function profileTaskSet(profile: string): ProfileTaskRef[] {
  const defaults = DEFAULT_PROFILE_STAGES[profile];
  if (!defaults) throw new Error(`unknown profile "${profile}" — expected lite|standard|strict|enterprise`);
  const tasks: ProfileTaskRef[] = [];
  for (const stage of defaults.stages) {
    for (const taskId of profileTaskIdsForStage(profile, stage)) {
      tasks.push({ stage, taskId });
    }
  }
  return tasks;
}

function taskKey(stage: string, taskId: string): string {
  return `${stage}.${taskId}`;
}

function readManifest(dir: string): AssetManifest | null {
  const f = path.join(dir, "asset.yaml");
  if (!fs.existsSync(f)) return null;
  try {
    return AssetManifest.parse(YAML.parse(fs.readFileSync(f, "utf8")));
  } catch {
    return null;
  }
}

function assetMatchesTasks(manifest: AssetManifest, allowed: Set<string>): boolean {
  if (!manifest.stage) return false;
  // Match stage.task when task is set; otherwise match any task under that stage for the profile.
  if (manifest.task) return allowed.has(taskKey(manifest.stage, manifest.task));
  for (const k of allowed) {
    if (k.startsWith(`${manifest.stage}.`)) return true;
  }
  return false;
}

/** Pick latest version per id among walk results. */
function latestById(locs: HubPackageLocation[]): HubPackageLocation[] {
  const best = new Map<string, HubPackageLocation>();
  for (const loc of locs) {
    const prev = best.get(loc.id);
    if (!prev || loc.version.localeCompare(prev.version, undefined, { numeric: true }) > 0) {
      best.set(loc.id, loc);
    }
  }
  return [...best.values()];
}

/**
 * Resolve hub guide/sensor packages whose asset.yaml stage(+task) fall under the profile's stages/tasks.
 */
export function resolveProfileAssets(hubRoot: string, profile: string): ProfileAssetResolution {
  const defaults = DEFAULT_PROFILE_STAGES[profile];
  if (!defaults) throw new Error(`unknown profile "${profile}" — expected lite|standard|strict|enterprise`);

  const tasks = profileTaskSet(profile);
  const allowed = new Set(tasks.map((t) => taskKey(t.stage, t.taskId)));
  const assets: ResolvedProfileAsset[] = [];

  for (const loc of latestById(walkHubPackages(hubRoot))) {
    const manifest = readManifest(loc.dir);
    if (!manifest) continue;
    if (!manifest.kind.startsWith("guide.") && !manifest.kind.startsWith("sensor.")) continue;
    if (!assetMatchesTasks(manifest, allowed)) continue;
    assets.push({
      id: manifest.id,
      version: manifest.version,
      kind: manifest.kind,
      stage: manifest.stage,
      task: manifest.task,
      dir: loc.dir
    });
  }

  assets.sort((a, b) => a.id.localeCompare(b.id));
  return { profile, stages: [...defaults.stages], tasks, assets };
}

function findAssetContentFile(assetDir: string): string {
  for (const name of ["SKILL.md", "template.md", "COMMAND.md", "constraint.yaml", "rules.yaml"]) {
    if (fs.existsSync(path.join(assetDir, name))) return name;
  }
  for (const e of fs.readdirSync(assetDir, { withFileTypes: true })) {
    if (e.isFile() && /\.(md|yaml|yml)$/.test(e.name) && e.name !== "asset.yaml") return e.name;
  }
  throw new Error(`no content file in asset dir ${assetDir}`);
}

function sensorDefFromHubAsset(ws: Workspace, assetDir: string, manifest: AssetManifest): SensorDef {
  const kind = SENSOR_KINDS.find((k) => k === manifest.kind);
  if (!kind) throw new Error(`asset ${manifest.id} is not a sensor kind`);
  const runRel = path.relative(ws.base, path.join(assetDir, findAssetContentFile(assetDir))).replace(/\\/g, "/");
  return {
    id: manifest.id,
    kind,
    execution: manifest.execution ?? "computational",
    stage: manifest.stage,
    task: manifest.task,
    trigger: "task",
    run: runRel,
    on_fail: "block",
    max_retries: 0,
    timeout_ms: 120000
  };
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Install profile-resolved hub assets into the workspace:
 * - copies package into .hub-cache and local assets/
 * - registers guides/sensors on harness.yaml
 * - pins dependencies
 */
export function applyProfileAssets(ws: Workspace, hubRoot: string, profile: string): { installed: string[]; assets: ResolvedProfileAsset[] } {
  const resolution = resolveProfileAssets(hubRoot, profile);
  const harness = ws.readHarness();
  const guideIds = new Set(harness.guides.map((g) => g.id));
  const sensorIds = new Set(harness.sensors.map((s) => s.id));
  const installed: string[] = [];

  for (const asset of resolution.assets) {
    const ref: HubRef = { id: asset.id, version: asset.version };
    const { dir: cacheDir } = hubAdd(ws, hubRoot, ref);

    const localDir = path.join(ws.assetsDir, asset.kind.startsWith("guide.") ? "guides" : "sensors", asset.id);
    copyDir(cacheDir, localDir);

    const dep = `${asset.id}@${asset.version}`;
    if (!harness.dependencies.includes(dep)) harness.dependencies.push(dep);

    if (asset.kind.startsWith("guide.") && !guideIds.has(asset.id)) {
      const def = guideDefFromHubAsset(ws, localDir, AssetManifest.parse(YAML.parse(fs.readFileSync(path.join(localDir, "asset.yaml"), "utf8"))));
      harness.guides.push(def);
      guideIds.add(asset.id);
    } else if (asset.kind.startsWith("sensor.") && !sensorIds.has(asset.id)) {
      const def = sensorDefFromHubAsset(ws, localDir, AssetManifest.parse(YAML.parse(fs.readFileSync(path.join(localDir, "asset.yaml"), "utf8"))));
      harness.sensors.push(def);
      sensorIds.add(asset.id);
    }

    installed.push(dep);
  }

  // Ensure profile exists and config will select it — merge DEFAULT if missing
  if (!harness.profiles[profile] && DEFAULT_PROFILE_STAGES[profile]) {
    const d = DEFAULT_PROFILE_STAGES[profile];
    harness.profiles[profile] = {
      stages: [...d.stages],
      dev_tasks: d.dev_tasks,
      test_tasks: d.test_tasks,
      req_tasks: d.req_tasks,
      arch_tasks: d.arch_tasks,
      suites: {}
    };
  }

  writeYaml(ws.harnessFile, harness);
  return { installed, assets: resolution.assets };
}

export function validateActiveStages(profile: string, stages: DeliveryStage[]): DeliveryStage[] {
  const allowed = new Set(DEFAULT_PROFILE_STAGES[profile]?.stages ?? []);
  if (!allowed.size) throw new Error(`unknown profile "${profile}"`);
  const out: DeliveryStage[] = [];
  for (const s of stages) {
    if (!allowed.has(s)) {
      throw new Error(`stage "${s}" is not part of profile "${profile}" (allowed: ${[...allowed].join(", ")})`);
    }
    if (!out.includes(s)) out.push(s);
  }
  if (!out.length) throw new Error("at least one stage required");
  return out;
}

/** Effective stages for gates: active_stages ∩ profile.stages (falls back to profile stages). */
export function effectiveStages(config: { profile: string; active_stages?: DeliveryStage[] }, harness?: HarnessYaml): DeliveryStage[] {
  const profile = config.profile;
  const profileStagesList =
    harness?.profiles[profile]?.stages ??
    DEFAULT_PROFILE_STAGES[profile]?.stages ??
    (["dev"] as DeliveryStage[]);
  if (!config.active_stages?.length) return [...profileStagesList];
  const allowed = new Set(profileStagesList);
  return config.active_stages.filter((s) => allowed.has(s));
}

export function isGuideKind(kind: string): kind is (typeof GUIDE_KINDS)[number] {
  return (GUIDE_KINDS as readonly string[]).includes(kind);
}

export function isSensorKind(kind: string): kind is (typeof SENSOR_KINDS)[number] {
  return (SENSOR_KINDS as readonly string[]).includes(kind);
}

/** @internal — ensure skill path exists when copying */
export function assertSkillEntry(assetDir: string, id: string): void {
  if (!fs.existsSync(path.join(assetDir, SKILL_ENTRY))) {
    throw new Error(`guide.skill asset ${id} missing ${SKILL_ENTRY}`);
  }
}

export type { GuideDef };
