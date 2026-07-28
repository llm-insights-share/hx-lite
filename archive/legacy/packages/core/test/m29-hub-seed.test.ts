import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BUILTIN_HUB_GOLDEN_DIR, planSeedHub, readSeedManifest, seedHub, SEED_PROFILES } from "@harnessx/core";

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hub-seed-"));
}

describe("hub seed manifest", () => {
  it("reads manifest with profiles and scenarios", () => {
    const manifest = readSeedManifest();
    expect(manifest.profiles.standard).toBeDefined();
    expect(manifest.profiles.enterprise).toBeDefined();
    expect(manifest.profiles["enterprise-sdlc"]).toBeUndefined();
    expect(manifest.scenarios.api).toBeDefined();
    expect(manifest.catalog["coding-conventions@1.0.0"]?.category).toBe("package");
    expect(Object.values(manifest.catalog).every((e) => e.category === "package" || e.category === "eval")).toBe(true);
  });

  it("exposes seed profiles without bundles or enterprise-sdlc", () => {
    expect([...SEED_PROFILES]).toEqual(["minimal", "standard", "strict", "enterprise"]);
    expect(SEED_PROFILES).not.toContain("enterprise-sdlc");
  });

  it("plans selective seed by profile and scenario", () => {
    const plan = planSeedHub({ profile: "minimal", scenario: ["core"] });
    expect(plan.assets).toContain("requirements-template@1.0.0");
    expect(plan.assets).toContain("coding-conventions@1.0.0");
    expect(plan.assets.every((a) => !a.startsWith("api-service@"))).toBe(true);
  });

  it("adds scenario assets for api", () => {
    const plan = planSeedHub({ profile: "standard", scenario: ["api"] });
    expect(plan.assets).toContain("idempotency-keys@1.0.0");
    expect(plan.assets).toContain("api-conventions@1.0.0");
    expect(plan.assets.every((a) => !a.startsWith("api-service@"))).toBe(true);
  });

  it("filters assets with --with rubrics", () => {
    const plan = planSeedHub({ profile: "standard", scenario: ["core"], with: ["rubrics"] });
    expect(plan.assets).toContain("common-review-rubrics@1.0.0");
    expect(plan.assets).not.toContain("requirements-template@1.0.0");
    expect(plan.skipped).toContain("requirements-template@1.0.0");
  });

  it("seeds selective assets to target hub", () => {
    const target = tmp();
    const result = seedHub(target, { profile: "minimal", scenario: ["core"], goldenDir: BUILTIN_HUB_GOLDEN_DIR });
    expect(result.seeded.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(target, "packages/guide/template/requirements-template/1.0.0/asset.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(target, "hub-policy.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(target, "bundles"))).toBe(false);
    expect(fs.existsSync(path.join(target, "blueprints"))).toBe(false);
  });

  it("full seed copies packages and evals without bundles/blueprints", () => {
    const target = tmp();
    const result = seedHub(target, { full: true, goldenDir: BUILTIN_HUB_GOLDEN_DIR });
    expect(fs.existsSync(path.join(target, "packages/guide/skill/coding-conventions/1.0.0"))).toBe(true);
    expect(fs.existsSync(path.join(target, "bundles"))).toBe(false);
    expect(fs.existsSync(path.join(target, "blueprints"))).toBe(false);
    expect(result.seeded.length).toBeGreaterThan(20);
  });
});
