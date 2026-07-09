import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeYaml } from "./paths.js";
import { AssetManifest, type AssetKind, type AssetStatus } from "./schemas.js";

export interface CreateAssetOptions {
  rootDir: string;
  id: string;
  kind: AssetKind;
  version?: string;
  status?: AssetStatus;
  phase?: string[];
  owner?: string;
}

export interface CreateAssetResult {
  dir: string;
  files: string[];
}

function templateFiles(kind: AssetKind): Record<string, string> {
  if (kind === "guide.skill") return { "SKILL.md": "# Skill\n\nDescribe guidance.\n" };
  if (kind === "guide.template") return { "template.md": "# Template\n\n{{content}}\n" };
  if (kind === "sensor.rubric") return { "rules.yaml": "rules: []\n" };
  if (kind === "harness.bundle") return { "bundle.yaml": "description: bundle\nguides: []\nsensors: []\n", "assets/.keep": "" };
  if (kind === "harness.blueprint") return { "blueprint.yaml": "name: blueprint\nhub_deps: []\n" };
  return { "README.md": "# Asset\n" };
}

function executionForKind(kind: AssetKind): "inferential" | "computational" | undefined {
  if (kind.startsWith("guide.")) return kind === "guide.template" || kind === "guide.constraint" ? "computational" : "inferential";
  if (kind.startsWith("sensor.")) return "computational";
  return undefined;
}

/** Creates a local asset directory with asset.yaml and skeleton files. */
export function createAssetScaffold(opts: CreateAssetOptions): CreateAssetResult {
  const dir = path.resolve(opts.rootDir);
  ensureDir(dir);
  const files: string[] = [];

  const manifest: AssetManifest = AssetManifest.parse({
    id: opts.id,
    kind: opts.kind,
    version: opts.version ?? "0.1.0",
    status: opts.status ?? "draft",
    origin: "local",
    phase: opts.phase ?? [],
    owner: opts.owner,
    execution: executionForKind(opts.kind),
    provenance: [],
    metrics: {}
  });
  writeYaml(path.join(dir, "asset.yaml"), manifest);
  files.push("asset.yaml");

  const templates = templateFiles(opts.kind);
  for (const [rel, content] of Object.entries(templates)) {
    const abs = path.join(dir, rel);
    ensureDir(path.dirname(abs));
    if (!fs.existsSync(abs)) {
      fs.writeFileSync(abs, content, "utf8");
      files.push(rel);
    }
  }
  return { dir, files };
}
