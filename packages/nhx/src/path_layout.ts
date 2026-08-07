/** Org path layout — resolve deliverable paths against stage roots. */

export type StagePathLayout = {
  root: string;
  aliases: string[];
  named: Record<string, string>;
};

export type PathLayout = {
  stages: Record<string, StagePathLayout>;
};

export const DEFAULT_PATH_LAYOUT: PathLayout = {
  stages: {
    req: {
      root: "docs/requirements",
      aliases: ["docs/req"],
      named: {
        prd: "docs/prd/PRD.md",
        prototype: "docs/prototype",
      },
    },
    arch: {
      root: "docs/architecture",
      aliases: [],
      named: {},
    },
    dev: {
      root: "docs/dev",
      aliases: [],
      named: {},
    },
    test: {
      root: "docs/test",
      aliases: [],
      named: {},
    },
  },
};

function normRel(p: string): string {
  let s = (p || "").trim().replace(/\\/g, "/");
  while (s.startsWith("./")) s = s.slice(2);
  return s.replace(/\/+$/, "");
}

export function parsePathLayout(raw: unknown): PathLayout {
  const base: PathLayout = JSON.parse(JSON.stringify(DEFAULT_PATH_LAYOUT));
  if (!raw || typeof raw !== "object") return base;
  const stagesIn = (raw as { stages?: unknown }).stages;
  if (!stagesIn || typeof stagesIn !== "object") return base;
  const out = { ...base.stages };
  for (const [sid, cfg] of Object.entries(stagesIn as Record<string, unknown>)) {
    if (!cfg || typeof cfg !== "object") continue;
    const c = cfg as Record<string, unknown>;
    const prev = out[sid] || { root: "", aliases: [], named: {} };
    const root = normRel(String(c.root ?? prev.root ?? ""));
    const aliasesRaw = Array.isArray(c.aliases) ? c.aliases : prev.aliases;
    const aliases: string[] = [];
    for (const a of aliasesRaw) {
      const na = normRel(String(a));
      if (na && na !== root && !aliases.includes(na)) aliases.push(na);
    }
    const namedRaw =
      c.named && typeof c.named === "object" && !Array.isArray(c.named)
        ? (c.named as Record<string, unknown>)
        : prev.named;
    const named: Record<string, string> = {};
    for (const [k, v] of Object.entries(namedRaw || {})) {
      const nk = String(k).trim();
      const nv = normRel(String(v));
      if (nk && nv) named[nk] = nv;
    }
    out[sid] = { root, aliases, named };
  }
  return { stages: out };
}

export function stageLayout(layout: PathLayout | null | undefined, stage: string): StagePathLayout {
  const stages = layout?.stages || DEFAULT_PATH_LAYOUT.stages;
  const cfg = stages[stage] || { root: "", aliases: [], named: {} };
  return {
    root: normRel(cfg.root || ""),
    aliases: [...(cfg.aliases || [])],
    named: { ...(cfg.named || {}) },
  };
}

export function resolveDeliverablePath(
  pathStr: string,
  stage: string,
  layout?: PathLayout | null,
  _task = "",
): string {
  const raw = (pathStr || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("@named:")) {
    const key = raw.slice("@named:".length).trim();
    const named = stageLayout(layout, stage).named || {};
    return normRel(String(named[key] || raw));
  }

  let p = normRel(raw);
  const cfg = stageLayout(layout, stage);
  const root = cfg.root;
  const aliases = cfg.aliases || [];
  const namedVals = Object.values(cfg.named || {}).map(normRel);

  for (const alias of aliases) {
    if (p === alias) return root;
    const prefix = alias + "/";
    if (p.startsWith(prefix)) return normRel(root + "/" + p.slice(prefix.length));
  }

  if (root && (p === root || p.startsWith(root + "/"))) return p;
  for (const nv of namedVals) {
    if (p === nv || p.startsWith(nv + "/")) return p;
  }

  if (
    p.includes("/") &&
    (p.startsWith("docs/") || p.startsWith("harnessX/") || p.startsWith("openspec/"))
  ) {
    return p;
  }

  if (root) return normRel(`${root}/${p}`);
  return p;
}

export function formatPathLayoutSection(
  stage: string,
  task: string,
  layout?: PathLayout | null,
  deliverableExt?: string | null,
): string {
  const cfg = stageLayout(layout, stage);
  const root = cfg.root;
  const aliases = cfg.aliases;
  const named = cfg.named;
  const ext = (deliverableExt || "md").replace(/^\./, "").trim().toLowerCase() || "md";
  const lines = ["### 产物目录（系统约定，优先于 Guide 正文路径）", ""];
  if (root) {
    lines.push(`- **本阶段根目录：** \`${root}/\``);
    if (task) {
      lines.push(`- **本任务建议文件：** \`${root}/${task}.${ext}\`（或根目录下任务约定文件名）`);
    }
    lines.push("- 交付物须写入上述根目录（或下方 named 路径）；**不要**写入已废弃别名目录。");
  } else {
    lines.push("- 本阶段未配置产物根目录。");
  }
  if (aliases.length) {
    const aliasS = aliases.map((a) => `\`${a}/\``).join("、");
    lines.push(`- **已废弃别名（勿再写入）：** ${aliasS} → 请改用 \`${root}/\``);
  }
  if (Object.keys(named).length) {
    lines.push("- **命名路径：**");
    for (const [k, v] of Object.entries(named)) {
      lines.push(`  - \`${k}\` → \`${v}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}
