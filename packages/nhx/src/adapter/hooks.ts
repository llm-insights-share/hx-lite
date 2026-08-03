import fs from "node:fs";
import path from "node:path";
import { GENERATED_MARKER } from "../config.js";

/** Marker used in hooks.json / scripts; recognize both legacy and new names. */
const NHX_HOOK_MARKER = "nhx check";

const SESSION_AND_BEFORE_HOOK = `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-session + beforeSubmit checks
import { spawnSync } from "node:child_process";

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function runNhx(args) {
  let r = spawnSync("nhx", args, { encoding: "utf8" });
  if (r.error || r.status == null) {
    r = spawnSync("npx", ["tsx", "packages/nhx/src/index.ts", ...args], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  }
  return r;
}

const raw = await readStdin();
let prompt = raw;
try {
  const j = JSON.parse(raw);
  prompt = j.prompt || j.text || j.content || raw;
} catch { /* plain text */ }

runNhx(["session", "mark", "--from-prompt", prompt]);

const check = runNhx(["check", "--channel", "hook:beforeSubmit", "--json"]);
let payload = {};
try { payload = JSON.parse(check.stdout || "{}"); } catch { payload = {}; }

const fails = (payload.findings || []).filter((f) => !f.ok && !f.skipped);
const reminders = fails.map((f) => \`- \${f.sensor_id}: \${f.message}\`).join("\\n");
const rulesRemind = (payload.findings || [])
  .filter((f) => !f.skipped && f.check_type === "rules" && f.agent_prompt)
  .map((f) => f.agent_prompt);

// Never block prompt submit; human / rules reminders are soft.
const out = { continue: true };
const parts = [];
if (reminders) parts.push(reminders);
if (rulesRemind.length) parts.push("[nhx rules 提醒]\\n" + rulesRemind.join("\\n\\n"));
if (parts.length) out.user_message = "[nhx] " + parts.join("\\n\\n");
process.stdout.write(JSON.stringify(out));
process.exit(0);
`;

const STOP_HOOK = `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-check-stop
import { spawnSync } from "node:child_process";

function runNhx(args) {
  let r = spawnSync("nhx", args, { encoding: "utf8" });
  if (r.error || r.status == null) {
    r = spawnSync("npx", ["tsx", "packages/nhx/src/index.ts", ...args], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  }
  return r;
}

const r = runNhx(["check", "--channel", "hook:stop", "--json"]);
let payload = {};
try { payload = JSON.parse(r.stdout || "{}"); } catch { payload = { ok: r.status === 0, raw: r.stdout }; }

const findings = payload.findings || [];
const fails = findings.filter((f) => !f.ok && !f.skipped);
const rulesPrompts = findings
  .filter((f) => !f.skipped && f.check_type === "rules" && (f.agent_prompt || f.message))
  .map((f) => f.agent_prompt || ("- " + f.sensor_id + ": " + f.message));

const parts = [];
if (fails.length) {
  parts.push(
    "[nhx check] 检查未通过，请修复后继续：\\n" +
      fails.map((f) => "- " + f.sensor_id + " (" + f.check_type + "): " + f.message).join("\\n"),
  );
}
if (rulesPrompts.length) {
  parts.push(
    "[nhx rules] 请对照以下文本规则自检产物（由你作为 Agent 评判；本地不跑 LLM）：\\n\\n" +
      rulesPrompts.join("\\n\\n"),
  );
}

if (!parts.length) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(JSON.stringify({ followup_message: parts.join("\\n\\n") }));
process.exit(0);
`;

