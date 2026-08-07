"""Org path layout: canonical deliverable roots per stage."""

from __future__ import annotations

import json
import re
from typing import Any

# Default layout — single source of truth when OrgSettings.path_layout_json is empty.
DEFAULT_PATH_LAYOUT: dict[str, Any] = {
    "stages": {
        "req": {
            "root": "docs/requirements",
            "aliases": ["docs/req"],
            "named": {
                "prd": "docs/prd/PRD.md",
                "prototype": "docs/prototype",
            },
        },
        "arch": {
            "root": "docs/architecture",
            "aliases": [],
            "named": {},
        },
        "dev": {
            "root": "docs/dev",
            "aliases": [],
            "named": {},
        },
        "test": {
            "root": "docs/test",
            "aliases": [],
            "named": {},
        },
    }
}


def _norm_rel(p: str) -> str:
    s = (p or "").strip().replace("\\", "/")
    while s.startswith("./"):
        s = s[2:]
    return s.rstrip("/")


def parse_path_layout(raw: str | None) -> dict[str, Any]:
    """Parse org JSON; merge over defaults so missing stages still resolve."""
    base = json.loads(json.dumps(DEFAULT_PATH_LAYOUT))  # deep copy
    if not (raw or "").strip():
        return base
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return base
    if not isinstance(data, dict):
        return base
    stages_in = data.get("stages")
    if not isinstance(stages_in, dict):
        return base
    out_stages: dict[str, Any] = dict(base.get("stages") or {})
    for sid, cfg in stages_in.items():
        if not isinstance(cfg, dict):
            continue
        key = str(sid).strip()
        if not key:
            continue
        prev = dict(out_stages.get(key) or {})
        root = _norm_rel(str(cfg.get("root") or prev.get("root") or ""))
        aliases_raw = cfg.get("aliases") if "aliases" in cfg else prev.get("aliases") or []
        aliases: list[str] = []
        if isinstance(aliases_raw, list):
            for a in aliases_raw:
                na = _norm_rel(str(a))
                if na and na not in aliases and na != root:
                    aliases.append(na)
        named_raw = cfg.get("named") if "named" in cfg else prev.get("named") or {}
        named: dict[str, str] = {}
        if isinstance(named_raw, dict):
            for nk, nv in named_raw.items():
                nks = str(nk).strip()
                nvs = _norm_rel(str(nv))
                if nks and nvs:
                    named[nks] = nvs
        out_stages[key] = {"root": root, "aliases": aliases, "named": named}
    return {"stages": out_stages}


def normalize_path_layout(data: Any) -> dict[str, Any]:
    """Validate + normalize a layout dict for storage (raises ValueError)."""
    if data is None:
        return json.loads(json.dumps(DEFAULT_PATH_LAYOUT))
    if not isinstance(data, dict):
        raise ValueError("path_layout 须为对象")
    stages_in = data.get("stages")
    if stages_in is None:
        return json.loads(json.dumps(DEFAULT_PATH_LAYOUT))
    if not isinstance(stages_in, dict):
        raise ValueError("path_layout.stages 须为对象")
    out: dict[str, Any] = {"stages": {}}
    for sid, cfg in stages_in.items():
        key = str(sid).strip()
        if not key or not re.match(r"^[a-z][a-z0-9_-]{0,31}$", key):
            raise ValueError(f"无效 stage id：{sid!r}")
        if not isinstance(cfg, dict):
            raise ValueError(f"stage {key} 配置须为对象")
        root = _norm_rel(str(cfg.get("root") or ""))
        if not root:
            raise ValueError(f"stage {key} 缺少 root")
        aliases: list[str] = []
        for a in cfg.get("aliases") or []:
            na = _norm_rel(str(a))
            if na and na not in aliases and na != root:
                aliases.append(na)
        named: dict[str, str] = {}
        named_raw = cfg.get("named") or {}
        if not isinstance(named_raw, dict):
            raise ValueError(f"stage {key}.named 须为对象")
        for nk, nv in named_raw.items():
            nks = str(nk).strip()
            nvs = _norm_rel(str(nv))
            if not nks or not nvs:
                continue
            named[nks] = nvs
        out["stages"][key] = {"root": root, "aliases": aliases, "named": named}
    if not out["stages"]:
        raise ValueError("path_layout.stages 不能为空")
    return out


