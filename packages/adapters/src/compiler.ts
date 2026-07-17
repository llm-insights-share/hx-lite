import fs from "node:fs";
import path from "node:path";
import {
  Workspace,
  ensureDir,
  sha256,
  STAGE_TASKS,
  loadSkillPackage,
  formatSkillResourceAppendix,
  resolveSuiteName,
  resolveSuiteSensors,
  type DeliveryStage,
  type GuideDef
} from "@harnessx/core";
import { computeTier, TARGETS, type Tier } from "./capability.js";

/**
 * T-604: single-source → multi-target compilation.
 */

export const ADAPTER_VERSION = "1.0.0";

/** Marker for the compile-time bound-guides appendix (do not hand-edit generated commands). */
export const BOUND_GUIDES_MARKER = "<!-- harnessx:bound-guides -->";

export interface CommandDef {
  name: string;
  description: string;
  run: string;
  stage: DeliveryStage;
  task: string;
  prompt?: string;
  /** Compile-time appendix from bound skills/templates (set by collectCommands). */
  appendix?: string;
}

const STAGE_COMMAND_DESCRIPTIONS: Record<string, string> = {
  "req.biz-understanding": "Capture business background and problem context",
  "req.requirements-research": "Stakeholder research and findings",
  "req.requirements-analysis": "Problem/user/priority analysis sidecar",
  "req.prototype-design": "Org-level wireframe page inventory",
  "req.prd-writing": "Author or revise org-level PRD",
  "arch.subsystem-division": "Write global architecture HLD",
  "arch.tech-selection": "Fill technology selection in HLD overview",
  "arch.database-design": "Fill database design in HLD overview",
  "arch.interface-design": "Fill external/inter-system interfaces in HLD",
  "arch.key-mechanisms": "Document key design mechanisms / ADRs",
  "arch.internal-interface": "Write module LLD",
  "dev.plan": "Generate dual-track tasks.md",
  "dev.propose": "Draft proposal.md + initial delta specs",
  "dev.design": "Write design.md (requires propose gate)",
  "dev.apply": "Implement task-by-task with fast-suite self-correction",
  "dev.verify": "Run the verification suite + traceability",
  "dev.archive": "Merge deltas into main specs and archive",
  "test.test-case-design": "Design test cases for the change",
  "test.test-execution": "Execute tests, UAT, bugs, and test report"
};

function slashName(stage: DeliveryStage, task: string): string {
  return `hx-${stage}-${task.replace(/_/g, "-")}`;
}

export function standardCommands(): CommandDef[] {
  const commands: CommandDef[] = [];
  const orgRuns: Record<string, string> = {
    "req.biz-understanding": "hx req check --task biz-understanding --prd <slug>",
    "req.requirements-research": "hx req research init <slug>",
    "req.requirements-analysis": "hx req analysis init <slug>",
    "req.prototype-design": "hx req prototype init <slug>",
    "req.prd-writing": 'hx req prd init <slug> --title "..."',
    "arch.subsystem-division": 'hx arch init --title "..."',
    "arch.tech-selection": "hx arch check --task tech-selection",
    "arch.database-design": "hx arch check --task database-design",
    "arch.interface-design": "hx arch check --task interface-design",
    "arch.key-mechanisms": "hx arch check --task key-mechanisms",
    "arch.internal-interface": 'hx arch lld init <module> --title "..."',
    "test.test-case-design": "hx test-cases init <change>",
    "test.test-execution": "hx test report init <change>"
  };
  for (const stage of ["req", "arch", "dev", "test"] as DeliveryStage[]) {
    for (const t of STAGE_TASKS[stage]) {
      const key = `${stage}.${t.id}`;
      const run =
        orgRuns[key] ??
        (stage === "dev" || stage === "test"
          ? `hx ${stage === "dev" ? "dev" : "test"} ${t.id.replace(/-/g, " ")} <change>`
          : `hx ${stage} ${t.id}`);
      commands.push({
        name: slashName(stage, t.id),
        description: STAGE_COMMAND_DESCRIPTIONS[key] ?? t.title.en,
        run,
        stage,
        task: t.id
      });
    }
  }
  return commands;
}

