/** Best-effort primary filename for template/skill packages (mirrors backend). */

function isTemplateKind(kind: string): boolean {
  const k = (kind || "").trim().toLowerCase();
  return k === "guide.template" || k.endsWith(".template");
}

function isSkillKind(kind: string): boolean {
  const k = (kind || "").trim().toLowerCase();
  return k === "" || k === "guide.skill" || k.endsWith(".skill");
}

export function pickPrimaryPackageFilename(files: string[], kind = ""): string {
  let cleaned = files.map((f) => String(f).replace(/\\/g, "/").replace(/^\.\//, "")).filter(Boolean);
  if (isTemplateKind(kind)) {
    cleaned = cleaned.filter((f) => f.split("/").pop()?.toLowerCase() !== "skill.md");
  }
  const preferredNames = ["template.md", "skill.md", "readme.md"];
  const preferredExts = [".docx", ".xlsx", ".xls", ".md", ".doc", ".pdf"];
  const lowerMap = new Map(cleaned.map((f) => [f.split("/").pop()!.toLowerCase(), f]));
  for (const name of preferredNames) {
    if (!lowerMap.has(name)) continue;
    if (isTemplateKind(kind) && name === "skill.md") continue;
    if (isSkillKind(kind) && name === "template.md" && lowerMap.has("skill.md")) continue;
    return lowerMap.get(name)!;
  }
  for (const ext of preferredExts) {
    for (const f of [...cleaned].sort()) {
      if (f.toLowerCase().endsWith(ext)) return f;
    }
  }
  return cleaned[0] || "";
}
