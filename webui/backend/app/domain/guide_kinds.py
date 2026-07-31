"""Builtin + custom Guide kind registry helpers."""

from __future__ import annotations

import json
import re
from typing import Any

GUIDE_KIND_ID_RE = re.compile(r"^guide\.[a-z][a-z0-9_-]{0,31}$")

RESERVED_SUFFIXES = frozenset({"workflow", "command"})

BUILTIN_GUIDE_KIND_DEFS: list[dict[str, str]] = [
    {
        "id": "guide.skill",
        "title": "Skill / 技能规范",
        "desc": "coding-conventions、prd-writing…",
        "category": "inferential",
    },
    {
        "id": "guide.template",
        "title": "Template / 模板",
        "desc": "proposal-template、design-template…",
        "category": "computational",
    },
    {
        "id": "guide.constraint",
        "title": "Constraint / 硬约束",
        "desc": "layering-rules、budget-rules…",
        "category": "computational",
    },
    {
        "id": "guide.exemplar",
        "title": "Exemplar / 范例",
        "desc": "好/坏示例对照",
        "category": "inferential",
    },
    {
        "id": "guide.scaffold",
        "title": "Scaffold / 脚手架",
        "desc": "工程脚手架注入 Context Pack",
        "category": "inferential",
    },
    {
        "id": "guide.glossary",
        "title": "Glossary / 术语表",
        "desc": "领域术语约束 Agent 用词",
        "category": "inferential",
    },
    {
        "id": "guide.capability",
        "title": "Capability / 能力说明",
        "desc": "capability 写作与边界指引",
        "category": "inferential",
    },
]

BUILTIN_GUIDE_KINDS = frozenset(d["id"] for d in BUILTIN_GUIDE_KIND_DEFS)


def parse_custom_guide_kinds(raw: str | None) -> list[dict[str, str]]:
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, str]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        kid = str(item.get("id") or "").strip()
        if not kid:
            continue
        title = str(item.get("title") or kid).strip()
        desc = str(item.get("desc") or "").strip()
        cat = str(item.get("category") or "inferential").strip()
        if cat not in ("inferential", "computational"):
            cat = "inferential"
        out.append({"id": kid, "title": title, "desc": desc, "category": cat})
    return out


def normalize_custom_guide_kinds(items: list[Any] | None) -> list[dict[str, str]]:
    """Validate and normalize custom kind list; raises ValueError on bad input."""
    if items is None:
        return []
    if not isinstance(items, list):
        raise ValueError("guide_kinds must be a list")
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("each guide kind must be an object")
        kid = str(item.get("id") or "").strip()
        if not GUIDE_KIND_ID_RE.match(kid):
            raise ValueError(
                f"invalid guide kind id '{kid}' (expect guide.<slug>, slug starts with a-z)"
            )
        suffix = kid.split(".", 1)[1]
        if suffix in RESERVED_SUFFIXES:
            raise ValueError(f"reserved guide kind: {kid}")
        if kid in BUILTIN_GUIDE_KINDS:
            raise ValueError(f"cannot redefine builtin guide kind: {kid}")
        if kid in seen:
            raise ValueError(f"duplicate guide kind: {kid}")
        seen.add(kid)
        title = str(item.get("title") or kid).strip()[:64]
        desc = str(item.get("desc") or "").strip()[:200]
        cat = str(item.get("category") or "inferential").strip()
        if cat not in ("inferential", "computational"):
            cat = "inferential"
        out.append({"id": kid, "title": title or kid, "desc": desc, "category": cat})
    return out


def custom_kinds_from_settings(settings_row: Any) -> list[dict[str, str]]:
    raw = getattr(settings_row, "guide_kinds_json", None) if settings_row else None
    return parse_custom_guide_kinds(raw)


def allowed_guide_kinds(settings_row: Any = None) -> set[str]:
    custom = {c["id"] for c in custom_kinds_from_settings(settings_row)}
    return set(BUILTIN_GUIDE_KINDS) | custom


def guide_kinds_payload(settings_row: Any = None) -> dict[str, Any]:
    custom = custom_kinds_from_settings(settings_row)
    builtins = [dict(d) for d in BUILTIN_GUIDE_KIND_DEFS]
    return {
        "builtins": builtins,
        "custom": custom,
        "all": builtins + custom,
    }


def ensure_custom_kind_registered(
    kinds: list[dict[str, str]], kind_id: str
) -> list[dict[str, str]]:
    """Append a minimal custom kind entry if missing (for legacy orphan kinds)."""
    if not kind_id or kind_id in BUILTIN_GUIDE_KINDS:
        return kinds
    if any(k["id"] == kind_id for k in kinds):
        return kinds
    if not GUIDE_KIND_ID_RE.match(kind_id):
        return kinds
    suffix = kind_id.split(".", 1)[1]
    if suffix in RESERVED_SUFFIXES:
        return kinds
    return [
        *kinds,
        {
            "id": kind_id,
            "title": suffix,
            "desc": "从遗留资产自动登记",
            "category": "inferential",
        },
    ]
