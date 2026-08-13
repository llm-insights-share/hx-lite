import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { GENERATED_MARKER, nhxRoot, type InstallScope } from "../config.js";
import { formatDescriptionFolded, splitSkillFrontmatter } from "../sync/materialize.js";
import { syncCursorHooks } from "./hooks.js";
import { syncTraeHooks, type TraeHookIde } from "./trae-hooks.js";
import { syncCodeBuddyHooks, codeBuddyDirName, codeBuddyHomeDir, type CodeBuddyIde } from "./codebuddy-hooks.js";
import { qoderHomeDir, syncQoderHooks } from "./qoder-hooks.js";

export type AdapterSyncOpts = {
  scope?: InstallScope;
  /** Override homedir (tests). Default: os.homedir(). */
  home?: string;
  /** Trae product dir under base: `.trae` (intl) or `.trae-cn` (China). */
  traeDir?: ".trae" | ".trae-cn";
  /** Env for QODER_CONFIG_DIR (tests). Default: process.env. */
  env?: NodeJS.ProcessEnv;
};

export type IdeInstallRoots = {
  scope: InstallScope;
  cursorCommands: string;
  cursorSkills: string;
  traeSkills: string;
  codebuddyCommands: string;
  codebuddySkills: string;
  qoderCommands: string;
  qoderSkills: string;
  traeDir: ".trae" | ".trae-cn";
  codeBuddyIde: CodeBuddyIde;
};

export function ideInstallRoots(
  scope: InstallScope = "project",
  cwd = process.cwd(),
  home = os.homedir(),
  traeDir: ".trae" | ".trae-cn" = ".trae",
  codeBuddyIde: CodeBuddyIde = "codebuddy",
  env: NodeJS.ProcessEnv = process.env,
): IdeInstallRoots {
  const base = scope === "global" ? home : cwd;
  const codeBuddyBase =
    scope === "global" ? codeBuddyHomeDir(codeBuddyIde, home) : path.join(cwd, ".codebuddy");
  const qoderBase = scope === "global" ? qoderHomeDir(home, env) : path.join(cwd, ".qoder");
  return {
    scope,
    cursorCommands: path.join(base, ".cursor", "commands"),
    cursorSkills: path.join(base, ".cursor", "skills"),
    traeSkills: path.join(base, traeDir, "skills"),
    codebuddyCommands: path.join(codeBuddyBase, "commands"),
    codebuddySkills: path.join(codeBuddyBase, "skills"),
    qoderCommands: path.join(qoderBase, "commands"),
    qoderSkills: path.join(qoderBase, "skills"),
    traeDir,
    codeBuddyIde,
  };
}

/** Header path label: `.cursor/...` or `~/.cursor/...`. */
export function destLabel(scope: InstallScope, ideRel: string): string {
  return scope === "global" ? `~/${ideRel}` : ideRel;
}

function hashContent(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function header(rel: string, content: string): string {
  return `<!-- ${GENERATED_MARKER} ${rel} (hash:${hashContent(content)}) -->\n`;
}

/**
 * Qoder commands require YAML frontmatter starting at line 1.
 * Embed the GENERATED marker as a YAML comment so isNhxGenerated still works.
 */
export function qoderCommandDoc(
  id: string,
  body: string,
  label: string,
  description?: string,
): string {
  const desc = (description || "").trim() || `nhx task shell ${id}`;
  const markerLine = `# ${GENERATED_MARKER} ${label} (hash:${hashContent(body)})`;
  return `---\n${markerLine}\nname: ${id}\n${formatDescriptionFolded(desc)}\n---\n\n${body.replace(/^\r?\n+/, "")}`.replace(
    /\s+$/,
    "\n",
  );
}

function descriptionFromSkillShell(skillSrc: string, id: string): string | undefined {
  const skillFile = path.join(skillSrc, id, "SKILL.md");
  if (!fs.existsSync(skillFile)) return undefined;
  const { data } = splitSkillFrontmatter(fs.readFileSync(skillFile, "utf8"));
  if (data && data.description != null) {
    const d = String(data.description).trim();
    if (d) return d;
  }
  return undefined;
}

export function isNhxGenerated(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  const head = fs.readFileSync(file, "utf8").slice(0, 200);
  return head.includes(GENERATED_MARKER);
}

function cleanNhxFiles(dir: string, pred: (name: string) => boolean): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (pred(name) && isNhxGenerated(path.join(full, "SKILL.md"))) {
        fs.rmSync(full, { recursive: true, force: true });
      }
      continue;
    }
    if (pred(name) && isNhxGenerated(full)) fs.unlinkSync(full);
  }
}