export function collectCommands(ws: Workspace): CommandDef[] {
  const harness = ws.readHarness();
  const commands = standardCommands();
  for (const g of harness.guides) {
    if (g.kind !== "guide.command") continue;
    const f = path.join(ws.base, g.source);
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, "utf8");
    const task = g.task ?? g.stage;
    const name = slashName(g.stage, task);
    const existing = commands.find((c) => c.name === name);
    if (existing) existing.prompt = content;
    else {
      commands.push({
        name,
        description: `${g.stage}/${task} workflow`,
        run: `hx ${g.stage} ${task}`,
        stage: g.stage,
        task,
        prompt: content
      });
    }
  }
  for (const c of commands) {
    c.appendix = enrichCommandAppendix(ws, c);
  }
  return commands;
}

/** Skills/templates bound to this stage/task (same match as guidesForTask; excludes commands). */
export function boundGuidesForCommand(ws: Workspace, stage: DeliveryStage, task: string): GuideDef[] {
  const harness = ws.readHarness();
  return harness.guides
    .filter(
      (g) =>
        (g.kind === "guide.skill" || g.kind === "guide.template") &&
        g.stage === stage &&
        (!g.task || g.task === task)
    )
    .sort((a, b) => {
      const pd = (b.priority ?? 0) - (a.priority ?? 0);
      return pd !== 0 ? pd : a.id.localeCompare(b.id);
    });
}

function packLoadStep(c: CommandDef): string {
  const { stage, task } = c;
  if (stage === "dev" && task === "apply") {
    return [
      "### 特别上下文 — Load context",
      "1. For each unchecked task: `hx guide task-pack <change> <taskId>` (or read `tasks/<taskId>-pack.md`).",
      "2. Then follow the Bound Skills below (and Templates if any).",
      "Resolve `<change>` / `<taskId>` from the slash-command argument or user message; if missing, ask the user first."
    ].join("\n");
  }
  if (stage === "req") {
    return [
      "### 特别上下文 — Load context",
      "1. Run: `hx guide prd-pack <slug>` (optionally `--out …`).",
      "2. Read the full Context Pack (constitution, bound guides, PRD artifacts).",
      "Resolve `<slug>` from the slash-command argument or user message; if missing, ask the user first."
    ].join("\n");
  }
  if (stage === "arch") {
    return [
      "### 特别上下文 — Load context",
      "1. Run: `hx guide arch-pack` (add `--module <id>` for LLD-scoped work).",
      "2. Read the full Context Pack (constitution, bound guides, architecture artifacts).",
      "If a module id is required and not provided, ask the user first."
    ].join("\n");
  }
  return [
    "### 特别上下文 — Load context",
    `1. Run: \`hx guide pack <change> --stage ${stage} --task ${task}\` (optionally \`--out harnessX/changes/<change>/.pack.md\`).`,
    "2. Read the full Context Pack (constitution, bound guides, change artifacts).",
    "Resolve `<change>` from the slash-command argument or user message; if missing, ask the user first."
  ].join("\n");
}

function formatGuideTable(guides: GuideDef[], kindLabel: string): string {
  if (!guides.length) return "";
  const lines = [
    `### Bound ${kindLabel}`,
    "",
    "| id | kind | source |",
    "|----|------|--------|",
    ...guides.map((g) => `| \`${g.id}\` | ${g.kind} | \`${g.source}\` |`)
  ];
  return lines.join("\n");
}

