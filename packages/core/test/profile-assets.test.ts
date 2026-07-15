import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createProject,
  localInit,
  resolveProfileAssets,
  seedGoldenHub,
  validateActiveStages
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-profile-assets-"));

describe("profile assets", () => {
  it("resolveProfileAssets returns fewer stages/assets for lite than standard", () => {
    const hub = path.join(tmp(), "hub");
    seedGoldenHub(hub);

    const lite = resolveProfileAssets(hub, "lite");
    const standard = resolveProfileAssets(hub, "standard");

    expect(lite.stages).toEqual(["dev"]);
    expect(standard.stages).toEqual(expect.arrayContaining(["req", "arch", "dev", "test"]));
    expect(standard.stages.length).toBeGreaterThan(lite.stages.length);

    expect(lite.assets.every((a) => a.stage === "dev")).toBe(true);
    expect(standard.assets.some((a) => a.stage === "test")).toBe(true);
    expect(standard.assets.length).toBeGreaterThan(lite.assets.length);
    expect(standard.assets.some((a) => a.id === "test-cases-template")).toBe(true);
    expect(lite.assets.some((a) => a.id === "test-cases-template")).toBe(false);
  });

  it("createProject installs resolved assets into the workspace", () => {
    const root = tmp();
    const hub = path.join(root, "hub");
    seedGoldenHub(hub);

    const res = createProject(root, { profile: "lite", hubRoot: hub });
    expect(res.resolution.profile).toBe("lite");
    expect(res.resolution.assets.length).toBeGreaterThan(0);
    expect(res.created.some((c) => c.startsWith("asset "))).toBe(true);

    const harness = res.ws.readHarness();
    for (const asset of res.resolution.assets.slice(0, 3)) {
      const dep = `${asset.id}@${asset.version}`;
      expect(harness.dependencies).toContain(dep);
      const localDir = path.join(
        res.ws.assetsDir,
        asset.kind.startsWith("guide.") ? "guides" : "sensors",
        asset.id
      );
      expect(fs.existsSync(path.join(localDir, "asset.yaml"))).toBe(true);
    }
    expect(res.ws.readConfig().active_stages).toEqual(["dev"]);
  });

  it("localInit rejects a stage not in the project profile", () => {
    const root = tmp();
    const hub = path.join(root, "hub");
    seedGoldenHub(hub);
    createProject(root, { profile: "lite", hubRoot: hub });

    expect(() => localInit(root, { stages: ["req"] })).toThrow(/not part of profile "lite"/);
    const ok = localInit(root, { stages: ["dev"] });
    expect(ok.ws.readConfig().active_stages).toEqual(["dev"]);
  });

  it("validateActiveStages accepts profile subsets and rejects unknowns", () => {
    expect(validateActiveStages("standard", ["dev", "test"])).toEqual(["dev", "test"]);
    expect(validateActiveStages("enterprise", ["req", "dev"])).toEqual(["req", "dev"]);
    expect(() => validateActiveStages("lite", ["test"])).toThrow(/not part of profile "lite"/);
    expect(() => validateActiveStages("standard", [])).toThrow(/at least one stage/);
    expect(() => validateActiveStages("nope", ["dev"])).toThrow(/unknown profile/);
  });
});
