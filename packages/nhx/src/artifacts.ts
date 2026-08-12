/** Resolve CLI --artifact (often a local filename) to a registered WebUI artifact name. */
export function resolveArtifactName(
  requested: string | undefined | null,
  arts: Array<{ name?: string | null }>,
): { name: string; match: "none" | "exact" | "case" | "basename" | "stem" | "related-unique" | "miss"; candidates: string[] } {
  const candidates = arts.map((a) => String(a.name || "").trim()).filter(Boolean);
  const req = String(requested || "").trim();
  if (!req) return { name: "", match: "none", candidates };

  const findExact = (v: string) => arts.find((a) => String(a.name || "") === v);
  const exact = findExact(req);
  if (exact?.name) return { name: String(exact.name), match: "exact", candidates };

  const ci = arts.find((a) => String(a.name || "").toLowerCase() === req.toLowerCase());
  if (ci?.name) return { name: String(ci.name), match: "case", candidates };

  const base = req.replace(/\\/g, "/").split("/").pop() || req;
  const baseHit = findExact(base);
  if (baseHit?.name) return { name: String(baseHit.name), match: "basename", candidates };

  const stem = base.includes(".") ? base.replace(/\.[^.]+$/, "") : base;
  const stemHit = arts.find((a) => {
    const n = String(a.name || "");
    return n === stem || n.toLowerCase() === stem.toLowerCase();
  });
  if (stemHit?.name) return { name: String(stemHit.name), match: "stem", candidates };

  const s = stem.toLowerCase();
  const related = arts.filter((a) => {
    const n = String(a.name || "").toLowerCase();
    return n === s || (s.length >= 3 && (n.startsWith(s) || s.startsWith(n)));
  });
  if (related.length === 1 && related[0]?.name) {
    return { name: String(related[0].name), match: "related-unique", candidates };
  }

  return { name: "", match: "miss", candidates };
}