function selectionGuidance(skills: GuideDef[], templates: GuideDef[]): string {
  const parts: string[] = ["### How to use bound guides"];

  if (skills.length === 0 && templates.length === 0) {
    parts.push("No skill or template assets are bound to this task.");
    return parts.join("\n");
  }

  if (skills.length === 1) {
    parts.push(`- **Skill:** Follow \`${skills[0]!.id}\` from the Context Pack / \`.cursor/skills/\`.`);
  } else if (skills.length > 1) {
    parts.push(
      `- **Skills (${skills.length}):** You may apply more than one when relevant. Prefer by domain fit and \`priority\`.`,
      `- **If the user did not specify which skills to prioritize:** ask before writing deliverables, e.g.`,
      `  > This task has multiple skills (${skills.map((s) => `\`${s.id}\``).join(", ")}). Which should I prioritize? I recommend …`
    );
  }

  if (templates.length === 1) {
    parts.push(`- **Template:** Structure the deliverable using \`${templates[0]!.id}\`.`);
  } else if (templates.length > 1) {
    parts.push(
      `- **Templates (${templates.length}):** Normally pick **one** output shape.`,
      `- **If the user did not specify a template:** ask before writing deliverables, e.g.`,
      `  > This task has multiple templates (${templates.map((t) => `\`${t.id}\``).join(", ")}). Which one should I use? I recommend …`
    );
  }

  parts.push(
    "- Do not invent a fourth structure when a bound template exists; extend the chosen template instead.",
    "- After the user confirms (when asked), proceed; if they already named an id in the message, use that without re-asking."
  );
  return parts.join("\n");
}

function gateReminder(c: CommandDef): string {
  const { stage, task } = c;
  if (stage === "dev" || stage === "test") {
    return [
      "### 特别约束 — Gate",
      `Before claiming done: \`hx gate check <change> --stage ${stage} --task ${task}\` — do not finish until green.`,
      "Cursor stop-hook may auto-run this gate after a slash turn; if blocked and actionable, iterate fixes. If blocked by approvals/missing inputs, stop and ask the user."
    ].join("\n");
  }
  if (stage === "req") {
    return [
      "### 特别约束 — Gate",
      `Before claiming done: \`hx gate check --stage req --task ${task}\` (or \`hx req check --task ${task}\`) — do not finish until green.`
    ].join("\n");
  }
  return [
    "### 特别约束 — Gate",
    `Before claiming done: \`hx arch check --task ${task}\` (or \`hx gate check --stage arch --task ${task}\`) — do not finish until green.`
  ].join("\n");
}

