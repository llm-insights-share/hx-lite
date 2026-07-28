"""Export org assets from DB into the organization HX Hub directory layout."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from sqlmodel import Session, select

from app.core.models import CommandShell, Guide, OrgSettings, Profile, Sensor, StageTask


def _clear_dir(dest: Path) -> None:
    """Remove all contents under dest but keep the directory itself."""
    dest.mkdir(parents=True, exist_ok=True)
    for child in list(dest.iterdir()):
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def _guide_kind_dir(kind: str) -> str:
    k = (kind or "").lower().strip()
    suffix = k.split(".")[-1] if "." in k else k
    known = {
        "skill",
        "template",
        "constraint",
        "exemplar",
        "scaffold",
        "codemod",
        "glossary",
        "capability",
        "workflow",
        "command",
    }
    if suffix in known:
        return suffix
    for name in known:
        if name in k:
            return name
    return "other"


def _guide_filename(kind: str, asset_id: str) -> str:
    k = (kind or "").lower()
    if "skill" in k:
        return "SKILL.md"
    if "template" in k:
        return "template.md"
    if "command" in k:
        return "command.md"
    return f"{asset_id}.md"


def _count_files(root: Path) -> int:
    if not root.exists():
        return 0
    return sum(1 for p in root.rglob("*") if p.is_file())


def _readme(org_name: str) -> str:
    return f"""# {org_name} — Organization HX Hub

本仓库由 **HX WebUI** 组织维护系统导出并推送，保存组织级 HX 配置与资产。

## 目录说明

| 路径 | 说明 |
|------|------|
| `hub-policy.yaml` | 组织策略（不含 token） |
| `profiles.yaml` | Profile → Stage → Task 矩阵（Task 直绑 guides/sensors） |
| `suites.yaml` | 兼容占位（空对象；产品层已取消 Suite） |
| `catalog.yaml` | 全资产索引 |
| `commands/` | IDE 斜杠命令壳（Command Shell） |
| `skill-shells/` | IDE Skill 壳（无 slash command 的 IDE） |
| `packages/guide/` | Guide 资产包（skill / template / …） |
| `packages/sensor/` | Sensor 资产包 |
| `.hx-webui/export-meta.yaml` | 导出元数据 |

## 消费方式

业务项目可按 Profile 从本 Hub 拉取 stage.task 相关资产；IDE 可由 CLI 从 `commands/` 与 `skill-shells/` 投影安装。

