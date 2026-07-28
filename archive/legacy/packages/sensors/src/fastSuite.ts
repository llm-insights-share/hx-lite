import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gitChangedFiles, relatedTests } from "@harnessx/core";
import type { Finding, SensorReport } from "@harnessx/core/schemas.js";
import type { SensorContext } from "./types.js";

function packageScripts(root: string): Record<string, string> {
  const pkg = path.join(root, "package.json");
  if (!fs.existsSync(pkg)) return {};
  try {
    return (JSON.parse(fs.readFileSync(pkg, "utf8")).scripts ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

function runCmd(
  ctx: SensorContext,
  cmd: string,
  args: string[],
  summaryOk: string
): SensorReport {
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

/** Runs `npm run <script>` when declared in package.json. */
export const typecheck = (ctx: SensorContext): SensorReport => {
  const scripts = packageScripts(ctx.ws.root);
  if (scripts.typecheck) return runCmd(ctx, "npm", ["run", "typecheck"], "typecheck passed");
  if (fs.existsSync(path.join(ctx.ws.root, "tsconfig.json"))) {
    return runCmd(ctx, "npx", ["tsc", "--noEmit"], "tsc --noEmit passed");
  }
  return { sensor: ctx.def.id, status: "pass", summary: "skipped — no TypeScript tooling configured", findings: [] };
};

export const lint = (ctx: SensorContext): SensorReport => {
  const scripts = packageScripts(ctx.ws.root);
  if (scripts.lint) return runCmd(ctx, "npm", ["run", "lint"], "lint passed");
  if (fs.existsSync(path.join(ctx.ws.root, "eslint.config.js")) || fs.existsSync(path.join(ctx.ws.root, ".eslintrc.cjs"))) {
    return runCmd(ctx, "npx", ["eslint", "."], "eslint passed");
  }
  return { sensor: ctx.def.id, status: "pass", summary: "skipped — no lint tooling configured", findings: [] };
};

/** T-205: run tests transitively affected by the current diff (NFR-001). */
export const unitChanged = (ctx: SensorContext): SensorReport => {
  const changed = ctx.changedFiles ?? gitChangedFiles(ctx.ws.root);
  const tests = relatedTests(ctx.ws.root, changed);
  if (tests.length === 0) {
    return { sensor: ctx.def.id, status: "pass", summary: "no related tests for current diff", findings: [] };
  }

  const scripts = packageScripts(ctx.ws.root);
  const vitest = path.join(ctx.ws.root, "node_modules", ".bin", "vitest");
  if (fs.existsSync(vitest)) {
    return runCmd(ctx, vitest, ["run", ...tests], `ran ${tests.length} related test file(s)`);
  }
  if (scripts.test) return runCmd(ctx, "npm", ["run", "test"], "npm test passed");
  return { sensor: ctx.def.id, status: "pass", summary: "skipped — no test runner configured", findings: [] };
};
