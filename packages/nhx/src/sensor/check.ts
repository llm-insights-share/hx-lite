import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "yaml";
import { createTicket, listArtifacts, submitTicket } from "../api/client.js";
import { loadConfig, loadCredentials, lockPath, nhxRoot, resolveApiBase } from "../config.js";

export type SensorFinding = {
  sensor_id: string;
  check_type: string;
  ok: boolean;
  message: string;
  skipped?: boolean;
  /** Full prompt for Agent self-check (rules); hooks may inject even when ok */
  agent_prompt?: string;
};

export type SensorCheckResult = {
  ok: boolean;
  stage: string;
  task: string;
  channel: string;
  findings: SensorFinding[];
};

type TaskMeta = {
  stage: string;
  id: string;
  sensors: string[];
};

type SensorMeta = {
  check_type: string;
  content: string;
  triggers: string[];
  scope: string[];
};

const DEFAULT_TRIGGERS = ["hook:stop", "cli", "task-shell"];

const INLINE_HELP =
  "Supported: file.exists(path=...), file.min_bytes(path=..., n=...), doc.sections_complete(path=..., require=[...]), approval.prd|arch|arch-lld == true. path 支持 * /**；多匹配须全部满足";

function loadLockTasks(cwd: string): TaskMeta[] {
  const p = lockPath(cwd);
  if (!fs.existsSync(p)) return [];
  const tasksFile = path.join(nhxRoot(cwd), "tasks.json");
  if (fs.existsSync(tasksFile)) {
    return JSON.parse(fs.readFileSync(tasksFile, "utf8")) as TaskMeta[];
  }
  return [];
}

function normalizeTriggers(raw: unknown): string[] {
  const allowed = new Set([
    "hook:beforeSubmit",
    "hook:afterFileEdit",
    "hook:stop",
    "cli",
    "task-shell",
  ]);
  const list = Array.isArray(raw) ? raw.map(String) : [];
  const out = list.filter((t) => allowed.has(t));
  return out.length ? out : [...DEFAULT_TRIGGERS];
}

function normalizeScope(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).map((s) => s.trim()).filter(Boolean);
}

