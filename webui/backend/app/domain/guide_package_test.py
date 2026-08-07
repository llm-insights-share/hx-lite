"""Unit tests for guide package helpers."""

import base64
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.domain.guide_package import (
    deliverable_ext_from_primary,
    effective_guide_fields,
    load_package_blobs,
    pick_primary_content,
    pick_primary_package_filename,
    resolve_package_root,
    write_guide_package,
)


class GuidePackageTest(unittest.TestCase):
    def test_pick_primary_content_skill_prefers_skill_md(self) -> None:
        files = {
            "README.md": b"# readme",
            "SKILL.md": b"# skill body",
            "other.txt": b"x",
        }
        self.assertEqual(pick_primary_content(files, "guide.skill"), "# skill body")

    def test_pick_primary_package_filename_prefers_docx(self) -> None:
        primary = pick_primary_package_filename(
            ["4-数据库设计文档示例.docx", "notes.txt"],
            "guide.template",
        )
        self.assertEqual(primary, "4-数据库设计文档示例.docx")
        self.assertEqual(deliverable_ext_from_primary(primary), "docx")

    def test_effective_guide_fields_org_overlay(self) -> None:
        class _Org:
            content = "# org"
            content_mode = "package"
            package_path = "guide-packages/default/x/1.0.0"
            package_files_json = '["a.docx"]'
            kind = "guide.template"

        eff = effective_guide_fields(
            source="org",
            row_content="# row",
            row_content_mode="markdown",
            row_package_path="",
            row_package_files_json="[]",
            row_kind="guide.template",
            org=_Org(),
        )
        self.assertEqual(eff["content"], "# org")
        self.assertEqual(eff["package_path"], "guide-packages/default/x/1.0.0")
        self.assertEqual(eff["primary_file"], "a.docx")

    def test_load_package_blobs(self) -> None:
        with TemporaryDirectory() as tmp:
            data_dir = Path(tmp)

            class _S:
                pass

            s = _S()
            s.data_dir = data_dir  # type: ignore[attr-defined]
            with patch("app.domain.guide_package.get_settings", return_value=s):
                rel, saved = write_guide_package(
                    "default",
                    "arch-db-design-template",
                    "1.0.0",
                    {"4-示例.docx": b"PK\x03\x04docx"},
                )
                blobs = load_package_blobs(rel, saved)
            self.assertEqual(len(blobs), 1)
            self.assertEqual(blobs[0]["path"], "4-示例.docx")
            self.assertEqual(base64.b64decode(blobs[0]["content_base64"]), b"PK\x03\x04docx")

    def test_write_guide_package_under_scope(self) -> None:
        with TemporaryDirectory() as tmp:
            data_dir = Path(tmp)

            class _S:
                pass

            s = _S()
            s.data_dir = data_dir  # type: ignore[attr-defined]
            with patch("app.domain.guide_package.get_settings", return_value=s):
                rel, saved = write_guide_package(
                    "project/42",
                    "my-skill",
                    "1.0.0",
                    {"SKILL.md": b"# hi", "refs/a.md": b"a"},
                )
            self.assertEqual(rel, "guide-packages/project/42/my-skill/1.0.0")
            self.assertEqual(saved, ["SKILL.md", "refs/a.md"])
            self.assertEqual((data_dir / rel / "SKILL.md").read_text(), "# hi")
            with patch("app.domain.guide_package.get_settings", return_value=s):
                resolved = resolve_package_root(rel)
            self.assertTrue(resolved.is_dir())


if __name__ == "__main__":
    unittest.main()
