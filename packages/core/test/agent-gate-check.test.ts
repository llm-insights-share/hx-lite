import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initWorkspace, createChange, writeYaml, agentGateCheck, gateStopHookResponse } from "@harnessx/core";
import { builtinSensors } from "@harnessx/sensors";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hx-gate-stop-"));
const opts = (root: string) => ({ builtins: builtinSensors, changedFiles: [] as string[] });

describe("agent gate check + stop hook", () => {
  it("agentGateCheck returns machine-readable blockers/fixHints", async () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c1", ["auth"]);
    const harness = ws.readHarness();
    harness.sensors.push({
      id: "always-fail",
      kind: "sensor.script",
      execution: "computational",
      trigger: "task",
      run: "echo fail >&2; exit 1",
      on_fail: "block",
      max_retries: 0,
      timeout_ms: 5000,
      stage: "dev",
      task: "apply",
      fix_hint: "fix it"
    });
    harness.suites.fast = [...(harness.suites.fast ?? []), "always-fail"];
    writeYaml(ws.harnessFile, harness);

    const res = await agentGateCheck(ws, opts(ws.root), { change: "c1", stage: "dev", task: "apply" });
    expect(res.passed).toBe(false);
    expect(res.blockers.some((b) => b.includes("always-fail"))).toBe(true);
    expect(res.fixHints.some((h) => h.includes("fix it"))).toBe(true);
  });

  it("gateStopHookResponse emits followup and respects loop limit", async () => {
    const ws = initWorkspace(tmp()).ws;
    createChange(ws, "c2", ["auth"]);
    fs.mkdirSync(path.join(ws.base, ".runtime"), { recursive: true });
    fs.writeFileSync(
      path.join(ws.base, ".runtime", "agent-session.json"),
      JSON.stringify({ slash: true, change: "c2", stage: "dev", task: "apply", at: new Date().toISOString() })
    );

    const harness = ws.readHarness();
    harness.sensors.push({
      id: "always-fail-2",
      kind: "sensor.script",
      execution: "computational",
      trigger: "task",
      run: "echo fail >&2; exit 1",
      on_fail: "block",
      max_retries: 0,
      timeout_ms: 5000,
      stage: "dev",
      task: "apply",
      fix_hint: "fix it 2"
    });
    harness.suites.fast = [...(harness.suites.fast ?? []), "always-fail-2"];
    writeYaml(ws.harnessFile, harness);

    const out = await gateStopHookResponse(ws, opts(ws.root), { status: "completed", loop_count: 0 }, 3);
    expect(out.followup_message).toContain("GATE BLOCKED");

    const outAtLimit = await gateStopHookResponse(ws, opts(ws.root), { status: "completed", loop_count: 3 }, 3);
    expect(outAtLimit.followup_message).toContain("automatic iteration limit reached");
  });
});
