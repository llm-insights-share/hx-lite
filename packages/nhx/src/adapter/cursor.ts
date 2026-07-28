import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { GENERATED_MARKER, nhxRoot } from "../config.js";
import { syncCursorHooks } from "./hooks.js";

function hashContent(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function header(rel: string, content: string): string {
  return `<!-- ${GENERATED_MARKER} ${rel} (hash:${hashContent(content)}) -->\n`;
}

function isNhxGenerated(file: string): boolean {
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

export function syncCursor(cwd = process.cwd()): { commands: number; skills: number; hooks?: unknown } {
  const nhx = nhxRoot(cwd);
  const cmdSrc = path.join(nhx, "commands");
  const skillSrc = path.join(nhx, "skills");
  const cmdDest = path.join(cwd, ".cursor", "commands");
  const skillDest = path.join(cwd, ".cursor", "skills");
  fs.mkdirSync(cmdDest, { recursive: true });
  fs.mkdirSync(skillDest, { recursive: true });

  // only remove previous nhx-generated nhx-* files
  cleanNhxFiles(cmdDest, (n) => n.startsWith("nhx-") && n.endsWith(".md"));
  if (fs.existsSync(skillDest)) {
    for (const name of fs.readdirSync(skillDest)) {
      const skillFile = path.join(skillDest, name, "SKILL.md");
      if (isNhxGenerated(skillFile)) {
        fs.rmSync(path.join(skillDest, name), { recursive: true, force: true });
      }
    }
  }

  let commands = 0;
  if (fs.existsSync(cmdSrc)) {
    for (const f of fs.readdirSync(cmdSrc).filter((x) => x.startsWith("nhx-") && x.endsWith(".md"))) {
      const body = fs.readFileSync(path.join(cmdSrc, f), "utf8");
      const out = header(`.cursor/commands/${f}`, body) + body;
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
      fs.writeFileSync(path.join(destDir, "SKILL.md"), header(`.cursor/skills/${name}/SKILL.md`, body) + body, "utf8");
      skills++;
    }
  }

  // Merge nhx sensor hooks into .cursor/hooks.json (preserve existing hx hooks)
  const hooks = syncCursorHooks(cwd);

  return { commands, skills, hooks };
}

export function syncTrae(cwd = process.cwd()): { skills: number } {
  const nhx = nhxRoot(cwd);
  const cmdSrc = path.join(nhx, "commands");
  const skillSrc = path.join(nhx, "skills");
  const skillDest = path.join(cwd, ".trae", "skills");
  fs.mkdirSync(skillDest, { recursive: true });

  // remove previous nhx-generated skill dirs only
  if (fs.existsSync(skillDest)) {
    for (const name of fs.readdirSync(skillDest)) {
      const skillFile = path.join(skillDest, name, "SKILL.md");
      if (isNhxGenerated(skillFile)) {
        fs.rmSync(path.join(skillDest, name), { recursive: true, force: true });
      }
    }
  }

  let skills = 0;

  // Trae has no slash commands — emit task shells as skills/nhx-*/SKILL.md
  if (fs.existsSync(cmdSrc)) {
    for (const f of fs.readdirSync(cmdSrc).filter((x) => x.startsWith("nhx-") && x.endsWith(".md"))) {
      const id = f.replace(/\.md$/, "");
      const body = fs.readFileSync(path.join(cmdSrc, f), "utf8");
      const front = ["---", `name: ${id}`, `description: nhx task shell ${id}`, "---", ""].join("\n");
      const full = front + body;
      const destDir = path.join(skillDest, id);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(
        path.join(destDir, "SKILL.md"),
        header(`.trae/skills/${id}/SKILL.md`, full) + full,
        "utf8",
      );
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
      fs.writeFileSync(
        path.join(destDir, "SKILL.md"),
        header(`.trae/skills/${name}/SKILL.md`, body) + body,
        "utf8",
      );
      skills++;
    }
  }

  // NEVER touch .trae/agents.yaml
  return { skills };
}

export function syncAdapters(targets: string[], cwd = process.cwd()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const t of targets) {
    if (t === "cursor") out.cursor = syncCursor(cwd);
    else if (t === "trae") out.trae = syncTrae(cwd);
  }
  return out;
}
