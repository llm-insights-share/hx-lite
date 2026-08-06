import unittest

from app.domain.path_layout import (
    DEFAULT_PATH_LAYOUT,
    format_path_layout_section,
    normalize_path_layout,
    parse_path_layout,
    resolve_deliverable_path,
)


class PathLayoutTest(unittest.TestCase):
    def test_default_parse_empty(self) -> None:
        layout = parse_path_layout(None)
        self.assertEqual(layout["stages"]["req"]["root"], "docs/requirements")
        self.assertIn("docs/req", layout["stages"]["req"]["aliases"])

    def test_resolve_alias_and_relative(self) -> None:
        layout = DEFAULT_PATH_LAYOUT
        self.assertEqual(
            resolve_deliverable_path("docs/req/bizmodel.md", "req", layout),
            "docs/requirements/bizmodel.md",
        )
        self.assertEqual(
            resolve_deliverable_path("biz-understanding.md", "req", layout),
            "docs/requirements/biz-understanding.md",
        )
        self.assertEqual(
            resolve_deliverable_path("docs/prd/PRD.md", "req", layout),
            "docs/prd/PRD.md",
        )
        self.assertEqual(
            resolve_deliverable_path("@named:prd", "req", layout),
            "docs/prd/PRD.md",
        )

    def test_format_section_mentions_root_and_alias(self) -> None:
        md = format_path_layout_section("req", "biz-understanding")
        self.assertIn("docs/requirements", md)
        self.assertIn("docs/req", md)
        self.assertIn("biz-understanding.md", md)

    def test_normalize_rejects_bad_stage(self) -> None:
        with self.assertRaises(ValueError):
            normalize_path_layout({"stages": {"Bad Stage": {"root": "x"}}})


if __name__ == "__main__":
    unittest.main()
