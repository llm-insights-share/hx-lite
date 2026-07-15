import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  initWorkspace,
  seedGoldenHub,
  createProject,
  resolveProfileAssets,
  expandHarnessImports,
  resolveHarnessGuideDef,
  callMcpTool,
  MCP_TOOLS,
  buildApplyTaskEnv,
  createChange,
  generateTasks,
  scaffoldProposal,
  orchestration,
  hub as hubBoundary,
  type HarnessYaml
} from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-m12-"));
const opts = () => ({ builtins: builtinSensors });

describe("arch review Top 5", () => {
  it("createProject installs profile-resolved hub guides into harness.yaml", () => {
    const root = tmp();
    const hub = path.join(root, "hub");
    seedGoldenHub(hub);
    const { ws, resolution } = createProject(root, { profile: "standard", hubRoot: hub });

    expect(resolution.assets.length).toBeGreaterThan(0);
    expect(resolution.assets.some((a) => a.id === "coding-conventions")).toBe(true);
    const harness = ws.readHarness();
    expect(harness.guides.map((g) => g.id)).toContain("coding-conventions");
    expect(resolveHarnessGuideDef(ws, "coding-conventions", { hubRoot: hub })?.source).toContain("coding-conventions");
  });

  it("expandHarnessImports is a no-op after bundle removal", () => {
    const { ws } = initWorkspace(tmp());
    const raw: HarnessYaml = {
      version: "1.0",
      profiles: { lite: { stages: ["dev"], dev_tasks: ["apply"], suites: {} } },
      suites: {},
      guides: [],
      sensors: [],
      dependencies: [],
      overrides: []
    };
    const once = expandHarnessImports(raw, ws);
    expect(once).toBe(raw);
    expect(once.guides).toEqual([]);
  });

  it("resolveProfileAssets returns stage-scoped packages from golden hub", () => {
    const hub = path.join(tmp(), "hub");
    seedGoldenHub(hub);
    const standard = resolveProfileAssets(hub, "standard");
    expect(standard.stages).toContain("req");
    expect(standard.assets.some((a) => a.id === "test-cases-template")).toBe(true);
  });

  it("MCP exposes apply_task, fix_session, drift_check", async () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toContain("apply_task");
    expect(names).toContain("fix_session");
    expect(names).toContain("drift_check");

    const { ws } = initWorkspace(tmp());
    createChange(ws, "mcp-top5", ["auth"]);
    scaffoldProposal(ws, "mcp-top5", "Auth");
    generateTasks(ws, "mcp-top5");

    const taskRes = (await callMcpTool(ws, "apply_task", { change: "mcp-top5", task: "01b" }, opts())) as {
      env: { HX_TASK_ID: string; HX_TASK_PACK: string };
      contractSchema: string;
    };
    expect(taskRes.env.HX_TASK_ID).toBe("01b");
    expect(taskRes.env.HX_TASK_PACK).toContain("01b-pack.md");
    expect(taskRes.contractSchema).toContain("agent-env-contract");

    const fixRes = (await callMcpTool(ws, "fix_session", { change: "mcp-top5", sensor: "spec-validate" }, opts())) as {
      packFile: string;
      env: { HX_FIX_PACK: string };
    };
    expect(fixRes.packFile).toContain("fix-pack.md");
    expect(fixRes.env.HX_FIX_PACK).toBe(fixRes.packFile);

    const drift = (await callMcpTool(ws, "drift_check", { change: "mcp-top5" }, opts())) as { sensor: string };
    expect(drift.sensor).toBe("drift");
  });

  it("L1 env contract builder matches apply runner shape", () => {
    const env = buildApplyTaskEnv("chg", { id: "01b", track: "impl", requirement: "R1", capability: "auth", title: "Do it", done: false }, "/tmp/pack.md", ["fix lint"]);
    expect(env.HX_CHANGE).toBe("chg");
    expect(env.HX_FIX_HINTS).toBe("fix lint");
    expect(orchestration.buildApplyTaskEnv).toBeDefined();
    expect(hubBoundary.expandHarnessImports).toBeDefined();
  });
});
