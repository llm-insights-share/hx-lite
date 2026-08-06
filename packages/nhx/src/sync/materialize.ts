import fs from "node:fs";
import path from "node:path";
import type { ExportPayload, GuideExport } from "../api/client.js";
import { ensureNhxDir, lockPath, nhxRoot } from "../config.js";
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

function writeSkillShell(skillsDir: string, id: string, description: string, full: string): void {
  const dir = path.join(skillsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const front = ["---", `name: ${id}`, `description: ${description}`, "---", ""].join("\n");
  fs.writeFileSync(path.join(dir, "SKILL.md"), front + full, "utf8");
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
    for (const f of fs.readdirSync(guidesDir)) fs.unlinkSync(path.join(guidesDir, f));
  }
  for (const g of payload.guides) {
    if ((g.kind || "") === "guide.workflow" || (g.asset_id || "").startsWith("wf-")) continue;
    fs.writeFileSync(path.join(guidesDir, `${g.asset_id}.md`), g.content || "", "utf8");
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
    fs.mkdirSync(dir, { recursive: true });
    const front = [
      "---",
      `name: ${g.asset_id}`,
      `description: nhx skill ${g.asset_id}`,
      "---",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(dir, "SKILL.md"), front + (g.content || ""), "utf8");
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
    });
    // Prefer org appendix when provided and body already stored without appendix
    const full =
      t.shell_appendix && body && !body.includes("<!-- nhx:bound-guides -->")
        ? `${shell.body}\n\n${t.shell_appendix}`.trim() + "\n"
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