def stage_layout(layout: dict[str, Any] | None, stage: str) -> dict[str, Any]:
    layout = layout or DEFAULT_PATH_LAYOUT
    stages = layout.get("stages") or {}
    cfg = stages.get(stage) or {}
    return {
        "root": _norm_rel(str(cfg.get("root") or "")),
        "aliases": list(cfg.get("aliases") or []),
        "named": dict(cfg.get("named") or {}),
    }


def resolve_deliverable_path(
    path: str,
    stage: str,
    layout: dict[str, Any] | None = None,
    *,
    task: str = "",
) -> str:
    """Resolve a Check/Guide path against stage layout.

    - bare filename / relative without docs/ → under stage root
    - alias prefix (e.g. docs/req/…) → remapped to root
    - already under root or named path → unchanged
    - @named:key → named entry
    """
    raw = (path or "").strip()
    if not raw:
        return raw
    if raw.startswith("@named:"):
        key = raw[len("@named:") :].strip()
        named = stage_layout(layout, stage).get("named") or {}
        return _norm_rel(str(named.get(key) or raw))

    p = _norm_rel(raw)
    cfg = stage_layout(layout, stage)
    root = cfg["root"]
    aliases: list[str] = list(cfg["aliases"] or [])
    named_vals = [_norm_rel(v) for v in (cfg.get("named") or {}).values()]

    # Remap aliases → root
    for alias in aliases:
        if p == alias:
            return root
        prefix = alias + "/"
        if p.startswith(prefix):
            return _norm_rel(root + "/" + p[len(prefix) :])

    if root and (p == root or p.startswith(root + "/")):
        return p
    for nv in named_vals:
        if p == nv or p.startswith(nv + "/"):
            return p

    # Absolute-ish repo path that isn't under root — keep (e.g. docs/prd/PRD.md)
    if "/" in p and (p.startswith("docs/") or p.startswith("harnessX/") or p.startswith("openspec/")):
        return p

    # Relative to stage root (filename or subpath)
    if root:
        return _norm_rel(f"{root}/{p}")
    return p


def format_path_layout_section(
    stage: str,
    task: str,
    layout: dict[str, Any] | None = None,
    deliverable_ext: str | None = None,
) -> str:
    """Markdown block injected into Command/Skill shell appendix."""
    cfg = stage_layout(layout, stage)
    root = cfg["root"]
    aliases = cfg["aliases"]
    named = cfg["named"]
    ext = (deliverable_ext or "md").strip().lstrip(".").lower() or "md"
    lines = [
        "### 产物目录（系统约定，优先于 Guide 正文路径）",
        "",
    ]
    if root:
        lines.append(f"- **本阶段根目录：** `{root}/`")
        if task:
            lines.append(
                f"- **本任务建议文件：** `{root}/{task}.{ext}`（或根目录下任务约定文件名）"
            )
        lines.append(f"- 交付物须写入上述根目录（或下方 named 路径）；**不要**写入已废弃别名目录。")
    else:
        lines.append("- 本阶段未配置产物根目录。")
    if aliases:
        alias_s = "、".join(f"`{a}/`" for a in aliases)
        lines.append(f"- **已废弃别名（勿再写入）：** {alias_s} → 请改用 `{root}/`")
    if named:
        lines.append("- **命名路径：**")
        for k, v in named.items():
            lines.append(f"  - `{k}` → `{v}`")
    lines.append("")
    return "\n".join(lines)


def path_layout_payload(raw: str | None) -> dict[str, Any]:
    """API response shape: effective layout + whether customized."""
    effective = parse_path_layout(raw)
    customized = bool((raw or "").strip())
    return {
        "path_layout": effective,
        "path_layout_customized": customized,
        "path_layout_default": DEFAULT_PATH_LAYOUT,
    }
