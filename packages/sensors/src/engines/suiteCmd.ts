import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gitChangedFiles, relatedTests } from "@harnessx/core";
import type { SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "../types.js";
import { cfg } from "./helpers.js";

function packageScripts(root: string): Record<string, string> {
  const pkg = path.join(root, "package.json");
  if (!fs.existsSync(pkg)) return {};
  try {
    return (JSON.parse(fs.readFileSync(pkg, "utf8")).scripts ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

function runCmd(ctx: SensorContext, cmd: string, args: string[], summaryOk: string): SensorReport {
  const res = spawnSync(cmd, args, { cwd: ctx.ws.root, encoding: "utf8", timeout: ctx.def.timeout_ms ?? 120000 });
  if (res.error) {
    return {
      sensor: ctx.def.id,
      status: "error",
      summary: `spawn failed: ${res.error.message}`,
      findings: [{ severity: "block", message: res.error.message }]
    };
  }
  if (res.status === 0) {
    return { sensor: ctx.def.id, status: "pass", summary: summaryOk, findings: [] };
  }
  const out = (res.stderr || res.stdout || "").slice(0, 2000);
  return {
    sensor: ctx.def.id,
    status: "fail",
    summary: `${cmd} exited ${res.status}`,
    findings: [{ severity: "block", message: out }],
    fix_hint: ctx.def.fix_hint,
    fix_command: ctx.change ? `hx fix --change ${ctx.change} --sensor ${ctx.def.id}` : undefined
  };
}

/**
 * Configurable command suite: typecheck / lint / unit-changed style.
 * config.preset: typecheck | lint | unit-changed | custom
 * config.command + config.args for custom
 */
export const suiteCmdEngine = (ctx: SensorContext): SensorReport => {
  const c = cfg(ctx);
  const preset = String(c.preset ?? ctx.def.id ?? "custom");
  const scripts = packageScripts(ctx.ws.root);

  if (typeof c.command === "string") {
    const args = (c.args as string[] | undefined) ?? [];
    return runCmd(ctx, c.command, args, String(c.ok_summary ?? "command passed"));
  }

  if (preset === "typecheck" || ctx.def.id === "typecheck") {
    if (scripts.typecheck) return runCmd(ctx, "npm", ["run", "typecheck"], "typecheck passed");
    if (fs.existsSync(path.join(ctx.ws.root, "tsconfig.json"))) {
      return runCmd(ctx, "npx", ["tsc", "--noEmit"], "tsc --noEmit passed");
    }
    return { sensor: ctx.def.id, status: "pass", summary: "skipped — no TypeScript tooling configured", findings: [] };
  }

  if (preset === "lint" || ctx.def.id === "lint") {
    if (scripts.lint) return runCmd(ctx, "npm", ["run", "lint"], "lint passed");
    if (fs.existsSync(path.join(ctx.ws.root, "eslint.config.js")) || fs.existsSync(path.join(ctx.ws.root, ".eslintrc.cjs"))) {
      return runCmd(ctx, "npx", ["eslint", "."], "eslint passed");
    }
    return { sensor: ctx.def.id, status: "pass", summary: "skipped — no lint tooling configured", findings: [] };
  }

  if (preset === "unit-changed" || ctx.def.id === "unit-changed") {
    const changed = ctx.changedFiles ?? gitChangedFiles(ctx.ws.root);
    const tests = relatedTests(ctx.ws.root, changed);
    if (tests.length === 0) {
      return { sensor: ctx.def.id, status: "pass", summary: "no related tests for current diff", findings: [] };
    }
    const vitest = path.join(ctx.ws.root, "node_modules", ".bin", "vitest");
    if (fs.existsSync(vitest)) {
      return runCmd(ctx, vitest, ["run", ...tests], `ran ${tests.length} related test file(s)`);
    }
    if (scripts.test) return runCmd(ctx, "npm", ["run", "test"], "npm test passed");
    return { sensor: ctx.def.id, status: "pass", summary: "skipped — no test runner configured", findings: [] };
  }

  return {
    sensor: ctx.def.id,
    status: "error",
    summary: `suite-cmd unknown preset "${preset}" and no command configured`,
    findings: [{ severity: "block", message: "configure config.preset or config.command" }]
  };
};
