import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GENERATED_MARKER } from "../config.js";
import type { InstallScope } from "../config.js";

const NHX_HOOK_MARKER = "nhx check";

export type TraeHookIde = "trae" | "trae-cn";

function runNhxHelper(): string {
  return `function runNhx(args) {
  let r = spawnSync("nhx", args, { encoding: "utf8" });
  if (r.error || r.status == null) {
    r = spawnSync("npx", ["tsx", "packages/nhx/src/index.ts", ...args], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  }
  return r;
}`;
}

function readStdinHelper(): string {
  return `async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}`;
}

function promptHookScript(ide: TraeHookIde): string {
  return `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-trae-prompt
import { spawnSync } from "node:child_process";

${readStdinHelper()}

${runNhxHelper()}

const raw = await readStdin();
let prompt = raw;
try {
  const j = JSON.parse(raw);
  prompt = j.prompt || j.text || j.content || raw;
} catch { /* plain text */ }

const markArgs = ["session", "mark", "--from-prompt", prompt, "--ide", ${JSON.stringify(ide)}];
if (/Use Skill:/i.test(String(prompt))) markArgs.push("--no-report");
runNhx(markArgs);

const check = runNhx(["check", "--channel", "hook:beforeSubmit", "--json"]);
let payload = {};
try { payload = JSON.parse(check.stdout || "{}"); } catch { payload = {}; }

const fails = (payload.findings || []).filter((f) => !f.ok && !f.skipped);
const reminders = fails.map((f) => \`- \${f.sensor_id}: \${f.message}\`).join("\\n");
const rulesRemind = (payload.findings || [])
  .filter((f) => !f.skipped && f.check_type === "rules" && f.agent_prompt)
  .map((f) => f.agent_prompt);

const parts = [];
if (reminders) parts.push(reminders);
if (rulesRemind.length) parts.push("[nhx rules 提醒]\\n" + rulesRemind.join("\\n\\n"));

const out = { continue: true };
if (parts.length) {
  out.hookSpecificOutput = {
    hookEventName: "UserPromptSubmit",
    additionalContext: "[nhx] " + parts.join("\\n\\n"),
  };
}
process.stdout.write(JSON.stringify(out));
process.exit(0);
`;
}

function stopHookScript(): string {
  return `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-trae-stop
import { spawnSync } from "node:child_process";

${runNhxHelper()}

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

process.stdout.write(JSON.stringify({ decision: "block", reason: parts.join("\\n\\n") }));
process.exit(0);
`;
}

function postToolHookScript(ide: TraeHookIde): string {
  return `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-trae-post-tool
import { spawnSync } from "node:child_process";

${readStdinHelper()}

${runNhxHelper()}

const raw = await readStdin();
let j = {};
try { j = JSON.parse(raw); } catch { j = {}; }

const tool = String(j.tool_name || j.llm_tool_name || "").toLowerCase();
const input = j.tool_input && typeof j.tool_input === "object" ? j.tool_input : {};

function skillName(obj) {
  const cands = [obj.name, obj.skill, obj.skill_name, obj.skillName, obj.id, obj.command];
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

if (tool === "skill") {
  const name = skillName(input);
  const m = name.match(/nhx-[a-z0-9]+-[a-z0-9][a-z0-9\\-]*/i);
  if (m) {
    const prompt = m[0].startsWith("/") ? m[0] : "/" + m[0];
    runNhx(["session", "mark", "--from-prompt", prompt, "--ide", ${JSON.stringify(ide)}]);
  }
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

let paths = [];
const file = input.path || input.file || input.file_path || input.filePath;
if (typeof file === "string") paths = [file];
if (Array.isArray(j.paths)) paths = j.paths.map(String);
if (Array.isArray(j.files)) {
  paths = j.files.map((f) => (typeof f === "string" ? f : f.path || f.file || "")).filter(Boolean);
}

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

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: parts.join("\\n\\n"),
  },
}));
process.exit(0);
`;
}

function isNhxHookCommand(cmd: string): boolean {
  return (
    /nhx-trae-|nhx-check|nhx-sensor|nhx-session|nhx check|nhx sensor/i.test(cmd) ||
    cmd.includes("nhx-check") ||
    cmd.includes("nhx-sensor") ||
    cmd.includes("nhx-session")
  );
}

function isNhxTraeGroup(group: unknown): boolean {
  if (!group || typeof group !== "object") return false;
  const g = group as { command?: string; hooks?: Array<{ command?: string }> };
  if (g.command && isNhxHookCommand(String(g.command))) return true;
  const inner = Array.isArray(g.hooks) ? g.hooks : [];
  return inner.some((h) => isNhxHookCommand(String(h?.command || "")));
}

function commandGroup(command: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    hooks: [{ type: "command", command }],
  };
}

export function traeHooksEnableHint(targets: string[], scope: InstallScope = "project"): string | null {
  if (!targets.some((t) => t === "trae" || t === "trae-cn")) return null;
  if (scope === "global") {
    return "ℹ Trae hooks 已写入全局 ~/.trae-cn/hooks.json（或 ~/.trae/hooks.json）；请在 Trae「设置 → Hooks」中启用全局 Hook（首次需在安全提示面板允许）。";
  }
  return "ℹ Trae hooks 已写入项目 .trae/hooks.json；请在 Trae「设置 → Hooks」中启用项目 Hook（勿同时启用全局 nhx hooks，以免重复上报）。";
}

const HOOK_SCRIPTS = ["nhx-trae-prompt.mjs", "nhx-trae-stop.mjs", "nhx-trae-post-tool.mjs"] as const;

