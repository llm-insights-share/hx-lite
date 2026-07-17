import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  hubAdd,
  landHubAssets,
  syncProjectFromHub,
  writeYaml,
  loadAssetDir,
  isProjectAssetPath,
  pullProjectAssets
} from "@harnessx/core";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-project-hub-"));

function makeAsset(dir: string, id: string, over: Record<string, unknown> = {}, content = `# Skill: ${id}\n\n- base\n`) {
  fs.mkdirSync(dir, { recursive: true });
  writeYaml(path.join(dir, "asset.yaml"), {
    id,
    kind: "guide.skill",
    version: "1.0.0",
    status: "enforced",
    origin: "hub",
    stage: "dev",
    task: "apply",
    ...over
  });
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
}

describe("project hub sync land", () => {
  it("landHubAssets copies cache into assets and upserts harness deps/guides", () => {
    const root = tmp();
    const ws = initWorkspace(root).ws;
    const hub = path.join(root, "hub");
    makeAsset(path.join(hub, "packages/guide/skill/pkg-a/1.0.0"), "pkg-a");
    hubAdd(ws, hub, { id: "pkg-a", version: "1.0.0" });

    const { landed } = landHubAssets(ws, hub);
    expect(landed.map((l) => l.id)).toContain("pkg-a");
    expect(fs.existsSync(path.join(ws.assetsDir, "guides/pkg-a/SKILL.md"))).toBe(true);

    const harness = ws.readHarness();
    expect(harness.dependencies.some((d) => d.startsWith("pkg-a@"))).toBe(true);
    expect(harness.guides.some((g) => g.id === "pkg-a")).toBe(true);

    makeAsset(path.join(hub, "packages/guide/skill/pkg-a/1.1.0"), "pkg-a", { version: "1.1.0" }, "# Skill: pkg-a\n\n- v1.1\n");
    hubAdd(ws, hub, { id: "pkg-a", version: "1.1.0" });
    landHubAssets(ws, hub);
    const harness2 = ws.readHarness();
    expect(harness2.dependencies.filter((d) => d.startsWith("pkg-a@"))).toEqual(["pkg-a@1.1.0"]);
    expect(fs.readFileSync(path.join(ws.assetsDir, "guides/pkg-a/SKILL.md"), "utf8")).toContain("v1.1");
  });


  it("landHubAssets auto-binds task sensors into suites", () => {
    const root = tmp();
    const ws = initWorkspace(root, { profile: "lite" }).ws;
    const hub = path.join(root, "hub");
    fs.mkdirSync(path.join(hub, "packages/sensor/script/s-fast/1.0.0"), { recursive: true });
    writeYaml(path.join(hub, "packages/sensor/script/s-fast/1.0.0/asset.yaml"), {
      id: "s-fast",
      kind: "sensor.script",
      version: "1.0.0",
      status: "enforced",
      origin: "hub",
      stage: "dev",
      task: "apply"
    });
    fs.writeFileSync(path.join(hub, "packages/sensor/script/s-fast/1.0.0/check.sh"), "exit 0\n");
    hubAdd(ws, hub, { id: "s-fast", version: "1.0.0" });

    landHubAssets(ws, hub, { profile: "lite" });
    const harness = ws.readHarness();
    expect(harness.sensors.some((x) => x.id === "s-fast")).toBe(true);
    // Named suite only — never create top-level suites["dev.apply"]
    expect(harness.suites["dev.apply"]).toBeUndefined();
    expect(harness.profiles.lite?.suites?.["dev.apply"]).toBe("fast-lite");
    expect(harness.suites["fast-lite"]).toContain("s-fast");
    expect(harness.profiles.lite?.tasks?.dev?.find((t) => t.id === "apply")?.suite).toBe("fast-lite");
  });

  it("syncProjectFromHub updates assets after hub version bump", () => {
    const root = tmp();
    const ws = initWorkspace(root, { profile: "lite" }).ws;
    const hub = path.join(root, "hub");
    makeAsset(path.join(hub, "packages/guide/skill/pkg-b/1.0.0"), "pkg-b");
    hubAdd(ws, hub, { id: "pkg-b", version: "1.0.0" });
    landHubAssets(ws, hub);

    makeAsset(path.join(hub, "packages/guide/skill/pkg-b/1.1.0"), "pkg-b", { version: "1.1.0" }, "# Skill: pkg-b\n\n- updated\n");
    const res = syncProjectFromHub(ws, hub, { apply: true });
    expect(res.landed.find((l) => l.id === "pkg-b")?.version).toBe("1.1.0");
    expect(loadAssetDir(path.join(ws.assetsDir, "guides/pkg-b"), "local")!.manifest.version).toBe("1.1.0");
    expect(res.lock?.assets["pkg-b"]?.version).toBe("1.1.0");
  });
});

