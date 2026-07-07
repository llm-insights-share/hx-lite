import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashHubAssetDir, verifyHubAssetHash } from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m17-"));

describe("hub integrity", () => {
  it("computes stable hash and detects drift", () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, "nested"), { recursive: true });
    fs.writeFileSync(path.join(dir, "asset.yaml"), "id: a\nversion: 1.0.0\n");
    fs.writeFileSync(path.join(dir, "nested", "SKILL.md"), "hello\n");
    const hash = hashHubAssetDir(dir);
    expect(verifyHubAssetHash(dir, hash).ok).toBe(true);
    fs.writeFileSync(path.join(dir, "nested", "SKILL.md"), "changed\n");
    expect(verifyHubAssetHash(dir, hash).ok).toBe(false);
  });
});
