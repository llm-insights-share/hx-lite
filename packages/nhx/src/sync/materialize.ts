import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { ExportPayload, GuideExport } from "../api/client.js";
import { ensureNhxDir, lockPath, nhxRoot } from "../config.js";
import { pickPrimaryPackageFilename } from "../guide_package.js";
import { DEFAULT_PATH_LAYOUT, parsePathLayout } from "../path_layout.js";
import { assembleShell } from "../shell/assemble.js";

function splitGuides(gids: string[], guidesById: Map<string, GuideExport>): {
  skills: string[];
  templates: string[];
} {
  const skills: string[] = [];
  const templates: string[] = [];
  for (const gid of gids) {
    if (gid.startsWith("wf-")) continue;
    const g = guidesById.get(gid);
    const kind = g?.kind || "";
    if (kind === "guide.workflow" || kind === "guide.command") continue;
    if (
      kind === "guide.template" ||
      gid.includes("template") ||
      gid.endsWith("-outline") ||
      gid.endsWith("-checklist")
    ) {
      templates.push(gid);
    } else {
      skills.push(gid);
    }
  }
  return { skills, templates };
}

/** Split leading YAML frontmatter; body is the rest (may be empty). */
export function splitSkillFrontmatter(content: string): {
  data: Record<string, unknown> | null;
  body: string;
} {
  const text = (content || "").replace(/^\uFEFF/, "");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: text };
  try {
    const data = (yaml.parse(m[1]) || {}) as Record<string, unknown>;
    return { data, body: m[2] ?? "" };
  } catch {
    return { data: null, body: text };
  }
}

/**
 * Always emit description as a folded block scalar (`description: >`).
 * Indent each line by 2 spaces per YAML block-scalar rules.
 */
export function formatDescriptionFolded(description: string): string {
  const normalized = String(description || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\n+|\n+$/g, "");
  const lines = normalized.length ? normalized.split("\n") : [""];
  const body = lines.map((line) => `  ${line}`).join("\n");
  return `description: >\n${body}`;
}

/**
 * Build a single Agent Skills SKILL.md. If `content` already has frontmatter,
 * keep its description (and other fields ignored) and use `name` as the skill id
 * so it matches the folder name — never emit two `---` blocks.
 * Frontmatter always uses `description: >` (folded block scalar).
 */
export function buildSkillMarkdown(name: string, fallbackDescription: string, content: string): string {
  const { data, body } = splitSkillFrontmatter(content);
  const fromContent =
    data && data.description != null ? String(data.description).trim() : "";
  const description = fromContent || fallbackDescription || `nhx skill ${name}`;
  const fm = `name: ${name}\n${formatDescriptionFolded(description)}`;
  const rest = body.replace(/^\r?\n+/, "");
  return `---\n${fm}\n---\n\n${rest}`.replace(/\s+$/, "\n");
}

function writeSkillShell(skillsDir: string, id: string, description: string, full: string): void {
  const dir = path.join(skillsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), buildSkillMarkdown(id, description, full), "utf8");
}

function safeRelPath(raw: string): string {
  const rel = (raw || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel || rel.split("/").includes("..")) return "";
  return rel;
}

/**
 * Skill packages are usually stored under one wrapper folder named after the original
 * skill dir (`business-concept-modeler/SKILL.md`, `business-concept-modeler/references/…`).
 * Return that shared root so it can be stripped, keeping `references/x.md` resolvable
 * relative to SKILL.md.
 */
export function commonPackageRoot(paths: string[]): string {
  const segs = paths.map((p) => safeRelPath(p)).filter(Boolean).map((p) => p.split("/"));
  if (!segs.length || segs.some((s) => s.length < 2)) return "";
  const first = segs[0][0];
  return segs.every((s) => s[0] === first) ? first : "";
}