function boundSensorsSection(ws: Workspace, c: CommandDef): string {
  try {
    const harness = ws.readHarness();
    const profile = ws.readConfig().profile;
    const suiteName = resolveSuiteName(harness, profile, c.stage, c.task);
    const sensors = resolveSuiteSensors(harness, profile, c.stage, c.task);
    const lines = ["### 特别约束 — Sensors (auto from profile suite)", ""];
    if (!suiteName) {
      lines.push(`No suite bound for \`${c.stage}.${c.task}\` in profile \`${profile}\`.`);
      return lines.join("\n");
    }
    lines.push(`Suite: \`${suiteName}\``);
    if (!sensors.length) {
      lines.push("Suite is empty (no sensors registered).");
    } else {
      lines.push("", "| sensor |", "|--------|", ...sensors.map((id) => `| \`${id}\` |`));
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/** Compile-time appendix: pack load + bound skills/templates + suite sensors + gate. */
export function enrichCommandAppendix(ws: Workspace, c: CommandDef): string {
  const bound = boundGuidesForCommand(ws, c.stage, c.task);
  const skills = bound.filter((g) => g.kind === "guide.skill");
  const templates = bound.filter((g) => g.kind === "guide.template");

  const sections = [
    BOUND_GUIDES_MARKER,
    "",
    "## 特别上下文 / 特别约束（adapter sync 自动注入）",
    "",
    packLoadStep(c),
    ""
  ];

  const skillTable = formatGuideTable(skills, "Skills");
  const tplTable = formatGuideTable(templates, "Templates");
  if (skillTable) sections.push(skillTable, "");
  if (tplTable) sections.push(tplTable, "");
  sections.push(selectionGuidance(skills, templates), "");

  const sensors = boundSensorsSection(ws, c);
  if (sensors) sections.push(sensors, "");
  sections.push(gateReminder(c), "");

  return sections.join("\n").trimEnd() + "\n";
}

export function commandBody(c: CommandDef): string {
  const appendix = c.appendix?.trim() ? `\n\n${c.appendix.trim()}\n` : "";
  if (c.prompt) return `${c.prompt.trimEnd()}${appendix}\nCLI entry point: \`${c.run}\`\n`;
  return `# ${c.name}\n\n${c.description}\n\nRun:\n\n\`\`\`bash\n${c.run}\n\`\`\`${appendix}\n`;
}

export interface SkillFile {
  rel: string;
  content: string;
}

export interface SkillSource {
  id: string;
  root: string;
  content: string;
  files: SkillFile[];
}

/** Inline SKILL.md plus resource appendix for flat rule/skill targets. */
export function skillInlineBody(skill: SkillSource): string {
  const appendix = formatSkillResourceAppendix(skill.id, { files: skill.files, entryRel: "SKILL.md" });
  return appendix ? `${skill.content.trimEnd()}\n\n${appendix}` : skill.content;
}

export function collectSkills(ws: Workspace): SkillSource[] {
  const harness = ws.readHarness();
  const out: SkillSource[] = [];
  for (const g of harness.guides) {
    if (g.kind !== "guide.skill") continue;
    try {
      const pkg = loadSkillPackage(ws.base, g.source);
      out.push({
        id: g.id,
        root: pkg.rootRel,
        content: pkg.entryContent,
        files: pkg.files
      });
      continue;
    } catch {
      /* legacy single-file source */
    }
    const f = path.join(ws.base, g.source);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) continue;
    const content = fs.readFileSync(f, "utf8");
    const root = path.dirname(path.relative(ws.base, f)).replace(/\\/g, "/");
    out.push({ id: g.id, root, content, files: [{ rel: "SKILL.md", content }] });
  }
  return out;
}

export function rulesDigest(ws: Workspace): string {
  const parts: string[] = [];
  if (fs.existsSync(ws.constitutionFile)) {
    parts.push("## Constitution (highest priority)", fs.readFileSync(ws.constitutionFile, "utf8"));
  }
  parts.push(
    "## HarnessX ground rules",
    "- Work inside a change workspace; never edit harnessX/specs/ directly.",
    "- Never edit meta.yaml, harness.lock, fixtures.lock or approved fixtures by hand.",
    "- When a sensor fails, read fix_hint/agent_instruction before editing code.",
    "- Run `hx gate check <change> --stage <s> --task <t>` before claiming a task is complete."
  );
  return parts.join("\n\n");
}

export function withHeader(content: string, sourceNote: string, commentStyle: "html" | "hash" | "raw" = "html"): string {
  if (commentStyle === "raw") return content;
  const hash = sha256(content).slice(0, 16);
  const line = `GENERATED by harnessx adapter v${ADAPTER_VERSION} from ${sourceNote} — do not edit (hash:${hash})`;
  return commentStyle === "html" ? `<!-- ${line} -->\n${content}` : `# ${line}\n${content}`;
}

const HEADER_RE = /GENERATED by harnessx adapter v([\d.]+) from (.+?) — do not edit \(hash:([0-9a-f]{16})\)/;

export type DriftState = "ok" | "manually-edited" | "missing-header";

export function checkGeneratedFile(file: string): DriftState {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.match(HEADER_RE);
  if (!m) {
    if (file.endsWith(".json")) return "ok";
    return "missing-header";
  }
  const body = raw.split("\n").slice(1).join("\n");
  return sha256(body).slice(0, 16) === m[3] ? "ok" : "manually-edited";
}

export interface CompileResult {
  target: string;
  tier: Tier;
  files: string[];
  skipped: string[];
}

export type TargetEmitter = (ws: Workspace, ctx: EmitContext) => { files: string[]; skipped: string[] };

export interface EmitContext {
  commands: CommandDef[];
  skills: SkillSource[];
  rules: string;
  write: (rel: string, content: string, style?: "html" | "hash" | "raw", sourceNote?: string) => string;
}

export function makeEmitContext(ws: Workspace): Omit<EmitContext, "write"> {
  return { commands: collectCommands(ws), skills: collectSkills(ws), rules: rulesDigest(ws) };
}

export function compileTarget(ws: Workspace, target: string, emitter: TargetEmitter): CompileResult {
  const spec = TARGETS[target];
  if (!spec) throw new Error(`unknown adapter target: ${target}`);
  const files: string[] = [];
  const ctx: EmitContext = {
    ...makeEmitContext(ws),
    write: (rel, content, style = "html", sourceNote = "harnessX/assets") => {
      const abs = path.join(ws.root, rel);
      ensureDir(path.dirname(abs));
      fs.writeFileSync(abs, withHeader(content, sourceNote, style));
      files.push(rel);
      return rel;
    }
  };
  const res = emitter(ws, ctx);
  return { target, tier: computeTier(spec.capabilities), files: [...files, ...res.files], skipped: res.skipped };
}