/** Copy a whole skill dir so companion files (references/, scripts/ …) reach the IDE. */
function copySkillDir(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) copySkillDir(src, dest);
    else if (entry.isFile()) fs.copyFileSync(src, dest);
  }
}

function listManagedSkillNames(skillSrc: string, cmdSrc?: string): Set<string> {
  const names = new Set<string>();
  if (fs.existsSync(skillSrc)) {
    for (const name of fs.readdirSync(skillSrc)) {
      if (fs.existsSync(path.join(skillSrc, name, "SKILL.md"))) names.add(name);
    }
  }
  if (cmdSrc && fs.existsSync(cmdSrc)) {
    for (const f of fs.readdirSync(cmdSrc).filter((x) => x.startsWith("nhx-") && x.endsWith(".md"))) {
      names.add(f.replace(/\.md$/, ""));
    }
  }
  return names;
}

/**
 * Remove skill dirs we manage: current sync names, legacy GENERATED marker, or nhx-* shells.
 * Does not strip user skills without the marker.
 */
function cleanManagedSkillDirs(skillDest: string, managedNames: Set<string>): void {
  if (!fs.existsSync(skillDest)) return;
  for (const name of fs.readdirSync(skillDest)) {
    const dir = path.join(skillDest, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const skillFile = path.join(dir, "SKILL.md");
    if (managedNames.has(name) || name.startsWith("nhx-") || isNhxGenerated(skillFile)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

export function countNhxCommandFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.startsWith("nhx-") && f.endsWith(".md")).length;
}

export function countNhxSkillDirs(dir: string, managedNames?: Set<string>): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const skillFile = path.join(dir, name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    if (isNhxGenerated(skillFile) || managedNames?.has(name) || name.startsWith("nhx-")) n++;
  }
  return n;
}

export function countAdapterProjection(
  scope: InstallScope,
  cwd = process.cwd(),
  home?: string,
  targets: string[] = ["cursor", "trae"],
): {
  scope: InstallScope;
  cursor_nhx_commands: number;
  cursor_nhx_skills: number;
  trae_nhx_skills: number;
  codebuddy_nhx_commands: number;
  codebuddy_nhx_skills: number;
  qoder_nhx_commands: number;
  qoder_nhx_skills: number;
  dest: IdeInstallRoots;
} {
  const h = home ?? os.homedir();
  const hasTrae = targets.includes("trae");
  const hasTraeCn = targets.includes("trae-cn");
  const hasCodebuddy = targets.includes("codebuddy");
  const hasWorkbuddy = targets.includes("workbuddy");
  const primaryTrae: ".trae" | ".trae-cn" = hasTraeCn && !hasTrae ? ".trae-cn" : ".trae";
  const primaryCodeBuddy: CodeBuddyIde =
    hasWorkbuddy && !hasCodebuddy ? "workbuddy" : "codebuddy";
  const dest = ideInstallRoots(scope, cwd, h, primaryTrae, primaryCodeBuddy);
  const nhx = nhxRoot(cwd);
  const managed = listManagedSkillNames(path.join(nhx, "skills"), path.join(nhx, "commands"));
  let traeSkills = 0;
  if (hasTrae) {
    traeSkills += countNhxSkillDirs(ideInstallRoots(scope, cwd, h, ".trae").traeSkills, managed);
  }
  if (hasTraeCn) {
    traeSkills += countNhxSkillDirs(ideInstallRoots(scope, cwd, h, ".trae-cn").traeSkills, managed);
  }
  if (!hasTrae && !hasTraeCn) {
    traeSkills = countNhxSkillDirs(dest.traeSkills, managed);
  }
  let codebuddyCommands = 0;
  let codebuddySkills = 0;
  if (hasCodebuddy || hasWorkbuddy) {
    const seenCmd = new Set<string>();
    const seenSkill = new Set<string>();
    for (const ide of (["codebuddy", "workbuddy"] as const).filter((t) => targets.includes(t))) {
      const roots = ideInstallRoots(scope, cwd, h, primaryTrae, ide);
      if (!seenCmd.has(roots.codebuddyCommands)) {
        seenCmd.add(roots.codebuddyCommands);
        codebuddyCommands += countNhxCommandFiles(roots.codebuddyCommands);
      }
      if (!seenSkill.has(roots.codebuddySkills)) {
        seenSkill.add(roots.codebuddySkills);
        codebuddySkills += countNhxSkillDirs(roots.codebuddySkills, managed);
      }
    }
  } else {
    codebuddyCommands = countNhxCommandFiles(dest.codebuddyCommands);
    codebuddySkills = countNhxSkillDirs(dest.codebuddySkills, managed);
  }
  return {
    scope,
    cursor_nhx_commands: countNhxCommandFiles(dest.cursorCommands),
    cursor_nhx_skills: countNhxSkillDirs(dest.cursorSkills, managed),
    trae_nhx_skills: traeSkills,
    codebuddy_nhx_commands: codebuddyCommands,
    codebuddy_nhx_skills: codebuddySkills,
    qoder_nhx_commands: countNhxCommandFiles(dest.qoderCommands),
    qoder_nhx_skills: countNhxSkillDirs(dest.qoderSkills, managed),
    dest,
  };
}

export function syncCursor(
  cwd = process.cwd(),
  opts: AdapterSyncOpts = {},
): { commands: number; skills: number; hooks?: unknown; scope: InstallScope; dest: string } {
  const scope = opts.scope || "project";
  const nhx = nhxRoot(cwd);
  const cmdSrc = path.join(nhx, "commands");
  const skillSrc = path.join(nhx, "skills");
  const roots = ideInstallRoots(scope, cwd, opts.home ?? os.homedir());
  const cmdDest = roots.cursorCommands;
  const skillDest = roots.cursorSkills;
  fs.mkdirSync(cmdDest, { recursive: true });
  fs.mkdirSync(skillDest, { recursive: true });

  // only remove previous nhx-generated nhx-* command files in the active dest
  cleanNhxFiles(cmdDest, (n) => n.startsWith("nhx-") && n.endsWith(".md"));
  cleanManagedSkillDirs(skillDest, listManagedSkillNames(skillSrc));

  let commands = 0;
  if (fs.existsSync(cmdSrc)) {
    for (const f of fs.readdirSync(cmdSrc).filter((x) => x.startsWith("nhx-") && x.endsWith(".md"))) {
      const body = fs.readFileSync(path.join(cmdSrc, f), "utf8");
      const label = destLabel(scope, `.cursor/commands/${f}`);
      const out = header(label, body) + body;
      fs.writeFileSync(path.join(cmdDest, f), out, "utf8");
      commands++;
    }
  }

  let skills = 0;
  if (fs.existsSync(skillSrc)) {
    for (const name of fs.readdirSync(skillSrc)) {
      const src = path.join(skillSrc, name, "SKILL.md");
      if (!fs.existsSync(src)) continue;
      // Skills: no GENERATED HTML comment — SKILL.md is copied as-is
      copySkillDir(path.join(skillSrc, name), path.join(skillDest, name));
      skills++;
    }
  }

  // Hooks always stay project-local (scripts use relative `.cursor/hooks/...` paths)
  const hooks = syncCursorHooks(cwd);

  return { commands, skills, hooks, scope, dest: skillDest };
}

export function syncTrae(
  cwd = process.cwd(),
  opts: AdapterSyncOpts = {},
): { skills: number; hooks?: unknown; scope: InstallScope; dest: string; traeDir: string } {
  const scope = opts.scope || "project";
  const traeDir = opts.traeDir || ".trae";
  const nhx = nhxRoot(cwd);
  const cmdSrc = path.join(nhx, "commands");
  const skillSrc = path.join(nhx, "skills");
  const roots = ideInstallRoots(scope, cwd, opts.home ?? os.homedir(), traeDir);
  const skillDest = roots.traeSkills;
  fs.mkdirSync(skillDest, { recursive: true });

  cleanManagedSkillDirs(skillDest, listManagedSkillNames(skillSrc, cmdSrc));

  let skills = 0;

  // Trae has no slash commands — emit task shells as skills/nhx-*/SKILL.md
  if (fs.existsSync(cmdSrc)) {
    for (const f of fs.readdirSync(cmdSrc).filter((x) => x.startsWith("nhx-") && x.endsWith(".md"))) {
      const id = f.replace(/\.md$/, "");
      const body = fs.readFileSync(path.join(cmdSrc, f), "utf8");
      const front = [
        "---",
        `name: ${id}`,
        "description: >",
        `  nhx task shell ${id}`,
        "---",
        "",
      ].join("\n");
      const full = front + body;
      const destDir = path.join(skillDest, id);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, "SKILL.md"), full, "utf8");
      skills++;
    }
  }

  if (fs.existsSync(skillSrc)) {
    for (const name of fs.readdirSync(skillSrc)) {
      const src = path.join(skillSrc, name, "SKILL.md");
      if (!fs.existsSync(src)) continue;
      copySkillDir(path.join(skillSrc, name), path.join(skillDest, name));
      skills++;
    }
  }

  const ide: TraeHookIde = traeDir === ".trae-cn" ? "trae-cn" : "trae";
  const hooks = syncTraeHooks(cwd, ide, opts.home ?? os.homedir(), scope);

  // NEVER touch .trae/agents.yaml / .trae-cn agents config
  return { skills, hooks, scope, dest: skillDest, traeDir };
}

