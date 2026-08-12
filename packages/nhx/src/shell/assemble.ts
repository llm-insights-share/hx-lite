/** Lightweight TaskShell assembler for nhx (independent of hx core). */

import { buildRulesAgentPrompt, parseRulesContent } from "../sensor/check.js";
import { formatPathLayoutSection, type PathLayout } from "../path_layout.js";

const BOUND_MARKER = "<!-- nhx:bound-guides -->";

export function slashName(stage: string, task: string): string {
  return `nhx-${stage}-${task.replace(/_/g, "-")}`;
}

function packLoadStep(stage: string, task: string): string {
  return [
    "### Context — Load",
    `1. Load Context Pack for stage \`${stage}\` task \`${task}\`.`,
    "2. Read constitution, bound guides, and related artifacts.",
  ].join("\n");
}

function gateReminder(stage: string, task: string, sensors: string[] = []): string {
  const lines = [
    "### 特别约束 — 门禁",
    `宣称完成前：执行 \`nhx check --stage ${stage} --task ${task}\`，未通过不得结束（本地无独立 gate 命令）。`,
  ];
  const hasHuman = sensors.some(
    (s) =>
      /human|manual|approv/i.test(s) ||
      s.endsWith("-approved") ||
      s.endsWith("-approval"),
  );
  if (hasHuman) {
    lines.push(
      "",
      "### 特别约束 — 人工审批（必须按序）",
      `1. 完成本地产物后**先上传**：\`nhx submit <本地路径> --name <产物名> --stage ${stage} --task ${task}\``,
      `2. **再**创建审批工单：\`nhx approve request --stage ${stage} --task ${task} --artifact <产物名>\``,
      "3. 在 WebUI「审批工单」批准后，再运行 `nhx check`。",
      "禁止在未 `nhx submit` 的情况下直接 `approve request`。",
    );
  }
  return lines.join("\n");
}

export type SensorShellInfo = {
  id: string;
  check_type?: string;
  content?: string;
  triggers?: string[];
};

function qualityRulesSection(sensors: SensorShellInfo[]): string {
  const rules = sensors.filter((s) => {
    const ct = (s.check_type || "").toLowerCase();
    if (ct !== "rules") return false;
    const triggers = s.triggers || [];
    if (triggers.length && !triggers.includes("task-shell")) return false;
    const { rulesText } = parseRulesContent(s.content || "");
    return Boolean(rulesText.trim());
  });
  if (!rules.length) return "";
  const blocks = rules.map((s) => buildRulesAgentPrompt(s.id, s.content || ""));
  return [
    "### Quality Rules（由你作为 Agent 对照产物评判）",
    "",
    ...blocks,
    "",
  ].join("\n");
}

