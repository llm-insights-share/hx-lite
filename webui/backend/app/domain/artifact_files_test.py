"""Tests for artifact filename dedupe."""

from __future__ import annotations

import unittest

from app.domain.artifact_files import dedupe_file_map, unique_artifact_rel


class ArtifactFilesTest(unittest.TestCase):
    def test_unique_no_conflict(self) -> None:
        used: set[str] = set()
        self.assertEqual(unique_artifact_rel("A.md", used), "A.md")
        self.assertEqual(used, {"a.md"})

    def test_unique_suffix(self) -> None:
        used = {"a.md"}
        self.assertEqual(unique_artifact_rel("A.md", used), "A-1.md")
        self.assertEqual(unique_artifact_rel("A.md", used), "A-2.md")
        self.assertEqual(used, {"a.md", "a-1.md", "a-2.md"})

    def test_dedupe_map_with_subdir(self) -> None:
        used = {"readme.md"}
        out, renames = dedupe_file_map(
            {"docs/README.md": b"x", "other.txt": b"y"},
            used,
        )
        self.assertEqual(out["docs/README-1.md"], b"x")
        self.assertEqual(out["other.txt"], b"y")
        self.assertEqual(renames, [{"from": "docs/README.md", "to": "docs/README-1.md"}])


if __name__ == "__main__":
    unittest.main()
