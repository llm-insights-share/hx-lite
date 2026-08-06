"""Shared helpers for Guide package storage (org + project)."""

from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings


def pick_primary_content(files: dict[str, bytes], kind: str) -> str:
    """Choose primary text content from uploaded package files."""
    preferred: list[str] = []
    if "skill" in (kind or "").lower():
        preferred = ["SKILL.md", "skill.md"]
    elif "template" in (kind or "").lower():
        preferred = ["template.md", "TEMPLATE.md"]
    preferred += ["README.md", "readme.md"]

    lower_map = {k.replace("\\", "/").lstrip("./"): v for k, v in files.items()}
    for name in preferred:
        for path, data in lower_map.items():
            if path == name or path.endswith("/" + name):
                try:
                    return data.decode("utf-8")
                except UnicodeDecodeError:
                    continue
    for path, data in sorted(lower_map.items()):
        if path.lower().endswith(".md"):
            try:
                return data.decode("utf-8")
            except UnicodeDecodeError:
                continue
    if len(lower_map) == 1:
        data = next(iter(lower_map.values()))
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            return ""
    return ""


def write_guide_package(
    scope_key: str,
    asset_id: str,
    version: str,
    files: dict[str, bytes],
) -> tuple[str, list[str]]:
    """Write package under data/guide-packages/{scope_key}/...; return (rel_path, file list)."""
    settings = get_settings()
    rel = f"guide-packages/{scope_key}/{asset_id}/{version}"
    root = settings.data_dir / rel
    if root.exists():
        import shutil

        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for rel_path, data in files.items():
        clean = rel_path.replace("\\", "/").lstrip("./")
        if not clean or ".." in clean.split("/"):
            continue
        dest = root / clean
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        saved.append(clean)
    return rel, sorted(saved)


def resolve_package_root(package_path: str) -> Path:
    """Resolve a package_path relative to data_dir; raise ValueError if invalid/missing."""
    settings = get_settings()
    rel = (package_path or "").strip().replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise ValueError("无 package")
    root = (settings.data_dir / rel).resolve()
    data_root = settings.data_dir.resolve()
    if not str(root).startswith(str(data_root)) or not root.is_dir():
        raise ValueError("package 目录不存在")
    return root
