import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Workspace } from "./paths.js";
import type { SensorCheck, SensorDef } from "./schemas.js";
import { resolvePrdSlug } from "./prd.js";

export interface ResolvedSensorConfig {
  check: SensorCheck;
  expr?: string;
  run?: string;
  rules_text?: string;
  rules_file?: string;
  input?: string[];
  output?: string;
  /** Merged config from source/config.yaml + def.config */
  config: Record<string, unknown>;
  sourceDir?: string;
  rules: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge plain objects; arrays and scalars from `over` win. */
export function deepMergeConfig(
  base: Record<string, unknown>,
  over: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeConfig(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function resolveSourcePath(ws: Workspace, source: string): { dir?: string; file?: string } {
  const abs = path.isAbsolute(source) ? source : path.join(ws.base, source);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    return { dir: abs };
  }
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return { dir: path.dirname(abs), file: abs };
  }
  if (!path.extname(source) || source.endsWith("/") || source.endsWith(path.sep)) {
    return { dir: abs };
  }
  return { file: abs, dir: path.dirname(abs) };
}

function loadYamlFile(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const raw = YAML.parse(fs.readFileSync(file, "utf8"));
  return isPlainObject(raw) ? raw : {};
}

/**
 * Resolve check kind: inline | shell | rules.
 * Uses explicit `check`, else infers from expr / run / rules_* fields (and pack config).
 */
export function resolveCheckKind(def: SensorDef, packConfig: Record<string, unknown> = {}): SensorCheck | null {
  if (def.check) return def.check;
  if (typeof packConfig.check === "string" && ["inline", "shell", "rules"].includes(packConfig.check)) {
    return packConfig.check as SensorCheck;
  }
  if (def.expr || typeof packConfig.expr === "string") return "inline";
  if (def.rules_text || def.rules_file || typeof packConfig.rules_text === "string" || typeof packConfig.rules_file === "string") {
    return "rules";
  }
  if (def.run || typeof packConfig.run === "string") return "shell";
  return null;
}

/**
 * Resolve HX_OUTPUT / $OUTPUT path for shell sensors.
 */
export function resolveSensorOutputPath(
  ws: Workspace,
  def: SensorDef,
  change: string | undefined,
  config: Record<string, unknown>,
  prdSlug?: string
): { output: string; outputFile: string } {
  const slug = prdSlug ?? (change ? resolvePrdSlug(ws, change) : undefined);
  const vars = {
    change: change ?? "",
    slug: slug ?? "",
    module: "",
    root: ws.root,
    base: ws.base
  };

  const explicit = def.output ?? (typeof config.output === "string" ? config.output : undefined);

  if (explicit) {
    const filled = interpolateSensorTemplate(explicit, vars);
    const abs = path.isAbsolute(filled) ? filled : path.join(ws.root, filled);
    const isFile = abs.endsWith(".md") || abs.endsWith(".yaml") || abs.endsWith(".yml") || abs.endsWith(".json");
    return { output: abs, outputFile: isFile ? abs : "" };
  }

  if (def.stage === "req" && def.task === "prd-writing" && slug) {
    const f = ws.prdFile(slug);
    return { output: f, outputFile: f };
  }
  if (def.stage === "arch" && (def.task === "subsystem-division" || !def.task)) {
    const f = ws.archOverviewFile();
    return { output: f, outputFile: f };
  }
  if (change) {
    const dir = ws.changeDir(change);
    return { output: dir, outputFile: "" };
  }
  return { output: ws.root, outputFile: "" };
}

/** Build env map for shell sensors (HX_*). */
export function buildShellSensorEnv(
  ws: Workspace,
  def: SensorDef,
  change: string | undefined,
  opts: {
    config?: Record<string, unknown>;
    prdSlug?: string;
    changedFiles?: string[];
    profile?: string;
  } = {}
): Record<string, string> {
  const config = opts.config ?? {};
  const { output, outputFile } = resolveSensorOutputPath(ws, def, change, config, opts.prdSlug);
  const scopeFiles = opts.changedFiles?.length
    ? opts.changedFiles.join("\n")
    : (def.scope ?? []).join("\n");
  return {
    HX_CHANGE: change ?? "",
    HX_ROOT: ws.root,
    HX_BASE: ws.base,
    HX_SENSOR_ID: def.id,
    HX_OUTPUT: output,
    HX_OUTPUT_FILE: outputFile,
    HX_SCOPE: scopeFiles,
    HX_PROFILE: opts.profile ?? "",
    CHANGE: change ?? "",
    ROOT: ws.root,
    BASE: ws.base,
    SENSOR_ID: def.id,
    OUTPUT: output,
    OUTPUT_FILE: outputFile,
    SCOPE: scopeFiles,
    PROFILE: opts.profile ?? ""
  };
}

/**
 * Load and merge sensor pack config + harness inline config.
 */
export function resolveSensorConfig(ws: Workspace, def: SensorDef): ResolvedSensorConfig {
  let packConfig: Record<string, unknown> = {};
  let sourceDir: string | undefined;
  let rulesFromPack: string[] = [];

  if (def.source) {
    const resolved = resolveSourcePath(ws, def.source);
    sourceDir = resolved.dir;
    const configFile =
      resolved.file && /\.(yaml|yml)$/i.test(resolved.file)
        ? resolved.file
        : sourceDir
          ? path.join(sourceDir, "config.yaml")
          : undefined;
    if (configFile) packConfig = loadYamlFile(configFile);
    const rulesFile = sourceDir ? path.join(sourceDir, "rules.yaml") : undefined;
    if (rulesFile && fs.existsSync(rulesFile)) {
      rulesFromPack = [path.relative(ws.base, rulesFile).replace(/\\/g, "/")];
    }
    const rulesMd = sourceDir ? path.join(sourceDir, "rules.md") : undefined;
    if (rulesMd && fs.existsSync(rulesMd) && !def.rules_file && !packConfig.rules_file) {
      packConfig = { ...packConfig, rules_file: path.relative(ws.base, rulesMd).replace(/\\/g, "/") };
    }
  }

  const config = deepMergeConfig(packConfig, (def.config ?? {}) as Record<string, unknown>);
  const check = resolveCheckKind(def, config);
  if (!check) {
    throw new Error(
      `sensor "${def.id}" missing check (inline|shell|rules); set check or provide expr / run / rules_text|rules_file`
    );
  }

  const expr = def.expr ?? (typeof config.expr === "string" ? config.expr : undefined);
  const rules_text = def.rules_text ?? (typeof config.rules_text === "string" ? config.rules_text : undefined);
  const rules_file = def.rules_file ?? (typeof config.rules_file === "string" ? config.rules_file : undefined);
  const input = def.input ?? (Array.isArray(config.input) ? (config.input as string[]) : undefined);
  const output = def.output ?? (typeof config.output === "string" ? config.output : undefined);

  const rules = [
    ...rulesFromPack,
    ...(def.rules ?? []),
    ...(Array.isArray(config.rules) ? (config.rules as string[]) : [])
  ];

  let run = def.run ?? (typeof config.run === "string" ? config.run : undefined);

  if (sourceDir && !run && check === "shell") {
    for (const name of ["check.sh", "check.bash", "check.py"]) {
      const p = path.join(sourceDir, name);
      if (fs.existsSync(p)) {
        const rel = path.relative(ws.base, p).replace(/\\/g, "/");
        run = name.endsWith(".py") ? `python3 ${rel}` : `bash ${rel}`;
        break;
      }
    }
  }

  if (check === "inline" && !expr) {
    throw new Error(`sensor "${def.id}" check:inline requires expr`);
  }
  if (check === "shell" && !run) {
    throw new Error(`sensor "${def.id}" check:shell requires run (or pack check.sh)`);
  }
  if (check === "rules" && !rules_text && !rules_file && rules.length === 0) {
    throw new Error(`sensor "${def.id}" check:rules requires rules_text, rules_file, or rules`);
  }

  return {
    check,
    expr,
    run: check === "shell" ? run : undefined,
    rules_text,
    rules_file,
    input,
    output,
    config,
    sourceDir,
    rules: [...new Set(rules)]
  };
}

/** Simple `{change}` / `{slug}` / `{module}` interpolation for messages and paths. */
export function interpolateSensorTemplate(
  template: string,
  vars: { change?: string; slug?: string; module?: string; root?: string; base?: string }
): string {
  return template
    .replaceAll("{change}", vars.change ?? "")
    .replaceAll("{slug}", vars.slug ?? "")
    .replaceAll("{module}", vars.module ?? "")
    .replaceAll("{root}", vars.root ?? "")
    .replaceAll("{base}", vars.base ?? "")
    .replaceAll("$CHANGE", vars.change ?? "")
    .replaceAll("$SLUG", vars.slug ?? "")
    .replaceAll("$ROOT", vars.root ?? "")
    .replaceAll("$BASE", vars.base ?? "");
}

/**
 * Build a SensorDef from a hub/local sensor asset directory.
 */
export function sensorDefFromHubAsset(
  ws: Workspace,
  assetDir: string,
  manifest: { id: string; kind: string; execution?: string; stage: SensorDef["stage"]; task?: string }
): SensorDef {
  const kind = manifest.kind as SensorDef["kind"];
  const sourceRel = path.relative(ws.base, assetDir).replace(/\\/g, "/");
  const pack = loadYamlFile(path.join(assetDir, "config.yaml"));

  const def: SensorDef = {
    id: manifest.id,
    kind,
    execution: (manifest.execution as SensorDef["execution"]) ?? "computational",
    stage: manifest.stage,
    task: manifest.task,
    trigger: "task",
    source: sourceRel,
    on_fail: "block",
    max_retries: 0,
    timeout_ms: 120000
  };

  if (typeof pack.check === "string") def.check = pack.check as SensorDef["check"];
  if (typeof pack.expr === "string") def.expr = pack.expr;
  if (typeof pack.rules_text === "string") def.rules_text = pack.rules_text;
  if (typeof pack.rules_file === "string") def.rules_file = pack.rules_file;
  if (Array.isArray(pack.input)) def.input = pack.input as string[];
  if (typeof pack.output === "string") def.output = pack.output;
  if (typeof pack.run === "string") def.run = pack.run;
  if (typeof pack.on_fail === "string") def.on_fail = pack.on_fail as SensorDef["on_fail"];
  if (typeof pack.fix_hint === "string") def.fix_hint = pack.fix_hint;
  if (typeof pack.budget_tokens === "number") def.budget_tokens = pack.budget_tokens;
  if (Array.isArray(pack.rules)) def.rules = pack.rules as string[];
  if (isPlainObject(pack.config)) def.config = pack.config as Record<string, unknown>;
  else {
    const skip = new Set([
      "check",
      "expr",
      "run",
      "on_fail",
      "fix_hint",
      "budget_tokens",
      "rules",
      "rules_text",
      "rules_file",
      "input",
      "output"
    ]);
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(pack)) {
      if (!skip.has(k)) rest[k] = v;
    }
    if (Object.keys(rest).length) def.config = rest;
  }

  if (!def.check && !def.expr && !def.run && !def.rules_text && !def.rules_file) {
    for (const name of ["check.sh", "check.bash"]) {
      if (fs.existsSync(path.join(assetDir, name))) {
        def.check = "shell";
        def.run = `bash ${path.join(sourceRel, name).replace(/\\/g, "/")}`;
        break;
      }
    }
    if (!def.run && fs.existsSync(path.join(assetDir, "check.py"))) {
      def.check = "shell";
      def.run = `python3 ${path.join(sourceRel, "check.py").replace(/\\/g, "/")}`;
    }
    if (fs.existsSync(path.join(assetDir, "rules.md"))) {
      def.check = "rules";
      def.rules_file = path.join(sourceRel, "rules.md").replace(/\\/g, "/");
    } else if (fs.existsSync(path.join(assetDir, "rules.yaml"))) {
      def.check = "rules";
      def.rules_file = path.join(sourceRel, "rules.yaml").replace(/\\/g, "/");
    }
  }

  if (!def.check) {
    if (def.expr) def.check = "inline";
    else if (def.rules_text || def.rules_file) def.check = "rules";
    else if (def.run) def.check = "shell";
  }

  return def;
}