const AFTER_EDIT_HOOK = `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-check-afterFileEdit
import { spawnSync } from "node:child_process";

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function runNhx(args) {
  let r = spawnSync("nhx", args, { encoding: "utf8" });
  if (r.error || r.status == null) {
    r = spawnSync("npx", ["tsx", "packages/nhx/src/index.ts", ...args], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  }
  return r;
}

const raw = await readStdin();
let paths = [];
try {
  const j = JSON.parse(raw);
  const file = j.file || j.path || j.file_path || j.filePath;
  if (typeof file === "string") paths = [file];
  if (Array.isArray(j.paths)) paths = j.paths.map(String);
  if (Array.isArray(j.files)) paths = j.files.map((f) => (typeof f === "string" ? f : f.path || f.file || "")).filter(Boolean);
} catch { /* ignore */ }

const args = ["check", "--channel", "hook:afterFileEdit", "--json"];
if (paths.length) args.push("--paths", paths.join(","));
const r = runNhx(args);
let payload = {};
try { payload = JSON.parse(r.stdout || "{}"); } catch { payload = { ok: true }; }

const findings = payload.findings || [];
const fails = findings.filter((f) => !f.ok && !f.skipped);
const rulesPrompts = findings
  .filter((f) => !f.skipped && f.check_type === "rules" && (f.agent_prompt || f.message))
  .map((f) => f.agent_prompt || ("- " + f.sensor_id + ": " + f.message));

const parts = [];
if (fails.length) {
  parts.push(
    "[nhx afterFileEdit] " + fails.map((f) => "- " + f.sensor_id + ": " + f.message).join("\\n"),
  );
}
if (rulesPrompts.length) {
  parts.push(
    "[nhx rules] 请对照规则自检刚编辑的产物：\\n\\n" + rulesPrompts.join("\\n\\n"),
  );
}

if (!parts.length) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(JSON.stringify({ followup_message: parts.join("\\n\\n") }));
process.exit(0);
`;

function isNhxHookCommand(cmd: string): boolean {
  return (
    /nhx-check|nhx-sensor|nhx-session|nhx check|nhx sensor/i.test(cmd) ||
    cmd.includes("nhx-check") ||
    cmd.includes("nhx-sensor") ||
    cmd.includes("nhx-session")
  );
}

const LEGACY_HOOK_SCRIPTS = ["nhx-sensor-stop.mjs", "nhx-sensor-after-edit.mjs"];

export function syncCursorHooks(cwd = process.cwd()): { hooksJson: boolean; scripts: string[] } {
  const hooksDir = path.join(cwd, ".cursor", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const sessionRel = path.join(hooksDir, "nhx-session.mjs");
  const stopRel = path.join(hooksDir, "nhx-check-stop.mjs");
  const afterRel = path.join(hooksDir, "nhx-check-after-edit.mjs");
  fs.writeFileSync(sessionRel, SESSION_AND_BEFORE_HOOK, "utf8");
  fs.writeFileSync(stopRel, STOP_HOOK, "utf8");
  fs.writeFileSync(afterRel, AFTER_EDIT_HOOK, "utf8");

  for (const name of LEGACY_HOOK_SCRIPTS) {
    const legacy = path.join(hooksDir, name);
    if (fs.existsSync(legacy)) {
      try {
        fs.unlinkSync(legacy);
      } catch {
        /* ignore */
      }
    }
  }

  const hooksPath = path.join(cwd, ".cursor", "hooks.json");
  let doc: any = { version: 1, hooks: {} };
  if (fs.existsSync(hooksPath)) {
    try {
      doc = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    } catch {
      doc = { version: 1, hooks: {} };
    }
  }
  doc.version = doc.version || 1;
  doc.hooks = doc.hooks || {};

  const ensure = (event: string, entry: Record<string, unknown>) => {
    const list: any[] = Array.isArray(doc.hooks[event]) ? doc.hooks[event] : [];
    const filtered = list.filter((x) => !isNhxHookCommand(String(x?.command || "")));
    filtered.push(entry);
    doc.hooks[event] = filtered;
  };

  ensure("beforeSubmitPrompt", {
    command: "node .cursor/hooks/nhx-session.mjs",
    matcher: "UserPromptSubmit",
  });
  ensure("stop", {
    command: "node .cursor/hooks/nhx-check-stop.mjs",
    loop_limit: 3,
  });
  ensure("afterFileEdit", {
    command: "node .cursor/hooks/nhx-check-after-edit.mjs",
  });

  doc._nhx = {
    generated: GENERATED_MARKER,
    marker: NHX_HOOK_MARKER,
    note: "nhx merges check hooks (beforeSubmit/stop/afterFileEdit); hx hooks preserved",
  };
  fs.writeFileSync(hooksPath, JSON.stringify(doc, null, 2), "utf8");

  return {
    hooksJson: true,
    scripts: ["nhx-session.mjs", "nhx-check-stop.mjs", "nhx-check-after-edit.mjs"],
  };
}