> 请勿在本仓库提交 GitHub Token 或其它密钥。
"""


def export_hub(session: Session, org_id: str, dest: Path) -> dict[str, Any]:
    """Full clean export. Returns export_meta summary."""
    _clear_dir(dest)

    settings = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    org_name = settings.org_name if settings else org_id

    # hub-policy (never write token)
    policy: dict[str, Any] = {
        "version": "1.0",
        "org_id": org_id,
        "org": org_name,
        "role": "maintainer",
        "github_repo": settings.github_repo if settings else "",
        "github_branch": (settings.github_branch if settings else "") or "main",
    }
    (dest / "hub-policy.yaml").write_text(
        yaml.safe_dump(policy, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )

    # profiles
    profiles = session.exec(select(Profile).where(Profile.org_id == org_id)).all()
    profile_doc: dict[str, Any] = {"version": "1.0", "profiles": {}}
    for p in profiles:
        stages = json.loads(p.stages_json or "[]")
        tasks = session.exec(
            select(StageTask).where(
                StageTask.org_id == org_id,
                StageTask.profile_key == p.key,
                StageTask.enabled == True,  # noqa: E712
            )
        ).all()
        by_stage: dict[str, list] = {}
        ordered = sorted(tasks, key=lambda t: (t.stage, getattr(t, "sort_order", 0) or 0, t.id or 0))
        for t in ordered:
            by_stage.setdefault(t.stage, []).append(
                {
                    "id": t.task_id,
                    "title_zh": t.title_zh,
                    "title_en": t.title_en,
                    "required": t.required,
                    "guides": json.loads(t.guides_json or "[]"),
                    "sensors": json.loads(t.sensors_json or "[]"),
                }
            )
        profile_doc["profiles"][p.key] = {
            "title": p.title,
            "description": p.description,
            "stages": stages,
            "tasks": by_stage,
        }
    (dest / "profiles.yaml").write_text(
        yaml.safe_dump(profile_doc, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )

    # suites.yaml kept as empty object for legacy hub consumers
    (dest / "suites.yaml").write_text(
        yaml.safe_dump({}, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )

    catalog: list[dict[str, Any]] = []

    # guides
    guides = session.exec(select(Guide).where(Guide.org_id == org_id)).all()
    settings = None
    try:
        from app.core.config import get_settings

        settings = get_settings()
    except Exception:
        settings = None

    for g in guides:
        kind_dir = _guide_kind_dir(g.kind)
        rel = f"packages/guide/{kind_dir}/{g.asset_id}/{g.version}"
        root = dest / rel
        if root.exists():
            shutil.rmtree(root)
        root.mkdir(parents=True, exist_ok=True)
        asset = {
            "id": g.asset_id,
            "kind": g.kind,
            "version": g.version,
            "status": g.status,
            "stage": g.stage or None,
            "task": g.task or None,
        }
        (root / "asset.yaml").write_text(
            yaml.safe_dump(asset, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )

        pkg = getattr(g, "package_path", "") or ""
        if pkg and settings:
            src = settings.data_dir / pkg
            if src.is_dir():
                for path in src.rglob("*"):
                    if path.is_file():
                        target = root / path.relative_to(src)
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(path, target)
                # ensure asset.yaml remains authoritative
                (root / "asset.yaml").write_text(
                    yaml.safe_dump(asset, allow_unicode=True, sort_keys=False), encoding="utf-8"
                )
            else:
                fname = _guide_filename(g.kind, g.asset_id)
                (root / fname).write_text(g.content or "", encoding="utf-8")
        else:
            fname = _guide_filename(g.kind, g.asset_id)
            (root / fname).write_text(g.content or "", encoding="utf-8")

        catalog.append(
            {
                "id": g.asset_id,
                "kind": g.kind,
                "version": g.version,
                "stage": g.stage or "",
                "task": g.task or "",
                "path": rel,
            }
        )

    # sensors
    sensors = session.exec(select(Sensor).where(Sensor.org_id == org_id)).all()
    for s in sensors:
        rel = f"packages/sensor/{s.asset_id}/{s.version}"
        root = dest / rel
        root.mkdir(parents=True, exist_ok=True)
        try:
            config = json.loads(s.config_json or "{}")
        except json.JSONDecodeError:
            config = {"raw": s.config_json}
        try:
            triggers = json.loads(getattr(s, "triggers_json", None) or "[]")
        except json.JSONDecodeError:
            triggers = ["hook:stop", "cli", "task-shell"]
        try:
            scope = json.loads(getattr(s, "scope_json", None) or "[]")
        except json.JSONDecodeError:
            scope = []
        asset = {
            "id": s.asset_id,
            "kind": s.kind,
            "version": s.version,
            "status": s.status,
            "stage": s.stage or None,
            "task": s.task or None,
            "check": s.check_type,
            "triggers": triggers if triggers else ["hook:stop", "cli", "task-shell"],
            "scope": scope,
            "config": config,
        }
        (root / "asset.yaml").write_text(
            yaml.safe_dump(asset, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
        (root / "sensor.md").write_text(s.content or "", encoding="utf-8")
        catalog.append(
            {
                "id": s.asset_id,
                "kind": s.kind,
                "version": s.version,
                "stage": s.stage or "",
                "task": s.task or "",
                "path": rel,
            }
        )

    # commands + skill shells (for IDEs without slash commands)
    commands = session.exec(select(CommandShell).where(CommandShell.org_id == org_id)).all()
    cmd_root = dest / "commands"
    skill_shell_root = dest / "skill-shells"
    cmd_root.mkdir(parents=True, exist_ok=True)
    skill_shell_root.mkdir(parents=True, exist_ok=True)
    cmd_count = 0
    skill_shell_count = 0
    for c in commands:
        full = ((c.body or "") + "\n\n" + (c.appendix or "")).strip() + "\n"
        fname = f"{c.slash_name}.md"
        (cmd_root / fname).write_text(full, encoding="utf-8")
        catalog.append(
            {
                "id": c.slash_name,
                "kind": "shell.command",
                "version": "1.0.0",
                "stage": c.stage,
                "task": c.task,
                "path": f"commands/{fname}",
            }
        )
        cmd_count += 1
        sid = c.slash_name or f"hx-{c.stage}-{c.task.replace('_', '-')}"
        sdir = skill_shell_root / sid
        sdir.mkdir(parents=True, exist_ok=True)
        front = "\n".join(
            [
                "---",
                f"name: {sid}",
                f"description: {c.description or f'task shell {c.stage}/{c.task}'}",
                "---",
                "",
            ]
        )
        (sdir / "SKILL.md").write_text(front + full, encoding="utf-8")
        catalog.append(
            {
                "id": sid,
                "kind": "shell.skill",
                "version": "1.0.0",
                "stage": c.stage,
                "task": c.task,
                "path": f"skill-shells/{sid}/SKILL.md",
            }
        )
        skill_shell_count += 1

    catalog.sort(key=lambda x: (x.get("kind", ""), x.get("id", "")))
    (dest / "catalog.yaml").write_text(
        yaml.safe_dump({"version": "1.0", "assets": catalog}, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )

    (dest / "README.md").write_text(_readme(org_name), encoding="utf-8")

    meta = {
        "org_id": org_id,
        "org_name": org_name,
        "source": "webui",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "path": str(dest),
        "counts": {
            "profiles": len(profiles),
            "suites": 0,
            "guides": len(guides),
            "sensors": len(sensors),
            "commands": cmd_count,
            "skill_shells": skill_shell_count,
            "catalog_entries": len(catalog),
            "files": _count_files(dest),
        },
        "layout": [
            "README.md",
            "hub-policy.yaml",
            "profiles.yaml",
            "suites.yaml",
            "catalog.yaml",
            "commands/",
            "skill-shells/",
            "packages/guide/",
            "packages/sensor/",
            ".hx-webui/export-meta.yaml",
        ],
    }
    meta_dir = dest / ".hx-webui"
    meta_dir.mkdir(parents=True, exist_ok=True)
    (meta_dir / "export-meta.yaml").write_text(
        yaml.safe_dump(meta, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )
    # recount after writing meta
    meta["counts"]["files"] = _count_files(dest)
    (meta_dir / "export-meta.yaml").write_text(
        yaml.safe_dump(meta, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )

    return meta