function writeGuidePackageBlobs(guidesDir: string, g: GuideExport): void {
  const blobs = g.package_blobs || [];
  if (!blobs.length) return;
  const pkgDir = path.join(guidesDir, g.asset_id);
  fs.mkdirSync(pkgDir, { recursive: true });
  for (const blob of blobs) {
    const rel = safeRelPath(blob.path || "");
    if (!rel) continue;
    const dest = path.join(pkgDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(blob.content_base64 || "", "base64"));
  }
}

/**
 * Copy a skill package's companion files (references/, scripts/, assets/ …) next to SKILL.md.
 * SKILL.md itself is skipped — it is regenerated from `content` with normalized frontmatter.
 */
function writeSkillPackageAssets(skillDir: string, g: GuideExport): number {
  const blobs = g.package_blobs || [];
  if (!blobs.length) return 0;
  const root = commonPackageRoot(blobs.map((b) => b.path || ""));
  let written = 0;
  for (const blob of blobs) {
    let rel = safeRelPath(blob.path || "");
    if (!rel) continue;
    if (root) {
      if (rel === root) continue;
      if (rel.startsWith(`${root}/`)) rel = rel.slice(root.length + 1);
    }
    if (!rel || rel.toLowerCase() === "skill.md") continue;
    const dest = path.join(skillDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(blob.content_base64 || "", "base64"));
    written++;
  }
  return written;
}

function templatePrimaryFilesForTask(
  templates: string[],
  guidesById: Map<string, GuideExport>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tid of templates) {
    const g = guidesById.get(tid);
    if (!g) continue;
    const primary =
      (g.primary_file || "").trim() ||
      pickPrimaryPackageFilename(g.package_files || [], g.kind || "");
    if (primary) out[tid] = primary;
  }
  return out;
}

