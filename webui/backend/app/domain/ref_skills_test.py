"""Unit tests for ref_skills helpers."""

import unittest

from fastapi import HTTPException

from app.domain.ref_skills import normalize_ref_skills, parse_ref_skills_raw, ref_skills_to_json


class RefSkillsTest(unittest.TestCase):
    def test_normalize_dedupe_and_ban_self(self) -> None:
        out = normalize_ref_skills(
            ["a", "b", "a", "self", ""],
            kind="guide.skill",
            self_asset_id="self",
            allowed_skill_ids={"a", "b", "self"},
        )
        self.assertEqual(out, ["a", "b"])

    def test_non_skill_clears(self) -> None:
        out = normalize_ref_skills(
            ["a"],
            kind="guide.template",
            self_asset_id="x",
            allowed_skill_ids={"a"},
        )
        self.assertEqual(out, [])

    def test_unknown_raises(self) -> None:
        with self.assertRaises(HTTPException):
            normalize_ref_skills(
                ["missing"],
                kind="guide.skill",
                self_asset_id="x",
                allowed_skill_ids={"a"},
            )

    def test_parse_json_string(self) -> None:
        self.assertEqual(parse_ref_skills_raw('["a","b"]'), ["a", "b"])
        self.assertEqual(ref_skills_to_json(["a"]), '["a"]')


if __name__ == "__main__":
    unittest.main()
