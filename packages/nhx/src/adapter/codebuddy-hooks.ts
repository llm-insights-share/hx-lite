import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GENERATED_MARKER, type InstallScope } from "../config.js";

const NHX_HOOK_MARKER = "nhx check";

export type CodeBuddyIde = "codebuddy" | "workbuddy";

/** Project always `.codebuddy`; WorkBuddy user-global is `.workbuddy`. */
export function codeBuddyDirName(ide: CodeBuddyIde, scope: InstallScope): string {
  return scope === "global" && ide === "workbuddy" ? ".workbuddy" : ".codebuddy";
}

export function codeBuddyHomeDir(ide: CodeBuddyIde, home = os.homedir()): string {
  return path.join(home, codeBuddyDirName(ide, "global"));
}

export function codeBuddyHooksEnableHint(
  targets: string[],
  scope: InstallScope = "project",
): string | null {
  const hasCb = targets.includes("codebuddy");
  const hasWb = targets.includes("workbuddy");
  if (!hasCb && !hasWb) return null;
  if (scope === "global") {
    const paths: string[] = [];
    if (hasCb) paths.push("~/.codebuddy/settings.json");
    if (hasWb) paths.push("~/.workbuddy/settings.json");
    return `ℹ CodeBuddy/WorkBuddy hooks 已写入全局 ${paths.join(" / ")}；请在 IDE 设置中启用全局 Hook。`;
  }
  return "ℹ CodeBuddy/WorkBuddy hooks 已写入项目 .codebuddy/settings.json；请在 IDE 设置中启用项目 Hook（勿与全局 nhx hooks 重复启用）。";
}

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

function promptHookScript(ide: CodeBuddyIde): string {
  return `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-codebuddy-prompt
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
// ${GENERATED_MARKER} nhx-codebuddy-stop
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

function postToolHookScript(ide: CodeBuddyIde): string {
  return `#!/usr/bin/env node
// ${GENERATED_MARKER} nhx-codebuddy-post-tool
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
    /nhx-codebuddy-|nhx-check|nhx-sensor|nhx-session|nhx check|nhx sensor/i.test(cmd) ||
    cmd.includes("nhx-codebuddy") ||
    cmd.includes("nhx-check") ||
    cmd.includes("nhx-sensor") ||
    cmd.includes("nhx-session")
  );
}

function isNhxCodeBuddyGroup(group: unknown): boolean {
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

const HOOK_SCRIPTS = [
  "nhx-codebuddy-prompt.mjs",
  "nhx-codebuddy-stop.mjs",
  "nhx-codebuddy-post-tool.mjs",
] as const;

function writeHookBundle(
  hooksDir: string,
  settingsPath: string,
  ide: CodeBuddyIde,
  commandFor: (script: string) => string,
): void {
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, "nhx-codebuddy-prompt.mjs"), promptHookScript(ide), "utf8");
  fs.writeFileSync(path.join(hooksDir, "nhx-codebuddy-stop.mjs"), stopHookScript(), "utf8");
  fs.writeFileSync(path.join(hooksDir, "nhx-codebuddy-post-tool.mjs"), postToolHookScript(ide), "utf8");

  let doc: { hooks?: Record<string, unknown[]>; _nhx?: unknown } = { hooks: {} };
  if (fs.existsSync(settingsPath)) {
    try {
      doc = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      doc = { hooks: {} };
    }
  }
  doc.hooks = doc.hooks || {};

  const ensure = (event: string, group: Record<string, unknown>) => {
    const list: unknown[] = Array.isArray(doc.hooks![event]) ? doc.hooks![event] : [];
    const filtered = list.filter((x) => !isNhxCodeBuddyGroup(x));
    filtered.push(group);
    doc.hooks![event] = filtered;
  };

  ensure("UserPromptSubmit", commandGroup(commandFor("nhx-codebuddy-prompt.mjs")));
  ensure("Stop", commandGroup(commandFor("nhx-codebuddy-stop.mjs")));
  ensure(
    "PostToolUse",
    commandGroup(commandFor("nhx-codebuddy-post-tool.mjs"), { matcher: "Skill|Edit|Write" }),
  );

  doc._nhx = {
    generated: GENERATED_MARKER,
    marker: NHX_HOOK_MARKER,
    ide,
    note: "nhx merges CodeBuddy hooks (UserPromptSubmit/Stop/PostToolUse); user hooks preserved",
  };
  fs.writeFileSync(settingsPath, JSON.stringify(doc, null, 2), "utf8");
}

export function stripNhxCodeBuddyHooksAt(settingsPath: string, expectIde?: CodeBuddyIde): void {
  if (!fs.existsSync(settingsPath)) return;
  let doc: { hooks?: Record<string, unknown[]>; _nhx?: unknown };
  try {
    doc = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return;
  }
  if (expectIde) {
    const nhx = doc._nhx && typeof doc._nhx === "object" ? (doc._nhx as { ide?: string }) : null;
    if (nhx?.ide !== expectIde) return;
  }
  if (!doc.hooks || typeof doc.hooks !== "object") return;
  for (const event of Object.keys(doc.hooks)) {
    const list = Array.isArray(doc.hooks[event]) ? doc.hooks[event] : [];
    const filtered = list.filter((x) => !isNhxCodeBuddyGroup(x));
    if (filtered.length) doc.hooks[event] = filtered;
    else delete doc.hooks[event];
  }
  if (doc._nhx && typeof doc._nhx === "object") {
    const nhx = doc._nhx as { generated?: string };
    if (String(nhx.generated || "").includes(GENERATED_MARKER)) delete doc._nhx;
  }
  fs.writeFileSync(settingsPath, JSON.stringify(doc, null, 2), "utf8");
}

export function syncCodeBuddyHooks(
  cwd = process.cwd(),
  ide: CodeBuddyIde = "codebuddy",
  home = os.homedir(),
  scope: InstallScope = "project",
): { settingsJson: boolean; scripts: string[]; ide: CodeBuddyIde; globalDest: string; scope: InstallScope } {
  const globalBase = codeBuddyHomeDir(ide, home);
  const globalSettings = path.join(globalBase, "settings.json");
  const projectSettings = path.join(cwd, ".codebuddy", "settings.json");
  // Legacy: workbuddy --global used to write into ~/.codebuddy; strip only if _nhx.ide is workbuddy.
  const legacyCodeBuddySettings = path.join(home, ".codebuddy", "settings.json");

  if (scope === "project") {
    writeHookBundle(path.join(cwd, ".codebuddy", "hooks"), projectSettings, ide, (name) =>
      `node .codebuddy/hooks/${name}`,
    );
    stripNhxCodeBuddyHooksAt(globalSettings);
  } else {
    const globalHooksDir = path.join(globalBase, "hooks");
    writeHookBundle(globalHooksDir, globalSettings, ide, (name) => {
      const abs = path.join(globalHooksDir, name);
      return `node ${JSON.stringify(abs)}`;
    });
    stripNhxCodeBuddyHooksAt(projectSettings);
  }

  if (ide === "workbuddy") {
    stripNhxCodeBuddyHooksAt(legacyCodeBuddySettings, "workbuddy");
  }

  return {
    settingsJson: true,
    scripts: [...HOOK_SCRIPTS],
    ide,
    globalDest: globalSettings,
    scope,
  };
}