export function materializeExport(
  payload: ExportPayload,
  opts: { prune?: boolean; cwd?: string } = {},
): {
  commands: number;
  guides: number;
  sensors: number;
  skills: number;
  skill_shells: number;
} {
  const cwd = opts.cwd || process.cwd();
  const root = ensureNhxDir(cwd);
  const guidesById = new Map(payload.guides.map((g) => [g.asset_id, g]));

  // write guides (skip leftover workflow)
  const guidesDir = path.join(root, "guides");
  if (opts.prune) {
    for (const f of fs.readdirSync(guidesDir)) {
      const full = path.join(guidesDir, f);
      fs.rmSync(full, { recursive: true, force: true });
    }
  }
  for (const g of payload.guides) {
    if ((g.kind || "") === "guide.workflow" || (g.asset_id || "").startsWith("wf-")) continue;
    fs.writeFileSync(path.join(guidesDir, `${g.asset_id}.md`), g.content || "", "utf8");
    writeGuidePackageBlobs(guidesDir, g);
  }

  // write sensors + meta
  const sensorsDir = path.join(root, "sensors");
  if (opts.prune) {
    for (const f of fs.readdirSync(sensorsDir)) fs.unlinkSync(path.join(sensorsDir, f));
  }
  for (const s of payload.sensors) {
    fs.writeFileSync(path.join(sensorsDir, `${s.asset_id}.md`), s.content || "", "utf8");
    fs.writeFileSync(
      path.join(sensorsDir, `${s.asset_id}.meta.json`),
      JSON.stringify(
        {
          asset_id: s.asset_id,
          check_type: s.check_type || "inline",
          kind: s.kind,
          triggers: s.triggers?.length ? s.triggers : ["hook:stop", "cli", "task-shell"],
          scope: s.scope || [],
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const sensorsById = new Map(payload.sensors.map((s) => [s.asset_id, s]));

  const tasksIndex = payload.tasks.map((t) => ({
    stage: t.stage,
    id: t.id,
    sensors: t.sensors || [],
    guides: t.guides || [],
    slash_name: t.slash_name,
  }));
  fs.writeFileSync(path.join(root, "tasks.json"), JSON.stringify(tasksIndex, null, 2), "utf8");

  const pathLayout = parsePathLayout(payload.path_layout || DEFAULT_PATH_LAYOUT);
  fs.writeFileSync(path.join(root, "path_layout.json"), JSON.stringify(pathLayout, null, 2), "utf8");

  // domain skills from guides (not task shells)
  const skillsDir = path.join(root, "skills");
  if (opts.prune && fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      fs.rmSync(path.join(skillsDir, name), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(skillsDir, { recursive: true });
  let skillCount = 0;
  for (const g of payload.guides) {
    if (g.kind === "guide.workflow" || g.kind === "guide.command") continue;
    if (g.kind === "guide.template") continue;
    if ((g.asset_id || "").startsWith("wf-")) continue;
    const dir = path.join(skillsDir, g.asset_id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      buildSkillMarkdown(g.asset_id, `nhx skill ${g.asset_id}`, g.content || ""),
      "utf8",
    );
    writeSkillPackageAssets(dir, g);
    skillCount++;
  }

  // task shells → commands/ and/or skills/nhx-* (Skill Shell)
  const commandsDir = path.join(root, "commands");
  if (opts.prune) {
    for (const f of fs.readdirSync(commandsDir)) fs.unlinkSync(path.join(commandsDir, f));
  }
  let cmdCount = 0;
  let skillShellCount = 0;
  for (const t of payload.tasks) {
    const { skills, templates } = splitGuides(t.guides || [], guidesById);
    if (t.id && !skills.includes(t.id) && guidesById.has(t.id)) skills.unshift(t.id);
    const sensorDetails = (t.sensors || []).map((id) => {
      const s = sensorsById.get(id);
      return {
        id,
        check_type: s?.check_type || "inline",
        content: s?.content || "",
        triggers: s?.triggers?.length ? s.triggers : ["hook:stop", "cli", "task-shell"],
      };
    });
    const body = (t.shell_body || t.workflow_body || "").trim();
    const templatePrimaryFiles = templatePrimaryFilesForTask(templates, guidesById);
    const shell = assembleShell({
      stage: t.stage,
      task: t.id,
      title: t.title || t.id,
      body: body || undefined,
      guides: skills,
      templates,
      sensors: t.sensors || [],
      sensorDetails,
      pathLayout,
      templatePrimaryFiles,
    });
    // Prefer org appendix when present and still aligned with template primary/extension;
    // otherwise rebuild locally so extension hints stay current.
    const orgAppendix = (t.shell_appendix || "").trim();
    const primaryValues = Object.values(templatePrimaryFiles);
    const orgAligned =
      Boolean(orgAppendix) &&
      (primaryValues.length === 0 ||
        primaryValues.some((p) => orgAppendix.includes(p)) ||
        primaryValues.some((p) => {
          const ext = p.includes(".") ? p.split(".").pop() || "" : "";
          return Boolean(ext) && orgAppendix.includes(`.${ext}`);
        }));
    const full =
      orgAligned && body && !body.includes("<!-- nhx:bound-guides -->")
        ? `${shell.body}\n\n${orgAppendix}`.trim() + "\n"
        : shell.full;
    const name = t.slash_name || shell.slash_name;

    fs.writeFileSync(path.join(commandsDir, `${name}.md`), full, "utf8");
    cmdCount++;
    writeSkillShell(skillsDir, name, t.title || `nhx task shell ${name}`, full);
    skillShellCount++;
  }

  const lock = {
    synced_at: new Date().toISOString(),
    project: payload.project,
    stages_filter: payload.stages_filter,
    counts: {
      ...payload.counts,
      commands: cmdCount,
      skills: skillCount,
      skill_shells: skillShellCount,
    },
  };
  fs.writeFileSync(lockPath(cwd), JSON.stringify(lock, null, 2), "utf8");

  return {
    commands: cmdCount,
    guides: payload.guides.length,
    sensors: payload.sensors.length,
    skills: skillCount,
    skill_shells: skillShellCount,
  };
}

export function listLocalCommands(cwd = process.cwd()): string[] {
  const dir = path.join(nhxRoot(cwd), "commands");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}
