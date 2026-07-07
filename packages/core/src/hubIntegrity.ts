import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./telemetry.js";

const SKIP = new Set([".hub-review.yaml", ".review", ".hub-meta.yaml"]);

export function hashHubAssetDir(assetDir: string): string {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else files.push(p);
    }
  };
  visit(assetDir);
  return sha256(files.map((f) => `${path.relative(assetDir, f)}\n${fs.readFileSync(f, "utf8")}`).join("\x00"));
}

export function verifyHubAssetHash(assetDir: string, expected?: string): { ok: boolean; hash: string; detail?: string } {
  const hash = hashHubAssetDir(assetDir);
  if (!expected) return { ok: true, hash };
  return { ok: hash === expected, hash, detail: hash === expected ? undefined : `expected ${expected}, got ${hash}` };
}