function loadSensorMeta(cwd: string, sensorId: string): SensorMeta {
  const md = path.join(nhxRoot(cwd), "sensors", `${sensorId}.md`);
  const content = fs.existsSync(md) ? fs.readFileSync(md, "utf8") : "";
  const metaPath = path.join(nhxRoot(cwd), "sensors", `${sensorId}.meta.json`);
  let check_type = "inline";
  let triggers = [...DEFAULT_TRIGGERS];
  let scope: string[] = [];
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      check_type = meta.check_type || check_type;
      if (meta.triggers) triggers = normalizeTriggers(meta.triggers);
      if (meta.scope) scope = normalizeScope(meta.scope);
    } catch {
      /* ignore */
    }
  } else {
    const m = content.match(/check[_-]?type\s*[:=]\s*(\w+)/i);
    if (m) check_type = m[1].toLowerCase();
    else if (/human|manual|审批|人工/.test(content) || /approv|human|manual/i.test(sensorId))
      check_type = "human";
    else if (/```(?:bash|sh)\b/.test(content)) check_type = "shell";
    else if (/\brules_text\s*:/i.test(content)) check_type = "rules";
    else if (/\bexpr\s*:/.test(content)) check_type = "inline";
  }
  const fm = parseFrontmatter(content);
  if (fm.triggers) triggers = normalizeTriggers(fm.triggers);
  if (fm.scope) scope = normalizeScope(fm.scope);
  if (check_type === "manual") check_type = "human";
  return { check_type, content, triggers, scope };
}

/** Simple glob: * and ** against posix-ish relative paths. */
export function matchGlob(pattern: string, filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const pat = pattern.replace(/\\/g, "/");
  if (pat === "**" || pat === "**/*") return true;
  const esc = pat
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "«DG»")
    .replace(/\*/g, "[^/]*")
    .replace(/«DG»/g, ".*");
  return new RegExp(`^${esc}$`).test(norm);
}

export function pathHasGlob(pattern: string): boolean {
  return /[*?]/.test(pattern.replace(/\\/g, "/"));
}

const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".nhx",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
  ".cursor",
  ".trae",
  ".qoder",
]);

/** Directory to start walking: segments before first glob segment; empty → cwd. */
export function globScanRoot(pattern: string): string {
  const parts = pattern.replace(/\\/g, "/").replace(/^\.\//, "").split("/").filter(Boolean);
  const prefix: string[] = [];
  for (const part of parts) {
    if (/[*?]/.test(part)) break;
    prefix.push(part);
  }
  return prefix.join("/");
}

/** List files under cwd matching glob pattern (posix relative paths). */
export function listFilesMatching(cwd: string, pattern: string): string[] {
  const pat = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  const scanRel = globScanRoot(pat);
  const startAbs = scanRel ? path.join(cwd, scanRel) : cwd;
  if (!fs.existsSync(startAbs)) return [];

  const out: string[] = [];
  const walk = (absDir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === "." || ent.name === "..") continue;
      if (ent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(ent.name)) continue;
        walk(path.join(absDir, ent.name));
        continue;
      }
      if (!ent.isFile()) continue;
      const abs = path.join(absDir, ent.name);
      const rel = path.relative(cwd, abs).replace(/\\/g, "/");
      if (matchGlob(pat, rel)) out.push(rel);
    }
  };

  const st = fs.statSync(startAbs);
  if (st.isFile()) {
    const rel = path.relative(cwd, startAbs).replace(/\\/g, "/");
    if (matchGlob(pat, rel)) out.push(rel);
    return out.sort();
  }
  walk(startAbs);
  return out.sort();
}

/** Resolve exact path or expand glob; empty when glob matches nothing. */
export function resolveInlinePaths(cwd: string, pattern: string): string[] {
  const rel = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!pathHasGlob(rel)) return [rel];
  return listFilesMatching(cwd, rel);
}

function scopeMatches(scope: string[], paths: string[] | undefined): boolean {
  if (!paths?.length) return true; // no path context → run
  if (!scope.length) return true; // empty scope → all paths
  return paths.some((p) => scope.some((g) => matchGlob(g, p)));
}

function parseFrontmatter(content: string): Record<string, unknown> {
  try {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (fm) return (yaml.parse(fm[1]) || {}) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

function bodyAfterFrontmatter(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? (m[1] || "").trim() : content.trim();
}

/** Parse text-rules Check: rules_text + optional input paths. */
export function parseRulesContent(content: string): { rulesText: string; input: string[] } {
  const doc = parseFrontmatter(content);
  const inputRaw = doc.input ?? doc.inputs;
  const input = Array.isArray(inputRaw)
    ? inputRaw.map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  let rulesText = "";
  if (typeof doc.rules_text === "string" && doc.rules_text.trim()) {
    rulesText = doc.rules_text.trim();
  } else if (typeof doc.rules === "string" && doc.rules.trim()) {
    rulesText = doc.rules.trim();
  } else {
    // Body after frontmatter as free-text rules (ignore legacy require_files-only bodies)
    const body = bodyAfterFrontmatter(content);
    if (body && !/^require_files\s*:/m.test(body)) rulesText = body;
  }
  return { rulesText, input };
}

export function buildRulesAgentPrompt(sensorId: string, content: string): string {
  const { rulesText, input } = parseRulesContent(content);
  const lines = [
    `#### \`${sensorId}\``,
    "",
    input.length ? `审阅对象: ${input.map((p) => `\`${p}\``).join(", ")}` : "审阅对象:（未声明 input，请对照本任务产物）",
    "",
    rulesText || "（未配置 rules_text）",
    "",
    "请作为 Agent 对照上述规则审阅产物；未满足则先修订再宣称 Done。nhx 本地不调用大模型评判质量。",
  ];
  return lines.join("\n");
}

function parseInlineExpr(content: string): string {
  const doc = parseFrontmatter(content);
  if (typeof doc.expr === "string" && doc.expr.trim()) return doc.expr.trim();
  const m = content.match(/^\s*expr\s*:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

function parseCallArgs(inner: string): { named: Record<string, string>; list: string[] } {
  const named: Record<string, string> = {};
  const list: string[] = [];
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of inner) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  for (const p of parts) {
    const m = p.match(/^(\w+)\s*=\s*(.+)$/);
    if (m) {
      named[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
    } else {
      list.push(p.replace(/^["']|["']$/g, ""));
    }
  }
  return { named, list };
}

function parseRequireList(raw: string | undefined): string[] {
  if (!raw) return [];
  const t = raw.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    return t
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [t.replace(/^["']|["']$/g, "")].filter(Boolean);
}

async function checkHuman(
  cwd: string,
  stage: string,
  task: string,
): Promise<{ ok: boolean; message: string }> {
  const cfg = loadConfig(cwd);
  const creds = loadCredentials(cwd);
  if (!cfg?.project_id || !creds?.access_token) {
    return { ok: false, message: "提醒：尚未批准（未登录或未配置 project，无法查询审批状态）" };
  }
  const api = resolveApiBase(undefined, cwd);
  const url = `${api}/api/tickets/approval-status?project_id=${cfg.project_id}&stage=${encodeURIComponent(stage)}&task=${encodeURIComponent(task)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.access_token}` } });
  if (!res.ok) {
    return { ok: false, message: `提醒：尚未批准（approval-status HTTP ${res.status}）` };
  }
  const data = (await res.json()) as {
    approved: boolean;
    pending: boolean;
    latest_artifact?: { name?: string } | null;
    cutoff_at?: string | null;
  };
  if (data.approved) return { ok: true, message: "人工审批已通过（覆盖当前最新产物/任务执行）" };
  if (data.pending) {
    return { ok: false, message: "提醒：尚未批准（工单待处理 draft/submitted）" };
  }

  // No covering approval/pending → auto create + submit a fresh human-check ticket.
  try {
    const arts = await listArtifacts(api, creds.access_token, {
      project_id: cfg.project_id,
      stage,
      task,
    });
    if (!arts.length) {
      return {
        ok: false,
        message: `提醒：尚未批准 — 任务 ${stage}/${task} 尚无产物。请先 nhx submit 上传后再检查。`,
      };
    }
    const latest = [...arts].sort((a, b) => {
      const ta = Date.parse(String(a.updated_at || 0)) || 0;
      const tb = Date.parse(String(b.updated_at || 0)) || 0;
      return tb - ta;
    })[0];
    const artifactName = String(latest?.name || data.latest_artifact?.name || "");
    const ticket = await createTicket(api, creds.access_token, {
      project_id: cfg.project_id,
      title: `人工检查 ${stage}/${task}${artifactName ? `：${artifactName}` : ""}`,
      ticket_type: "human-check",
      stage,
      task,
      artifact_name: artifactName,
      body: `自动创建：任务壳执行后产物需重新审批（${stage}/${task}${artifactName ? ` / ${artifactName}` : ""}）`,
    });
    const submitted = await submitTicket(api, creds.access_token, ticket.id);
    return {
      ok: false,
      message: `提醒：尚未批准 — 已自动创建并提交工单 ${submitted.ticket_no || ticket.ticket_no}，请在 WebUI 审批后再继续`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `提醒：尚未批准 — 自动建单失败（${msg}）。请手动 nhx approve request --stage ${stage} --task ${task}`,
    };
  }
}

function checkRules(
  cwd: string,
  sensorId: string,
  content: string,
): { ok: boolean; message: string; agent_prompt: string } {
  const { rulesText, input } = parseRulesContent(content);
  const agent_prompt = buildRulesAgentPrompt(sensorId, content);

  if (!rulesText.trim()) {
    return {
      ok: false,
      message: "rules Check 缺少 rules_text（或正文规则）",
      agent_prompt,
    };
  }

  // Deterministic precheck: if input paths declared, at least one must exist
  if (input.length) {
    const existing = input.filter((f) => fs.existsSync(path.join(cwd, f)));
    if (!existing.length) {
      return {
        ok: false,
        message: `rules 审阅对象均不存在: ${input.join(", ")}（质量由 Agent 评判；请先产出文件）`,
        agent_prompt,
      };
    }
  }

  const summary = rulesText.split("\n").filter((l) => l.trim()).slice(0, 3).join(" / ");
  return {
    ok: true,
    message: `rules → Agent 自检（本地不评判质量）: ${summary}${rulesText.split("\n").length > 3 ? " …" : ""}`,
    agent_prompt,
  };
}

function checkShell(content: string, cwd: string): { ok: boolean; message: string } {
  const m = content.match(/```(?:bash|sh)\n([\s\S]*?)```/);
  if (!m) return { ok: true, message: "shell Check：无脚本块，跳过" };
  const script = m[1].trim();
  if (!script) return { ok: true, message: "shell Check：空脚本，跳过" };
  const r = spawnSync("bash", ["-lc", script], { cwd, encoding: "utf8", timeout: 15000 });
  if (r.status === 0) return { ok: true, message: "shell Check 通过" };
  return {
    ok: false,
    message: `shell Check 失败 (exit ${r.status}): ${(r.stderr || r.stdout || "").slice(0, 300)}`,
  };
}

export function checkFileExists(cwd: string, rel: string): { ok: boolean; message: string } {
  const paths = resolveInlinePaths(cwd, rel);
  if (pathHasGlob(rel) && !paths.length) {
    return { ok: false, message: `file.exists 失败: 无匹配文件 ${rel}` };
  }
  for (const p of paths) {
    const full = path.join(cwd, p);
    if (!fs.existsSync(full)) return { ok: false, message: `file.exists 失败: 缺少 ${p}` };
  }
  if (paths.length === 1) return { ok: true, message: `file.exists ok: ${paths[0]}` };
  return { ok: true, message: `file.exists ok: ${paths.length} 个文件均存在 (${rel})` };
}

export function checkFileMinBytes(cwd: string, rel: string, n: number): { ok: boolean; message: string } {
  const paths = resolveInlinePaths(cwd, rel);
  if (pathHasGlob(rel) && !paths.length) {
    return { ok: false, message: `file.min_bytes 失败: 无匹配文件 ${rel}` };
  }
  for (const p of paths) {
    const full = path.join(cwd, p);
    if (!fs.existsSync(full)) return { ok: false, message: `file.min_bytes 失败: 缺少 ${p}` };
    const size = fs.statSync(full).size;
    if (size < n) return { ok: false, message: `file.min_bytes 失败: ${p} 仅 ${size}B < ${n}` };
  }
  if (paths.length === 1) {
    const size = fs.statSync(path.join(cwd, paths[0]!)).size;
    return { ok: true, message: `file.min_bytes ok: ${paths[0]} (${size}B)` };
  }
  return { ok: true, message: `file.min_bytes ok: ${paths.length} 个文件均 ≥${n}B (${rel})` };
}

export function checkDocSections(cwd: string, rel: string, require: string[]): { ok: boolean; message: string } {
  const paths = resolveInlinePaths(cwd, rel);
  if (pathHasGlob(rel) && !paths.length) {
    return { ok: false, message: `doc.sections_complete 失败: 无匹配文件 ${rel}` };
  }
  for (const p of paths) {
    const full = path.join(cwd, p);
    if (!fs.existsSync(full)) return { ok: false, message: `doc.sections_complete 失败: 缺少 ${p}` };
    const text = fs.readFileSync(full, "utf8");
    const missing = require.filter((k) => !text.toLowerCase().includes(k.toLowerCase()));
    if (missing.length) {
      return {
        ok: false,
        message: `doc.sections_complete 失败: ${p} 缺少章节关键词 ${missing.join(", ")}`,
      };
    }
  }
  if (paths.length === 1) {
    return { ok: true, message: `doc.sections_complete ok (${require.length})` };
  }
  return {
    ok: true,
    message: `doc.sections_complete ok: ${paths.length} 个文件均含章节 (${require.length})`,
  };
}

async function checkInline(
  cwd: string,
  content: string,
  stage: string,
  task: string,
): Promise<{ ok: boolean; message: string }> {
  const exprRaw = parseInlineExpr(content);
  if (!exprRaw) {
    return { ok: false, message: `inline Check 缺少 expr。${INLINE_HELP}` };
  }
  const expr = exprRaw.replace(/\s*==\s*true\s*$/i, "").trim();

  const appr = expr.match(/^approval\.(prd|arch|arch-lld)$/i);
  if (appr) {
    return checkHuman(cwd, stage, task);
  }

  const fileExists = expr.match(/^file\.exists\((.+)\)$/i);
  if (fileExists) {
    const { named, list } = parseCallArgs(fileExists[1]!);
    const p = named.path ?? list[0];
    if (!p) return { ok: false, message: "file.exists 需要 path" };
    return checkFileExists(cwd, p);
  }

  const fileMin = expr.match(/^file\.min_bytes\((.+)\)$/i);
  if (fileMin) {
    const { named, list } = parseCallArgs(fileMin[1]!);
    const p = named.path ?? list[0];
    const n = Number(named.n ?? named.min ?? list[1] ?? 0);
    if (!p) return { ok: false, message: "file.min_bytes 需要 path" };
    return checkFileMinBytes(cwd, p, Number.isFinite(n) ? n : 0);
  }

  const docSec = expr.match(/^doc\.sections_complete\((.*)\)$/i);
  if (docSec || /^doc\.sections_complete$/i.test(expr)) {
    const { named } = docSec ? parseCallArgs(docSec[1] ?? "") : { named: {} as Record<string, string> };
    const fm = parseFrontmatter(content);
    const pathArg =
      named.path ??
      (typeof fm.path === "string" ? fm.path : undefined) ??
      (typeof (fm as { args?: { path?: string } }).args?.path === "string"
        ? (fm as { args: { path: string } }).args.path
        : undefined);
    const requireRaw =
      named.require ??
      (Array.isArray(fm.require) ? `[${(fm.require as string[]).join(",")}]` : undefined);
    const sections = parseRequireList(requireRaw);
    if (!pathArg) return { ok: false, message: "doc.sections_complete 需要 path=" };
    if (!sections.length) return { ok: false, message: "doc.sections_complete 需要 require=[...]" };
    return checkDocSections(cwd, pathArg, sections);
  }

  return {
    ok: false,
    message: `unknown inline predicate: "${exprRaw}". ${INLINE_HELP}`,
  };
}

export async function runSensorCheck(opts: {
  stage?: string;
  task?: string;
  cwd?: string;
  /** Trigger channel filter: cli | hook:stop | hook:beforeSubmit | hook:afterFileEdit | task-shell */
  channel?: string;
  /** Edited paths for afterFileEdit scope matching */
  paths?: string[];
}): Promise<SensorCheckResult> {
  const cwd = opts.cwd || process.cwd();
  const channel = opts.channel || "cli";
  const sessionPath = path.join(nhxRoot(cwd), "session.json");
  let stage = opts.stage || "";
  let task = opts.task || "";
  if ((!stage || !task) && fs.existsSync(sessionPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
      stage = stage || s.stage || "";
      task = task || s.task || "";
    } catch {
      /* ignore */
    }
  }
  if (!stage || !task) {
    return {
      ok: true,
      stage: stage || "",
      task: task || "",
      channel,
      findings: [
        {
          sensor_id: "-",
          check_type: "session",
          ok: true,
          message: "无 stage/task 会话上下文，跳过 Check 检查",
        },
      ],
    };
  }

  const tasks = loadLockTasks(cwd);
  const hit = tasks.find((t) => t.stage === stage && t.id === task);
  const sensorIds = hit?.sensors || [];
  const findings: SensorFinding[] = [];

  for (const sid of sensorIds) {
    const meta = loadSensorMeta(cwd, sid);
    if (!meta.triggers.includes(channel)) {
      findings.push({
        sensor_id: sid,
        check_type: meta.check_type,
        ok: true,
        skipped: true,
        message: `跳过（未勾选通道 ${channel}）`,
      });
      continue;
    }
    if (channel === "hook:afterFileEdit" && !scopeMatches(meta.scope, opts.paths)) {
      findings.push({
        sensor_id: sid,
        check_type: meta.check_type,
        ok: true,
        skipped: true,
        message: `跳过（编辑路径未匹配 scope ${meta.scope.join(",") || "*"}）`,
      });
      continue;
    }

    const ct = (meta.check_type || "inline").toLowerCase();
    let result: { ok: boolean; message: string; agent_prompt?: string };
    // human: reminder-only approval status — never run file/shell checks
    if (ct === "human" || ct === "manual") {
      result = await checkHuman(cwd, stage, task);
    } else if (ct === "shell") {
      result = checkShell(meta.content, cwd);
    } else if (ct === "inline") {
      result = await checkInline(cwd, meta.content, stage, task);
    } else if (ct === "rules") {
      result = checkRules(cwd, sid, meta.content);
    } else {
      // Unknown → treat as inline if expr present, else soft pass
      result = await checkInline(cwd, meta.content, stage, task);
    }
    findings.push({
      sensor_id: sid,
      check_type: ct === "manual" ? "human" : ct,
      ok: result.ok,
      message: result.message,
      ...(result.agent_prompt ? { agent_prompt: result.agent_prompt } : {}),
    });
  }

  if (!sensorIds.length) {
    findings.push({
      sensor_id: "-",
      check_type: "none",
      ok: true,
      message: `任务 ${stage}/${task} 未绑定 Check`,
    });
  }

  // Soft: skipped findings don't fail the overall result.
  // rules quality is Agent-judged (ok:true when input exists); only missing input / missing rules_text fail.
  const actionable = findings.filter((f) => !f.skipped);
  return {
    ok: actionable.every((f) => f.ok),
    stage,
    task,
    channel,
    findings,
  };
}

export function markSession(stage: string, task: string, cwd = process.cwd()): void {
  const root = nhxRoot(cwd);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "session.json"),
    JSON.stringify({ stage, task, marked_at: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

/** Parse /nhx-<stage>-<task> from prompt text */
export function parseNhxSlash(prompt: string): { stage: string; task: string } | null {
  const m = prompt.match(/\/nhx-([a-z0-9]+)-([a-z0-9][a-z0-9\-]*)/i);
  if (!m) return null;
  return { stage: m[1], task: m[2] };
}