export function assembleAppendix(opts: {
  stage: string;
  task: string;
  guides: string[];
  templates: string[];
  sensors: string[];
  sensorDetails?: SensorShellInfo[];
  otherGuides?: Array<{ id: string; kind: string }>;
  pathLayout?: PathLayout | null;
  templatePrimaryFiles?: Record<string, string>;
}): string {
  const otherGuides = opts.otherGuides || [];
  const templatePrimaryFiles = opts.templatePrimaryFiles || {};
  const skillRows =
    opts.guides.map((g) => `| \`${g}\` | guide.skill | |`).join("\n") || "| — | — | — |";
  const tplRows =
    opts.templates.map((t) => `| \`${t}\` | guide.template | |`).join("\n") || "| — | — | — |";
  const otherRows =
    otherGuides.map((g) => `| \`${g.id}\` | \`${g.kind}\` | |`).join("\n") || "| — | — | — |";
  const sensorRows =
    opts.sensors.map((s) => `| \`${s}\` |`).join("\n") || "| — |";

  const selection = ["### How to use bound guides"];
  if (opts.guides.length === 1) selection.push(`- **Skill:** Follow \`${opts.guides[0]}\`.`);
  else if (opts.guides.length > 1)
    selection.push(
      `- **Skills (${opts.guides.length}):** Prefer by domain fit; ask user which to prioritize if unclear.`,
    );
  else selection.push("- No skill assets bound.");

  let deliverableExt = "md";
  if (opts.templates.length === 1) {
    const tid = opts.templates[0];
    const primary = (templatePrimaryFiles[tid] || "").trim();
    if (primary) {
      const ext = primary.includes(".") ? primary.split(".").pop() : "";
      if (ext) deliverableExt = ext;
      const extHint = ext ? ` (extension \`.${ext}\` must match)` : "";
      selection.push(
        `- **Template (required):** Deliverable MUST follow bound template \`${tid}\` format/structure; primary file \`${primary}\`${extHint}. Read the template before writing output.`,
      );
    } else {
      selection.push(
        `- **Template (required):** Deliverable MUST follow bound template \`${tid}\` format/structure. Read the template before writing output.`,
      );
    }
  } else if (opts.templates.length > 1) {
    const bits = opts.templates.map((tid) => {
      const primary = (templatePrimaryFiles[tid] || "").trim();
      return primary ? `\`${tid}\` (see \`${primary}\`)` : `\`${tid}\``;
    });
    selection.push(
      `- **Templates (${opts.templates.length}, required):** Normally pick **one** output shape (${bits.join(", ")}); match that template's format/structure; ask if unclear.`,
    );
  }

  if (otherGuides.length === 1)
    selection.push(
      `- **Other Guide (\`${otherGuides[0].kind}\`):** Follow \`${otherGuides[0].id}\`.`,
    );
  else if (otherGuides.length > 1)
    selection.push(
      `- **Other Guides (${otherGuides.length}):** Apply by kind (constraint/exemplar/scaffold/…); ask if unclear.`,
    );

  const details =
    opts.sensorDetails ||
    opts.sensors.map((id) => ({ id, check_type: "", content: "", triggers: [] as string[] }));
  const quality = qualityRulesSection(details);
  const pathSection = formatPathLayoutSection(
    opts.stage,
    opts.task,
    opts.pathLayout,
    deliverableExt,
  );

  return [
    BOUND_MARKER,
    "",
    "## Context / Constraints (auto-injected by nhx)",
    "",
    packLoadStep(opts.stage, opts.task),
    "",
    pathSection,
    "### Bound Skills",
    "",
    "| id | kind | source |",
    "|----|------|--------|",
    skillRows,
    "",
    "### Bound Templates",
    "",
    "| id | kind | source |",
    "|----|------|--------|",
    tplRows,
    "",
    "### Other Guides",
    "",
    "| id | kind | source |",
    "|----|------|--------|",
    otherRows,
    "",
    selection.join("\n"),
    "",
    "### Bound Checks（任务直接绑定）",
    "",
    "| check |",
    "|--------|",
    sensorRows,
    "",
    quality,
    "### Check 检查（command/skill 壳）",
    "",
    `完成本任务产物后运行：\`nhx check --stage ${opts.stage} --task ${opts.task}\``,
    "",
    "- IDE hooks：`beforeSubmit`（提醒）/ `afterFileEdit`（按 scope）/ `stop`（回合结束）。",
    "- **rules**：文本规则注入本壳与 hook 提示，由对话模型评判；本地不跑 LLM。文件存在请用 **inline** `file.exists`。",
    "- **human** 关卡：须先 `nhx submit` 上传产物，再 `nhx approve request`；未批准时仅提醒，不做文件/脚本检查。",
    "",
    gateReminder(opts.stage, opts.task, opts.sensors),
    "",
  ].join("\n");
}

export function defaultWorkflowBody(stage: string, task: string, title: string): string {
  const name = slashName(stage, task);
  return [
    `# /${name} — ${title}`,
    "",
    `You are running the **${stage}** stage task \`${task}\`.`,
    "",
    "## Input",
    "- Resolve identifiers from the slash-command argument or user message.",
    "",
    "## Steps",
    "1. Load the Context Pack for this stage/task.",
    "2. Follow bound Skills / Templates.",
    "3. Produce the deliverable for this task.",
    "",
    "## Output",
    "- Task deliverables MUST follow bound templates' format and structure (see appendix).",
    "",
    "## Done when",
    "- Gate / checks for this stage/task are green.",
  ].join("\n");
}

export function assembleShell(opts: {
  stage: string;
  task: string;
  title: string;
  body?: string;
  guides: string[];
  templates: string[];
  sensors: string[];
  sensorDetails?: SensorShellInfo[];
  otherGuides?: Array<{ id: string; kind: string }>;
  pathLayout?: PathLayout | null;
  templatePrimaryFiles?: Record<string, string>;
}): { slash_name: string; body: string; appendix: string; full: string } {
  const slash_name = slashName(opts.stage, opts.task);
  const body = (opts.body || defaultWorkflowBody(opts.stage, opts.task, opts.title)).trim();
  const appendix = assembleAppendix(opts);
  return { slash_name, body, appendix, full: `${body}\n\n${appendix}` };
}
