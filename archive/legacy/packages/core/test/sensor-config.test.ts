import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  Workspace,
  resolveSensorConfig,
  resolveCheckKind,
  buildShellSensorEnv,
  deepMergeConfig,
  sensorDefFromHubAsset,
  runSensor
} from "../src/index.js";
import { builtinSensors, sensorEngines, earsDeltaEngine } from "@harnessx/sensors";
import { tmpdir } from "node:os";

function tmpWs(): Workspace {
  const root = fs.mkdtempSync(path.join(tmpdir(), "hx-sensor-cfg-"));
  fs.mkdirSync(path.join(root, "harnessX"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harnessX", "harness.yaml"),
    "version: '1.0'\nprofiles: {}\nsuites: {}\nguides: []\nsensors: []\n"
  );
  fs.writeFileSync(path.join(root, "harnessX", "config.yaml"), "profile: standard\nlocale: en\n");
  return Workspace.locate(root);
}

describe("sensor config resolve", () => {
  it("deepMergeConfig prefers override", () => {
    const m = deepMergeConfig({ a: 1, nested: { x: 1, y: 2 } }, { nested: { y: 9 }, b: 3 });
    expect(m).toEqual({ a: 1, nested: { x: 1, y: 9 }, b: 3 });
  });

  it("resolveCheckKind from fields", () => {
    expect(resolveCheckKind({ check: "shell", expr: "x" } as never)).toBe("shell");
    expect(resolveCheckKind({ expr: "approval.prd == true" } as never)).toBe("inline");
    expect(resolveCheckKind({ rules_text: "be testable" } as never)).toBe("rules");
    expect(resolveCheckKind({ run: "npm test" } as never)).toBe("shell");
  });

  it("loads source/config.yaml and merges inline config", () => {
    const ws = tmpWs();
    const pack = path.join(ws.base, "assets", "sensors", "spec-validate");
    fs.mkdirSync(pack, { recursive: true });
    fs.writeFileSync(
      path.join(pack, "config.yaml"),
      "check: inline\nexpr: \"spec.ears_ok == true\"\nears:\n  require_shall: true\n  vague_words: [foo]\n"
    );
    const resolved = resolveSensorConfig(ws, {
      id: "spec-validate",
      kind: "sensor.script",
      execution: "computational",
      trigger: "task",
      source: "assets/sensors/spec-validate",
      check: "inline",
      expr: "spec.ears_ok == true",
      config: { ears: { vague_words: ["bar"] } },
      on_fail: "block",
      max_retries: 0,
      timeout_ms: 120000
    });
    expect(resolved.check).toBe("inline");
    expect(resolved.expr).toContain("spec.ears_ok");
    expect((resolved.config.ears as { vague_words: string[] }).vague_words).toEqual(["bar"]);
  });

  it("buildShellSensorEnv sets HX_OUTPUT and aliases", () => {
    const ws = tmpWs();
    const change = "c-out";
    fs.mkdirSync(ws.changeDir(change), { recursive: true });
    const env = buildShellSensorEnv(
      ws,
      {
        id: "secscan",
        kind: "sensor.script",
        execution: "computational",
        trigger: "task",
        check: "shell",
        run: "true",
        output: "changes/$CHANGE",
        on_fail: "block",
        max_retries: 0,
        timeout_ms: 5000
      },
      change,
      { profile: "standard", changedFiles: ["a.ts"] }
    );
    expect(env.HX_CHANGE).toBe(change);
    expect(env.HX_ROOT).toBe(ws.root);
    expect(env.HX_BASE).toBe(ws.base);
    expect(env.HX_SENSOR_ID).toBe("secscan");
    expect(env.HX_OUTPUT).toContain(change);
    expect(env.OUTPUT).toBe(env.HX_OUTPUT);
    expect(env.HX_SCOPE).toContain("a.ts");
    expect(env.HX_PROFILE).toBe("standard");
  });

  it("sensorDefFromHubAsset detects shell check.sh", () => {
    const ws = tmpWs();
    const pack = path.join(ws.base, "assets", "sensors", "my-shell");
    fs.mkdirSync(pack, { recursive: true });
    fs.writeFileSync(path.join(pack, "check.sh"), "#!/bin/bash\nexit 0\n");
    const def = sensorDefFromHubAsset(ws, pack, {
      id: "my-shell",
      kind: "sensor.script",
      stage: "dev",
      execution: "computational"
    });
    expect(def.check).toBe("shell");
    expect(def.run).toContain("check.sh");
  });

  it("sensorDefFromHubAsset detects rules.md as check:rules", () => {
    const ws = tmpWs();
    const pack = path.join(ws.base, "assets", "sensors", "ai-r");
    fs.mkdirSync(pack, { recursive: true });
    fs.writeFileSync(path.join(pack, "rules.md"), "Be testable. No vague words.\n");
    const def = sensorDefFromHubAsset(ws, pack, {
      id: "ai-r",
      kind: "sensor.rubric",
      stage: "dev",
      execution: "inferential"
    });
    expect(def.check).toBe("rules");
    expect(def.rules_file).toContain("rules.md");
  });

  it("ears-delta engine honors vague_words from config", async () => {
    const ws = tmpWs();
    const change = "c1";
    const specDir = path.join(ws.deltaSpecsDir(change), "cap");
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, "spec.md"),
      `## ADDED Requirements\n\n### Requirement: Fast UI\nTHE SYSTEM SHALL render quickly.\n\n#### Scenario: ok\n- GIVEN a\n- WHEN b\n- THEN c\n`
    );
    const report = earsDeltaEngine({
      ws,
      change,
      def: {
        id: "spec-validate",
        kind: "sensor.script",
        execution: "computational",
        trigger: "task",
        on_fail: "block",
        max_retries: 0,
        timeout_ms: 5000
      },
      config: { ears: { vague_words: ["quickly"] } }
    });
    expect(report.status).toBe("fail");
    expect(report.findings.some((f) => /quickly|unmeasurable/i.test(f.message))).toBe(true);
  });

  it("runSensor dispatches inline check via expr → ears", async () => {
    const ws = tmpWs();
    const change = "c1";
    const specDir = path.join(ws.deltaSpecsDir(change), "cap");
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, "spec.md"),
      `## ADDED Requirements\n\n### Requirement: Login\nWHEN user submits credentials, THE SYSTEM SHALL authenticate within 2 seconds.\n\n#### Scenario: ok\n- GIVEN a\n- WHEN b\n- THEN c\n`
    );
    const report = await runSensor(
      ws,
      {
        id: "spec-validate",
        kind: "sensor.script",
        execution: "computational",
        trigger: "task",
        check: "inline",
        expr: "spec.ears_ok == true",
        on_fail: "block",
        max_retries: 0,
        timeout_ms: 5000
      },
      change,
      { builtins: builtinSensors, engines: sensorEngines }
    );
    expect(report.status).toBe("pass");
  });

  it("runSensor handler.* dispatches to registered TS handler", async () => {
    const ws = tmpWs();
    const report = await runSensor(
      ws,
      {
        id: "spec-trace",
        kind: "sensor.script",
        execution: "computational",
        trigger: "task",
        check: "inline",
        expr: "handler.spec-trace",
        on_fail: "block",
        max_retries: 0,
        timeout_ms: 5000
      },
      "c-h",
      { builtins: builtinSensors, engines: sensorEngines }
    );
    // may fail on missing change artifacts, but must not be "handler not registered"
    expect(report.summary).not.toMatch(/not registered/);
    expect(["pass", "fail", "error"]).toContain(report.status);
  });

  it("runSensor shell injects env and expands $OUTPUT", async () => {
    const ws = tmpWs();
    const change = "c-shell";
    const changeDir = ws.changeDir(change);
    fs.mkdirSync(changeDir, { recursive: true });
    const script = path.join(ws.base, "assets", "sensors", "echo-env", "check.sh");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(
      script,
      `#!/usr/bin/env bash
set -euo pipefail
test -n "\${HX_CHANGE:-}"
test -n "\${HX_OUTPUT:-}"
test "\${HX_SENSOR_ID}" = "echo-env"
echo '{"status":"pass","summary":"env-ok","findings":[]}'
`
    );
    fs.chmodSync(script, 0o755);
    const report = await runSensor(
      ws,
      {
        id: "echo-env",
        kind: "sensor.script",
        execution: "computational",
        trigger: "task",
        check: "shell",
        run: `bash ${path.relative(ws.root, script).replace(/\\/g, "/")}`,
        output: "changes/$CHANGE",
        on_fail: "block",
        max_retries: 0,
        timeout_ms: 10000
      },
      change,
      { builtins: builtinSensors, engines: sensorEngines }
    );
    expect(report.status).toBe("pass");
    expect(report.summary).toMatch(/env-ok|ok/);
  });

  it("runSensor rules_text + heuristic judge flags vague wording", async () => {
    const ws = tmpWs();
    const change = "c-rules";
    const changeDir = ws.changeDir(change);
    fs.mkdirSync(path.join(changeDir, "specs", "cap"), { recursive: true });
    fs.writeFileSync(path.join(changeDir, "proposal.md"), "We will ship quickly and seamlessly.\n");
    fs.writeFileSync(
      path.join(changeDir, "specs", "cap", "spec.md"),
      "## ADDED Requirements\n\n### Requirement: X\nWHEN a, THE SYSTEM SHALL do y.\n\n#### Scenario: s\n- GIVEN a\n- WHEN b\n- THEN c\n"
    );
    const report = await runSensor(
      ws,
      {
        id: "ai-spec-review",
        kind: "sensor.rubric",
        execution: "inferential",
        trigger: "task",
        check: "rules",
        rules_text: "禁止模糊词；变更必须可测试",
        input: ["proposal.md", "specs/**/spec.md"],
        on_fail: "warn",
        max_retries: 0,
        timeout_ms: 5000,
        budget_tokens: 2000
      },
      change,
      { builtins: builtinSensors, engines: sensorEngines }
    );
    expect(report.findings.some((f) => /quickly|seamless|模糊|vague|matched/i.test(f.message))).toBe(true);
  });

  it("rules.list_ok flags TODO in matched files", async () => {
    const ws = tmpWs();
    const prd = path.join(ws.root, "docs", "prd");
    fs.mkdirSync(prd, { recursive: true });
    fs.writeFileSync(path.join(prd, "x.md"), "# PRD\nTODO: fill this\n");
    const pack = path.join(ws.base, "assets", "sensors", "todo-rule");
    fs.mkdirSync(pack, { recursive: true });
    fs.writeFileSync(
      path.join(pack, "rules.yaml"),
      `rules:\n  - id: no-todo\n    when:\n      files: ["docs/prd/**/*.md"]\n    assert:\n      not_match: "(?i)\\\\bTODO\\\\b"\n    severity: warn\n    message: "has TODO"\n`
    );
    const report = await runSensor(
      ws,
      {
        id: "todo-rule",
        kind: "sensor.rule",
        execution: "computational",
        trigger: "task",
        check: "inline",
        expr: "rules.list_ok",
        source: "assets/sensors/todo-rule",
        on_fail: "warn",
        max_retries: 0,
        timeout_ms: 5000
      },
      undefined,
      { builtins: builtinSensors, engines: sensorEngines }
    );
    expect(report.findings.some((f) => f.rule === "no-todo" || /TODO/i.test(f.message))).toBe(true);
  });
});
