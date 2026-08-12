import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { GENERATED_MARKER, nhxRoot, type InstallScope } from "../config.js";
import { syncCursorHooks } from "./hooks.js";
import { syncTraeHooks, type TraeHookIde } from "./trae-hooks.js";

export type AdapterSyncOpts = {
  scope?: InstallScope;
  /** Override homedir (tests). Default: os.homedir(). */
  home?: string;
  /** Trae product dir under base: `.trae` (intl) or `.trae-cn` (China). */
  traeDir?: ".trae" | ".trae-cn";
};

export type IdeInstallRoots = {
  scope: InstallScope;
  cursorCommands: string;
  cursorSkills: string;
  traeSkills: string;
  traeDir: ".trae" | ".trae-cn";
};

export function ideInstallRoots(
  scope: InstallScope = "project",
  cwd = process.cwd(),
  home = os.homedir(),
  traeDir: ".trae" | ".trae-cn" = ".trae",
): IdeInstallRoots {
  const base = scope === "global" ? home : cwd;
  return {
    scope,
    cursorCommands: path.join(base, ".cursor", "commands"),
    cursorSkills: path.join(base, ".cursor", "skills"),
    traeSkills: path.join(base, traeDir, "skills"),
    traeDir,
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
  dest: IdeInstallRoots;
} {
  const h = home ?? os.homedir();
  const hasTrae = targets.includes("trae");
  const hasTraeCn = targets.includes("trae-cn");
  const primaryTrae: ".trae" | ".trae-cn" = hasTraeCn && !hasTrae ? ".trae-cn" : ".trae";
  const dest = ideInstallRoots(scope, cwd, h, primaryTrae);
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
  return {
    scope,
    cursor_nhx_commands: countNhxCommandFiles(dest.cursorCommands),
    cursor_nhx_skills: countNhxSkillDirs(dest.cursorSkills, managed),
    trae_nhx_skills: traeSkills,
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
      const body = fs.readFileSync(src, "utf8");
      const destDir = path.join(skillDest, name);
      fs.mkdirSync(destDir, { recursive: true });
      // Skills: no GENERATED HTML comment — body is the SKILL.md as-is
      fs.writeFileSync(path.join(destDir, "SKILL.md"), body, "utf8");
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
      const body = fs.readFileSync(src, "utf8");
      const destDir = path.join(skillDest, name);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, "SKILL.md"), body, "utf8");
      skills++;
    }
  }

  const ide: TraeHookIde = traeDir === ".trae-cn" ? "trae-cn" : "trae";
  const hooks = syncTraeHooks(cwd, ide, opts.home ?? os.homedir());

  // NEVER touch .trae/agents.yaml / .trae-cn agents config
  return { skills, hooks, scope, dest: skillDest, traeDir };
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
    else console.warn(`⚠ unknown adapter target "${t}" (supported: cursor, trae, trae-cn)`);
  }
  return out;
}
