"""Tests for guide kind registry and classification."""

from __future__ import annotations

import json
import unittest

from app.domain.guide_kinds import (
    BUILTIN_GUIDE_KINDS,
    allowed_guide_kinds,
    guide_kinds_payload,
    normalize_custom_guide_kinds,
)
from app.domain.guide_samples import classify_guide_bucket, split_guides_by_kind


class GuideKindsTest(unittest.TestCase):
    def test_builtins_exclude_codemod(self) -> None:
        self.assertNotIn("guide.codemod", BUILTIN_GUIDE_KINDS)
        self.assertIn("guide.skill", BUILTIN_GUIDE_KINDS)
        self.assertEqual(len(BUILTIN_GUIDE_KINDS), 7)

    def test_normalize_custom(self) -> None:
        kinds = normalize_custom_guide_kinds(
            [{"id": "guide.playbook", "title": "Playbook", "category": "inferential"}]
        )
        self.assertEqual(kinds[0]["id"], "guide.playbook")
        with self.assertRaises(ValueError):
            normalize_custom_guide_kinds([{"id": "guide.skill", "title": "x"}])
        with self.assertRaises(ValueError):
            normalize_custom_guide_kinds([{"id": "bad", "title": "x"}])

    def test_allowed_includes_custom(self) -> None:
        class Row:
            guide_kinds_json = json.dumps(
                [{"id": "guide.playbook", "title": "PB", "desc": "", "category": "inferential"}]
            )

        allowed = allowed_guide_kinds(Row())
        self.assertIn("guide.playbook", allowed)
        self.assertIn("guide.skill", allowed)
        self.assertNotIn("guide.codemod", allowed)

    def test_payload(self) -> None:
        class Row:
            guide_kinds_json = "[]"

        payload = guide_kinds_payload(Row())
        self.assertEqual(len(payload["builtins"]), 7)
        self.assertFalse(any(b["id"] == "guide.codemod" for b in payload["builtins"]))

    def test_classify_open_other(self) -> None:
        self.assertEqual(classify_guide_bucket("x", "guide.skill"), "skill")
        self.assertEqual(classify_guide_bucket("x", "guide.template"), "template")
        self.assertEqual(classify_guide_bucket("x", "guide.constraint"), "other")
        self.assertEqual(classify_guide_bucket("x", "guide.playbook"), "other")
        skills, templates, others = split_guides_by_kind(
            ["a", "b", "c"],
            {"a": "guide.skill", "b": "guide.template", "c": "guide.playbook"},
        )
        self.assertEqual(skills, ["a"])
        self.assertEqual(templates, ["b"])
        self.assertEqual(others, [("c", "guide.playbook")])


if __name__ == "__main__":
    unittest.main()
