import fs from "node:fs";
import YAML from "yaml";
import { ArchRegistry, type ArchModule } from "./schemas.js";
import { Workspace, ensureDir, writeYaml } from "./paths.js";

export function readArchRegistry(ws: Workspace): ArchRegistry {
  const f = ws.archRegistryFile();
  if (!fs.existsSync(f)) {
    return ArchRegistry.parse({ version: "1.0", modules: [] });
  }
  return ArchRegistry.parse(YAML.parse(fs.readFileSync(f, "utf8")) ?? {});
}

export function writeArchRegistry(ws: Workspace, registry: ArchRegistry): void {
  ensureDir(ws.archDir());
  writeYaml(ws.archRegistryFile(), { ...registry, updated_at: new Date().toISOString().slice(0, 10) });
}

export function resolveModuleByCapability(registry: ArchRegistry, capability: string): ArchModule | undefined {
  return registry.modules.find(
    (m) => m.status !== "deprecated" && m.capabilities.some((c) => c === capability)
  );
}

export function listActiveModules(registry: ArchRegistry): ArchModule[] {
  return registry.modules.filter((m) => m.status === "active");
}
