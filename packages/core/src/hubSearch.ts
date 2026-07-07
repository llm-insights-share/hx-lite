import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { AssetManifest } from "./schemas.js";
import { hubPackageDir, hubBundleDir, hubVersions } from "./hub.js";
import { hubBlueprintDir } from "./blueprint.js";

/**
 * Hub asset search & catalog index (v0.4).
 */

export interface HubCatalogEntry {
  id: string;
  version: string;
  kind: string;
  category: "package" | "bundle" | "blueprint";
  status?: string;
  phase?: string[];
  description?: string;
}

export interface HubSearchOptions {
  kind?: string;
  phase?: string;
  category?: "package" | "bundle" | "blueprint";
  query?: string;
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

function readDescription(dir: string, category: HubCatalogEntry["category"]): string | undefined {
  if (category === "bundle") {
    const f = path.join(dir, "bundle.yaml");
    if (fs.existsSync(f)) return (YAML.parse(fs.readFileSync(f, "utf8")) as { description?: string }).description;
  }
  if (category === "blueprint") {
    const f = path.join(dir, "blueprint.yaml");
    if (fs.existsSync(f)) return (YAML.parse(fs.readFileSync(f, "utf8")) as { name?: string }).name;
  }
  return undefined;
}

/** Indexes all hub assets across packages/, bundles/, blueprints/. */
export function indexHubCatalog(hubRoot: string): HubCatalogEntry[] {
  const out: HubCatalogEntry[] = [];
  const scan = (category: HubCatalogEntry["category"], subdir: "packages" | "bundles" | "blueprints", resolve: (id: string, ver: string) => string) => {
    const root = path.join(hubRoot, subdir);
    if (!fs.existsSync(root)) return;
    for (const id of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const ver of hubVersions(hubRoot, id.name, subdir)) {
        const dir = resolve(id.name, ver);
        const manifest = readManifest(dir);
        if (!manifest) continue;
        out.push({
          id: manifest.id,
          version: manifest.version,
          kind: manifest.kind,
          category,
          status: manifest.status,
          phase: manifest.phase,
          description: readDescription(dir, category)
        });
      }
    }
  };
  scan("package", "packages", (id, ver) => hubPackageDir(hubRoot, id, ver));
  scan("bundle", "bundles", (id, ver) => hubBundleDir(hubRoot, id, ver));
  scan("blueprint", "blueprints", (id, ver) => hubBlueprintDir(hubRoot, id, ver));
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
}

export function searchHubCatalog(hubRoot: string, opts: HubSearchOptions = {}): HubCatalogEntry[] {
  const q = opts.query?.toLowerCase();
  return indexHubCatalog(hubRoot).filter((e) => {
    if (opts.kind && e.kind !== opts.kind) return false;
    if (opts.category && e.category !== opts.category) return false;
    if (opts.phase && !(e.phase ?? []).includes(opts.phase)) return false;
    if (q) {
      const hay = `${e.id} ${e.version} ${e.kind} ${e.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Writes a searchable JSON index beside the hub root. */
export function writeHubIndex(hubRoot: string): string {
  const file = path.join(hubRoot, "index.json");
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), entries: indexHubCatalog(hubRoot) }, null, 2), "utf8");
  return file;
}
