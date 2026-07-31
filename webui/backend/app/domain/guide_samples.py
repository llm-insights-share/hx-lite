"""Sample Guide assets for constraint/exemplar/scaffold/glossary/capability."""

from __future__ import annotations

from typing import Any

# Idempotent seed metadata. Bodies live under hubs/default/packages/guide/<kind>/<id>/1.0.0/
SAMPLE_GUIDES: list[dict[str, Any]] = [
    {
        "asset_id": "module-boundary-rules",
        "kind": "guide.constraint",
        "name": "模块边界约束",
        "bind": [("arch", "internal-interface")],
    },
    {
        "asset_id": "api-compat-constraints",
        "kind": "guide.constraint",
        "name": "API兼容约束",
        "bind": [],
    },
    {
        "asset_id": "prd-section-exemplars",
        "kind": "guide.exemplar",
        "name": "PRD章节范例",
        "bind": [("req", "prd-writing")],
    },
    {
        "asset_id": "api-handler-exemplars",
        "kind": "guide.exemplar",
        "name": "Handler范例",
        "bind": [],
    },
    {
        "asset_id": "change-scaffold",
        "kind": "guide.scaffold",
        "name": "变更脚手架",
        "bind": [("dev", "plan")],
    },
    {
        "asset_id": "module-scaffold",
        "kind": "guide.scaffold",
        "name": "模块脚手架",
        "bind": [],
    },
    {
        "asset_id": "delivery-glossary",
        "kind": "guide.glossary",
        "name": "交付术语表",
        "bind": [],
    },
    {
        "asset_id": "domain-naming-glossary",
        "kind": "guide.glossary",
        "name": "命名术语表",
        "bind": [],
    },
    {
        "asset_id": "agent-tool-allowlist",
        "kind": "guide.capability",
        "name": "工具白名单",
        "bind": [],
    },
    {
        "asset_id": "mcp-boundary-capability",
        "kind": "guide.capability",
        "name": "MCP边界",
        "bind": [],
    },
]

# kind_dir → preferred primary filenames (used by load_guide_package_content)
GUIDE_KIND_FILENAMES: dict[str, list[str]] = {
    "skill": ["SKILL.md", "skill.md"],
    "template": ["template.md", "TEMPLATE.md"],
    "constraint": ["SKILL.md", "constraint.md", "{gid}.md"],
    "exemplar": ["SKILL.md", "exemplar.md", "{gid}.md"],
    "scaffold": ["SKILL.md", "scaffold.md", "{gid}.md"],
    "glossary": ["SKILL.md", "glossary.md", "{gid}.md"],
    "capability": ["SKILL.md", "capability.md", "{gid}.md"],
}


def classify_guide_bucket(gid: str, kind: str = "") -> str:
    """Return template | other | skill | skip for shell appendix grouping.

    Any guide.* that is not skill/template/workflow/command goes to «other»
    so org custom kinds appear in the appendix automatically.
    """
    kind = kind or ""
    if kind in ("guide.workflow", "guide.command") or str(gid).startswith("wf-"):
        return "skip"
    if (
        kind == "guide.template"
        or "template" in gid
        or str(gid).endswith("-template")
        or str(gid).endswith("-outline")
        or str(gid).endswith("-checklist")
    ):
        return "template"
    if kind == "guide.skill" or not kind:
        return "skill"
    if kind.startswith("guide."):
        return "other"
    return "skill"


def split_guides_by_kind(
    guide_ids: list[str], kind_map: dict[str, str] | None = None
) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    """Split bound guide ids into skills, templates, and other (id, kind) pairs."""
    kind_map = kind_map or {}
    skills: list[str] = []
    templates: list[str] = []
    others: list[tuple[str, str]] = []
    for gid in guide_ids:
        if not gid:
            continue
        kind = kind_map.get(gid, "")
        bucket = classify_guide_bucket(gid, kind)
        if bucket == "skip":
            continue
        if bucket == "template":
            templates.append(gid)
        elif bucket == "other":
            others.append((gid, kind or "guide.other"))
        else:
            skills.append(gid)
    return skills, templates, others
