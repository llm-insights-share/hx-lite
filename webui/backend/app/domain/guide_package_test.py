"""Unit tests for guide package helpers."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.domain.guide_package import pick_primary_content, resolve_package_root, write_guide_package


class GuidePackageTest(unittest.TestCase):
    def test_pick_primary_content_skill_prefers_skill_md(self) -> None:
        files = {
            "README.md": b"# readme",
            "SKILL.md": b"# skill body",
            "other.txt": b"x",
        }
        self.assertEqual(pick_primary_content(files, "guide.skill"), "# skill body")

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