function writeHookBundle(
  hooksDir: string,
  hooksJsonPath: string,
  ide: TraeHookIde,
  commandFor: (script: string) => string,
): void {
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, "nhx-trae-prompt.mjs"), promptHookScript(ide), "utf8");
  fs.writeFileSync(path.join(hooksDir, "nhx-trae-stop.mjs"), stopHookScript(), "utf8");
  fs.writeFileSync(path.join(hooksDir, "nhx-trae-post-tool.mjs"), postToolHookScript(ide), "utf8");

  // Drop debug-only SessionStart leftover from earlier syncs
  const staleStart = path.join(hooksDir, "nhx-trae-session-start.mjs");
  if (fs.existsSync(staleStart)) {
    try {
      fs.unlinkSync(staleStart);
    } catch {
      /* ignore */
    }
  }

  let doc: { version?: number; hooks?: Record<string, unknown[]>; _nhx?: unknown } = {
    version: 1,
    hooks: {},
  };
  if (fs.existsSync(hooksJsonPath)) {
    try {
      doc = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
    } catch {
      doc = { version: 1, hooks: {} };
    }
  }
  doc.version = doc.version || 1;
  doc.hooks = doc.hooks || {};

  const ensure = (event: string, group: Record<string, unknown>) => {
    const list: unknown[] = Array.isArray(doc.hooks![event]) ? doc.hooks![event] : [];
    const filtered = list.filter((x) => !isNhxTraeGroup(x));
    filtered.push(group);
    doc.hooks![event] = filtered;
  };

  // Remove previous nhx SessionStart groups (debug-only)
  if (Array.isArray(doc.hooks.SessionStart)) {
    doc.hooks.SessionStart = doc.hooks.SessionStart.filter((x) => !isNhxTraeGroup(x));
    if (!doc.hooks.SessionStart.length) delete doc.hooks.SessionStart;
  }

  ensure("UserPromptSubmit", commandGroup(commandFor("nhx-trae-prompt.mjs")));
  ensure("Stop", commandGroup(commandFor("nhx-trae-stop.mjs"), { loop_limit: 3 }));
  ensure(
    "PostToolUse",
    commandGroup(commandFor("nhx-trae-post-tool.mjs"), { matcher: "Skill|Edit|Write" }),
  );

  doc._nhx = {
    generated: GENERATED_MARKER,
    marker: NHX_HOOK_MARKER,
    ide,
    note: "nhx merges Trae hooks (UserPromptSubmit/Stop/PostToolUse); user hooks preserved",
  };
  fs.writeFileSync(hooksJsonPath, JSON.stringify(doc, null, 2), "utf8");
}

/** Remove nhx Trae hook groups from a hooks.json (avoid global+project double fire). */
export function stripNhxTraeHooksAt(hooksJsonPath: string): void {
  if (!fs.existsSync(hooksJsonPath)) return;
  let doc: { version?: number; hooks?: Record<string, unknown[]>; _nhx?: unknown };
  try {
    doc = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
  } catch {
    return;
  }
  if (!doc.hooks || typeof doc.hooks !== "object") return;
  for (const event of Object.keys(doc.hooks)) {
    const list = Array.isArray(doc.hooks[event]) ? doc.hooks[event] : [];
    const filtered = list.filter((x) => !isNhxTraeGroup(x));
    if (filtered.length) doc.hooks[event] = filtered;
    else delete doc.hooks[event];
  }
  if (doc._nhx && typeof doc._nhx === "object") {
    const nhx = doc._nhx as { generated?: string };
    if (String(nhx.generated || "").includes(GENERATED_MARKER)) delete doc._nhx;
  }
  fs.writeFileSync(hooksJsonPath, JSON.stringify(doc, null, 2), "utf8");
}

/**
 * Project: `$PROJECT/.trae/hooks.json` (Trae docs).
 * Global (trae-cn): `~/.trae-cn/hooks.json` when install_scope=global.
 */
export function syncTraeHooks(
  cwd = process.cwd(),
  ide: TraeHookIde = "trae",
  home = os.homedir(),
  scope: InstallScope = "project",
): { hooksJson: boolean; scripts: string[]; ide: TraeHookIde; globalDest: string; scope: InstallScope } {
  const globalBase = path.join(home, ide === "trae-cn" ? ".trae-cn" : ".trae");
  const globalHooksJson = path.join(globalBase, "hooks.json");
  const projectHooksJson = path.join(cwd, ".trae", "hooks.json");
  const projectTraeCnHooksJson = path.join(cwd, ".trae-cn", "hooks.json");

  if (scope === "project") {
    writeHookBundle(path.join(cwd, ".trae", "hooks"), projectHooksJson, ide, (name) =>
      `node .trae/hooks/${name}`,
    );
    stripNhxTraeHooksAt(globalHooksJson);
    stripNhxTraeHooksAt(projectTraeCnHooksJson);
  } else {
    const globalHooksDir = path.join(globalBase, "hooks");
    writeHookBundle(globalHooksDir, globalHooksJson, ide, (name) => {
      const abs = path.join(globalHooksDir, name);
      return `node ${JSON.stringify(abs)}`;
    });
    stripNhxTraeHooksAt(projectHooksJson);
    stripNhxTraeHooksAt(projectTraeCnHooksJson);
  }

  return {
    hooksJson: true,
    scripts: [...HOOK_SCRIPTS],
    ide,
    globalDest: globalHooksJson,
    scope,
  };
}