export function syncCodeBuddy(
  cwd = process.cwd(),
  opts: AdapterSyncOpts & { ide?: CodeBuddyIde } = {},
): { commands: number; skills: number; hooks?: unknown; scope: InstallScope; dest: string; ide: CodeBuddyIde } {
  const scope = opts.scope || "project";
  const ide = opts.ide || "codebuddy";
  const nhx = nhxRoot(cwd);
  const cmdSrc = path.join(nhx, "commands");
  const skillSrc = path.join(nhx, "skills");
  const roots = ideInstallRoots(scope, cwd, opts.home ?? os.homedir(), ".trae", ide);
  const cmdDest = roots.codebuddyCommands;
  const skillDest = roots.codebuddySkills;
  fs.mkdirSync(cmdDest, { recursive: true });
  fs.mkdirSync(skillDest, { recursive: true });

  cleanNhxFiles(cmdDest, (n) => n.startsWith("nhx-") && n.endsWith(".md"));
  cleanManagedSkillDirs(skillDest, listManagedSkillNames(skillSrc));

  let commands = 0;
  if (fs.existsSync(cmdSrc)) {
    for (const f of fs.readdirSync(cmdSrc).filter((x) => x.startsWith("nhx-") && x.endsWith(".md"))) {
      const body = fs.readFileSync(path.join(cmdSrc, f), "utf8");
      const label = destLabel(scope, `${codeBuddyDirName(ide, scope)}/commands/${f}`);
      const out = header(label, body) + body;
      fs.writeFileSync(path.join(cmdDest, f), out, "utf8");
      commands++;
    }
  }

  let skills = 0;
  if (fs.existsSync(skillSrc)) {
    for (const name of fs.readdirSync(skillSrc)) {
      const src = path.join(skillSrc, name, "SKILL.md");
      if (!fs.existsSync(src)) continue;
      copySkillDir(path.join(skillSrc, name), path.join(skillDest, name));
      skills++;
    }
  }

  const hooks = syncCodeBuddyHooks(cwd, ide, opts.home ?? os.homedir(), scope);
  return { commands, skills, hooks, scope, dest: skillDest, ide };
}

