"""Normalize guide.skill → referenced skill asset_ids."""

from __future__ import annotations

import json
from typing import Iterable

from fastapi import HTTPException


def parse_ref_skills_raw(raw: object) -> list[str]:
    """Accept list, JSON string, or empty → list of strings (not yet validated)."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            data = json.loads(s)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, "ref_skills 必须是 JSON 数组") from exc
        if not isinstance(data, list):
            raise HTTPException(400, "ref_skills 必须是 JSON 数组")
        return [str(x).strip() for x in data if str(x).strip()]
    raise HTTPException(400, "ref_skills 格式无效")


def normalize_ref_skills(
    refs: Iterable[str] | None,
    *,
    kind: str,
    self_asset_id: str,
    allowed_skill_ids: set[str],
) -> list[str]:
    """Dedupe, ban self-ref; non-skill kinds → []; unknown ids → 400."""
    if (kind or "").strip() != "guide.skill":
        return []
    self_id = (self_asset_id or "").strip()
    seen: set[str] = set()
    out: list[str] = []
    invalid: list[str] = []
    for r in refs or []:
        aid = (r or "").strip()
        if not aid or aid == self_id or aid in seen:
            continue
        if aid not in allowed_skill_ids:
            invalid.append(aid)
            continue
        seen.add(aid)
        out.append(aid)
    if invalid:
        raise HTTPException(400, f"引用 Skill 不存在或非 guide.skill: {', '.join(invalid)}")
    return out


def ref_skills_to_json(refs: list[str]) -> str:
    return json.dumps(refs, ensure_ascii=False)


def parse_ref_skills_json(raw: str | None) -> list[str]:
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [str(x).strip() for x in data if str(x).strip()]
