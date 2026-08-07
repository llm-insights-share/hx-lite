"""Shared helpers for Guide package storage (org + project)."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app.core.config import get_settings


def content_disposition_inline(filename: str) -> str:
    """Build latin-1-safe Content-Disposition for inline file responses.

    HTTP headers must be latin-1; non-ASCII names use RFC 5987 filename*.
    """
    name = (filename or "file").replace("\\", "/").split("/")[-1] or "file"
    suffix = Path(name).suffix
    ascii_name = name if name.isascii() else f"download{suffix or ''}"
    ascii_name = ascii_name.replace('"', "")
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"


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


def _is_skill_kind(kind: str) -> bool:
    k = (kind or "").strip().lower()
    return k in ("", "guide.skill") or k.endswith(".skill")


def _is_template_kind(kind: str) -> bool:
    k = (kind or "").strip().lower()
    return k == "guide.template" or k.endswith(".template")


def virtual_primary_md_name(kind: str) -> str | None:
    """Virtual markdown entry when DB content exists but package has no primary md."""
    if _is_template_kind(kind):
        return "template.md"
    if _is_skill_kind(kind):
        return "SKILL.md"
    return None


def merge_package_file_list(
    files: list[str],
    *,
    content: str,
    kind: str,
) -> list[str]:
    """Merge inventory and inject kind-appropriate virtual primary md if needed."""
    out = sorted({str(f).replace("\\", "/").lstrip("./") for f in files if str(f).strip()})
    # Templates must never surface SKILL.md (hide dirty historical entries)
    if _is_template_kind(kind):
        out = [f for f in out if f.rsplit("/", 1)[-1].lower() != "skill.md"]
    text = (content or "").strip()
    if not text:
        return sorted(out)
    virtual = virtual_primary_md_name(kind)
    if not virtual:
        return sorted(out)
    basenames = {f.rsplit("/", 1)[-1].lower() for f in out}
    if virtual.lower() in basenames:
        return sorted(out)
    if _is_template_kind(kind):
        has_primaryish = any(
            b.endswith((".md", ".docx", ".xlsx", ".xls", ".doc", ".pdf")) for b in basenames
        )
        if has_primaryish:
            return sorted(out)
    out = sorted({*out, virtual})
    return out


def content_fallback_for_path(rel: str, kind: str) -> bool:
    """Whether DB content may back a missing package path (virtual primary)."""
    base = Path(rel or "").name.lower()
    if _is_template_kind(kind):
        return base == "template.md"
    if _is_skill_kind(kind):
        return base == "skill.md"
    return False


def pick_primary_package_filename(files: list[str], kind: str = "") -> str:
    """Best-effort primary file name for shell hints."""
    cleaned = [str(f).replace("\\", "/").lstrip("./") for f in files if str(f).strip()]
    if _is_template_kind(kind):
        cleaned = [f for f in cleaned if f.rsplit("/", 1)[-1].lower() != "skill.md"]
    preferred_names = ("template.md", "skill.md", "readme.md")
    preferred_exts = (".docx", ".xlsx", ".xls", ".md", ".doc", ".pdf")
    lower_map = {f.rsplit("/", 1)[-1].lower(): f for f in cleaned}
    for name in preferred_names:
        if name in lower_map:
            if _is_template_kind(kind) and name == "skill.md":
                continue
            if _is_skill_kind(kind) and name == "template.md" and "skill.md" in lower_map:
                continue
            return lower_map[name]
    for ext in preferred_exts:
        for f in sorted(cleaned):
            if f.lower().endswith(ext):
                return f
    return cleaned[0] if cleaned else ""


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


def write_single_package_file(package_path: str, rel_path: str, data: bytes) -> list[str]:
    """Overwrite one file under package; return updated sorted file list."""
    root = resolve_package_root(package_path)
    clean = (rel_path or "").replace("\\", "/").lstrip("./")
    if not clean or ".." in clean.split("/"):
        raise ValueError("invalid path")
    dest = (root / clean).resolve()
    if not str(dest).startswith(str(root)):
        raise ValueError("invalid path")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return sorted(
        str(p.relative_to(root)).replace("\\", "/")
        for p in root.rglob("*")
        if p.is_file()
    )


def package_files_json_dumps(files: list[str]) -> str:
    return json.dumps(files, ensure_ascii=False)


def parse_package_files_json(raw: str | None) -> list[str]:
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [str(x).replace("\\", "/").lstrip("./") for x in data if str(x).strip()]


def deliverable_ext_from_primary(primary: str | None) -> str:
    """File extension (no dot) for deliverable path hints; default md."""
    name = (primary or "").strip().replace("\\", "/")
    base = name.rsplit("/", 1)[-1]
    if "." not in base:
        return "md"
    ext = base.rsplit(".", 1)[-1].strip().lower()
    return ext or "md"


def effective_guide_fields(
    *,
    source: str,
    row_content: str = "",
    row_content_mode: str = "markdown",
    row_package_path: str = "",
    row_package_files_json: str = "[]",
    row_kind: str = "",
    org: Any | None = None,
) -> dict[str, Any]:
    """Resolve effective content/package fields (org overlay when source=org)."""
    src = (source or "").strip() or ("org" if org is not None else "project")
    if src == "org" and org is not None:
        content = (getattr(org, "content", None) or "") or row_content or ""
        content_mode = (
            getattr(org, "content_mode", None)
            or row_content_mode
            or "markdown"
        )
        package_path = (getattr(org, "package_path", None) or "") or row_package_path or ""
        package_files_json = (
            getattr(org, "package_files_json", None) or ""
        ) or row_package_files_json or "[]"
        kind = (getattr(org, "kind", None) or "") or row_kind or ""
    else:
        content = row_content or ""
        content_mode = row_content_mode or "markdown"
        package_path = row_package_path or ""
        package_files_json = row_package_files_json or "[]"
        kind = row_kind or ""
    files = parse_package_files_json(package_files_json)
    primary = pick_primary_package_filename(files, kind) if files else ""
    return {
        "content": content,
        "content_mode": content_mode,
        "package_path": package_path,
        "package_files_json": package_files_json if isinstance(package_files_json, str) else "[]",
        "package_files": files,
        "primary_file": primary,
        "kind": kind,
    }


def load_package_blobs(
    package_path: str,
    files: list[str] | None = None,
    *,
    max_total_bytes: int = 5_000_000,
) -> list[dict[str, str]]:
    """Load package files as base64 blobs for CLI export (best-effort)."""
    if not (package_path or "").strip():
        return []
    try:
        root = resolve_package_root(package_path)
    except ValueError:
        return []
    names = files
    if names is None:
        names = sorted(
            str(p.relative_to(root)).replace("\\", "/")
            for p in root.rglob("*")
            if p.is_file()
        )
    out: list[dict[str, str]] = []
    total = 0
    for rel in names:
        clean = str(rel).replace("\\", "/").lstrip("./")
        if not clean or ".." in clean.split("/"):
            continue
        dest = (root / clean).resolve()
        if not str(dest).startswith(str(root)) or not dest.is_file():
            continue
        data = dest.read_bytes()
        total += len(data)
        if total > max_total_bytes:
            break
        out.append({"path": clean, "content_base64": base64.b64encode(data).decode("ascii")})
    return out