export function syncQoder(
  cwd = process.cwd(),
  opts: AdapterSyncOpts = {},
): { commands: number; skills: number; hooks?: unknown; scope: InstallScope; dest: string; ide: "qoder" } {
  const scope = opts.scope || "project";
  const env = opts.env ?? process.env;
  const nhx = nhxRoot(cwd);
  const cmdSrc = path.join(nhx, "commands");
  const skillSrc = path.join(nhx, "skills");
  const roots = ideInstallRoots(scope, cwd, opts.home ?? os.homedir(), ".trae", "codebuddy", env);
  const cmdDest = roots.qoderCommands;
  const skillDest = roots.qoderSkills;
  fs.mkdirSync(cmdDest, { recursive: true });
  fs.mkdirSync(skillDest, { recursive: true });

  cleanNhxFiles(cmdDest, (n) => n.startsWith("nhx-") && n.endsWith(".md"));
  cleanManagedSkillDirs(skillDest, listManagedSkillNames(skillSrc));

  let commands = 0;
  if (fs.existsSync(cmdSrc)) {
    for (const f of fs.readdirSync(cmdSrc).filter((x) => x.startsWith("nhx-") && x.endsWith(".md"))) {
      const id = f.replace(/\.md$/, "");
      const body = fs.readFileSync(path.join(cmdSrc, f), "utf8");
      const label = destLabel(scope, `.qoder/commands/${f}`);
      const desc = descriptionFromSkillShell(skillSrc, id);
      const out = qoderCommandDoc(id, body, label, desc);
      fs.writeFileSync(path.join(cmdDest, f), out, "utf8");
      commands++;
    }
  }

  let skills = 0;
  if (fs.existsSync(skillSrc)) {
    for (const name of fs.readdirSync(skillSrc)) {
      const src = path.join(skillSrc, name, "SKILL.md");
      if (!fs.existsSync(src)) continue;
      copySkillDir(path.join(skillSrc, name), path.join(skillDest, name));
      skills++;
    }
  }

  const hooks = syncQoderHooks(cwd, opts.home ?? os.homedir(), scope, env);
  return { commands, skills, hooks, scope, dest: skillDest, ide: "qoder" };
}

export function syncAdapters(
  targets: string[],
  cwd = process.cwd(),
  opts: AdapterSyncOpts = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const t of targets) {
    if (t === "cursor") out.cursor = syncCursor(cwd, opts);
    else if (t === "trae") out.trae = syncTrae(cwd, { ...opts, traeDir: ".trae" });
    else if (t === "trae-cn") out["trae-cn"] = syncTrae(cwd, { ...opts, traeDir: ".trae-cn" });
    else if (t === "codebuddy") out.codebuddy = syncCodeBuddy(cwd, { ...opts, ide: "codebuddy" });
    else if (t === "workbuddy") out.workbuddy = syncCodeBuddy(cwd, { ...opts, ide: "workbuddy" });
    else if (t === "qoder") out.qoder = syncQoder(cwd, opts);
    else console.warn(`⚠ unknown adapter target "${t}" (supported: cursor, trae, trae-cn, codebuddy, workbuddy, qoder)`);
  }
  return out;
}
