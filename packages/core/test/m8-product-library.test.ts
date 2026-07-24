import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  createChange,
  scaffoldDesign,
  seedGoldenHub,
  listGoldenHubPackages,
  hubAdd,
  hubReviewStatus,
  runSuite
} from "@harnessx/core";
import { builtinSensors, analyzeTestStrength, mutationProbe, sensorEngines } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m8-"));
const opts = () => ({ builtins: builtinSensors, engines: sensorEngines });

describe("design-template on English base scaffold", () => {
  it("registers design-template and hx design renders the full template", () => {
    const ws = initWorkspace(tmp()).ws;
    expect(ws.readHarness().guides.map((g) => g.id)).toContain("design-template");
    createChange(ws, "bulk-coupon", ["coupons"]);
    const f = scaffoldDesign(ws, "bulk-coupon");
    const body = fs.readFileSync(f, "utf8");
    expect(body).toContain("## API Surface");
    expect(body).toContain("## Rollback Plan");
    expect(body).not.toContain("{{change}}");
  });
});

describe("fast suite builtins", () => {
  it("typecheck runs on harnessx monorepo layout", async () => {
    const ws = initWorkspace(tmp()).ws;
    fs.writeFileSync(
      path.join(ws.root, "package.json"),
      JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })
    );
    const report = await builtinSensors.typecheck({ ws, def: { id: "typecheck", timeout_ms: 5000 } as never });
    expect(report.status).toBe("pass");
  });

  it("skips lint when no tooling is configured", async () => {
    const ws = initWorkspace(tmp()).ws;
    const report = await builtinSensors.lint({ ws, def: { id: "lint" } as never });
    expect(report.status).toBe("pass");
    expect(report.summary).toMatch(/skipped/);
  });
});

describe("mutation-probe sensor", () => {
  it("flags tautological and stub tests", () => {
    expect(analyzeTestStrength('it("x", () => { expect(true).toBe(true); });').join()).toContain("tautological");
    expect(
      analyzeTestStrength('throw new Error("not implemented — write assertions before implementation (FR-026)");').join()
    ).toContain("stub");
  });

  it("passes on meaningful scenario tests", async () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    fs.mkdirSync(path.join(ws.deltaSpecsDir("c1"), "auth"), { recursive: true });
    fs.writeFileSync(
      path.join(ws.deltaSpecsDir("c1"), "auth/spec.md"),
      "## ADDED Requirements\n\n### Requirement: Login\nWHEN user submits credentials, THE SYSTEM SHALL authenticate.\n\n#### Scenario: valid login\n- THEN 200\n"
    );
    fs.mkdirSync(path.join(ws.root, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(ws.root, "tests/auth.test.ts"),
      'it("Scenario: valid login", () => { expect(login()).toEqual({ status: 200 }); });\n'
    );
    const report = await mutationProbe({ ws, change: "c1", def: { id: "mutation-probe" } as never });
    expect(report.status).toBe("pass");
  });
});

describe("hub golden catalog", () => {
  it("lists and seeds pre-approved golden packages", () => {
    const pkgs = listGoldenHubPackages();
    expect(pkgs.map((p) => p.id)).toEqual(expect.arrayContaining(["api-conventions", "common-review-rubrics"]));

    const hubRoot = path.join(tmp(), "org-hub");
    const seeded = seedGoldenHub(hubRoot);
    expect(seeded.length).toBeGreaterThanOrEqual(2);
    expect(hubReviewStatus(hubRoot, "api-conventions", "1.0.0")).toBe("approved");

    const ws = initWorkspace(tmp()).ws;
    const { asset } = hubAdd(ws, hubRoot, { id: "api-conventions", version: "1.0.0" });
    expect(asset.manifest.id).toBe("api-conventions");
    expect(fs.existsSync(path.join(ws.base, ".hub-cache/api-conventions/SKILL.md"))).toBe(true);
  });
});

describe("strict verification suite wiring", () => {
  it("includes mutation-probe in verification-strict", async () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    fs.mkdirSync(path.join(ws.deltaSpecsDir("c1"), "auth"), { recursive: true });
    fs.writeFileSync(
      path.join(ws.deltaSpecsDir("c1"), "auth/spec.md"),
      "## ADDED Requirements\n\n### Requirement: R1\nTHE SYSTEM SHALL r1.\n\n#### Scenario: s1\n- THEN ok\n"
    );
    fs.mkdirSync(path.join(ws.root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(ws.root, "tests/r1.test.ts"), 'it("Scenario: s1", () => { expect(1).toBe(1); });\n');

    const harness = ws.readHarness();
    expect(harness.suites["verification-strict"]).toContain("mutation-probe");
    const res = await runSuite(ws, harness, "verification-strict", "c1", opts());
    expect(res.reports.find((r) => r.sensor === "mutation-probe")?.status).toBe("fail");
  });
});
