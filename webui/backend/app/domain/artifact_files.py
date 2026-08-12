"""Artifact upload filename helpers (project-wide basename uniqueness)."""

from __future__ import annotations


def split_rel_name(rel: str) -> tuple[str, str, str]:
    """Return (parent_dir, stem, suffix) for a relative path."""
    parent = ""
    name = rel
    if "/" in rel:
        parent, name = rel.rsplit("/", 1)
    if "." in name and not name.startswith("."):
        stem, suffix = name.rsplit(".", 1)
        return parent, stem, f".{suffix}"
    return parent, name, ""


def join_rel(parent: str, stem: str, suffix: str) -> str:
    name = f"{stem}{suffix}"
    return f"{parent}/{name}" if parent else name


def unique_artifact_rel(rel: str, used_basenames: set[str]) -> str:
    """If basename collides, rename to stem-1.ext, stem-2.ext, … Mutates used_basenames."""
    rel = (rel or "").replace("\\", "/").strip().lstrip("/")
    if not rel:
        return rel
    parent, stem, suffix = split_rel_name(rel)
    base = f"{stem}{suffix}".lower()
    if base not in used_basenames:
        used_basenames.add(base)
        return rel
    n = 1
    while True:
        cand_base = f"{stem}-{n}{suffix}".lower()
        if cand_base not in used_basenames:
            used_basenames.add(cand_base)
            return join_rel(parent, f"{stem}-{n}", suffix)
        n += 1


def dedupe_file_map(
    file_map: dict[str, bytes],
    used_basenames: set[str],
) -> tuple[dict[str, bytes], list[dict[str, str]]]:
    """Rename keys whose basenames collide with used_basenames or each other."""
    used = {b.lower() for b in used_basenames}
    out: dict[str, bytes] = {}
    renames: list[dict[str, str]] = []
    for rel, data in sorted(file_map.items()):
        new_rel = unique_artifact_rel(rel, used)
        if new_rel != rel:
            renames.append({"from": rel, "to": new_rel})
        out[new_rel] = data
    return out, renames