describe("project pull assets", () => {
  it("isProjectAssetPath allowlists harness assets only", () => {
    expect(isProjectAssetPath("harnessX/assets/guides/a/SKILL.md")).toBe(true);
    expect(isProjectAssetPath("harnessX/harness.yaml")).toBe(true);
    expect(isProjectAssetPath("harnessX/harness.lock")).toBe(true);
    expect(isProjectAssetPath("harnessX/.hub-cache/a/SKILL.md")).toBe(true);
    expect(isProjectAssetPath("harnessX/changes/c1/tasks.md")).toBe(false);
    expect(isProjectAssetPath("docs/prd/x.md")).toBe(false);
    expect(isProjectAssetPath("src/app.ts")).toBe(false);
  });

  it("pullProjectAssets check lists incoming allowlisted paths via gitExec", () => {
    const root = tmp();
    const calls: string[][] = [];
    const gitExec = (args: string[]) => {
      calls.push(args);
      if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "remote") return { status: 0, stdout: "https://example.com/proj.git\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { status: 0, stdout: "main\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { status: 0, stdout: "abc\n", stderr: "" };
      if (args[0] === "diff") {
        return {
          status: 0,
          stdout:
            [
              "M\tharnessX/assets/guides/x/SKILL.md",
              "D\tharnessX/assets/guides/design-template/examples/bulk-issue-coupon-design.md",
              "A\tharnessX/changes/c1/meta.yaml",
              "M\tsrc/app.ts"
            ].join("\n") + "\n",
          stderr: ""
        };
      }
      if (args[0] === "status") return { status: 0, stdout: "", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };

    const res = pullProjectAssets(root, { check: true, gitExec });
    expect(res.incoming).toEqual([
      "harnessX/assets/guides/design-template/examples/bulk-issue-coupon-design.md",
      "harnessX/assets/guides/x/SKILL.md"
    ]);
    expect(calls.some((c) => c[0] === "fetch")).toBe(true);
  });

  it("pullProjectAssets applies updates and removes remote-deleted assets", () => {
    const root = tmp();
    const calls: string[][] = [];
    const gitExec = (args: string[]) => {
      calls.push([...args]);
      if (args[0] === "fetch") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "remote") return { status: 0, stdout: "https://example.com/proj.git\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { status: 0, stdout: "main\n", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { status: 0, stdout: "abc\n", stderr: "" };
      if (args[0] === "diff") {
        return {
          status: 0,
          stdout:
            [
              "M\tharnessX/assets/guides/x/SKILL.md",
              "D\tharnessX/assets/guides/old.md"
            ].join("\n") + "\n",
          stderr: ""
        };
      }
      if (args[0] === "status") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "checkout") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "rm") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "show") return { status: 1, stdout: "", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };

    const res = pullProjectAssets(root, { gitExec });
    expect(res.updated).toEqual(["harnessX/assets/guides/x/SKILL.md"]);
    expect(res.removed).toEqual(["harnessX/assets/guides/old.md"]);
    expect(calls.some((c) => c[0] === "checkout" && c.includes("harnessX/assets/guides/x/SKILL.md"))).toBe(true);
    expect(calls.some((c) => c[0] === "checkout" && c.includes("harnessX/assets/guides/old.md"))).toBe(false);
    expect(calls.some((c) => c[0] === "rm" && c.includes("harnessX/assets/guides/old.md"))).toBe(true);
  });
});
