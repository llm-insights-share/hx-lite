import unittest

from app.domain import defaults
from app.domain.shell_assembler import (
    GUIDE_INPUTS_END,
    GUIDE_INPUTS_START,
    assemble_shell,
)


class ShellAssemblerGuideInputsTest(unittest.TestCase):
    def test_single_guide_input_injected(self) -> None:
        body = defaults.default_workflow_body("req", "prd-writing", "PRD 编写")
        assembled = assemble_shell(
            stage="req",
            task="prd-writing",
            description="PRD 编写",
            body=body,
            guides=["prd-writing"],
            templates=[],
            sensors=[],
            guide_contents={
                "prd-writing": "# prd-writing\n\n## 输入\n- `<slug>`：需求标识。\n\n## 步骤\n- do x\n"
            },
        )
        self.assertIn(GUIDE_INPUTS_START, assembled["body"])
        self.assertIn("### 来自 `prd-writing`", assembled["body"])
        self.assertIn("`<slug>`", assembled["body"])

    def test_multiple_guides_have_multiple_blocks(self) -> None:
        body = defaults.default_workflow_body("dev", "apply", "开发实现")
        assembled = assemble_shell(
            stage="dev",
            task="apply",
            description="开发实现",
            body=body,
            guides=["coding-conventions", "change-planning"],
            templates=[],
            sensors=[],
            guide_contents={
                "coding-conventions": "## 输入\n- `<change>`：变更标识。\n\n## 步骤\n- ...\n",
                "change-planning": "## 参数\n- `<taskId>`：任务标识。\n\n## 产出\n- ...\n",
            },
        )
        self.assertIn("### 来自 `coding-conventions`", assembled["body"])
        self.assertIn("### 来自 `change-planning`", assembled["body"])
        self.assertIn("`<taskId>`", assembled["body"])

    def test_injection_is_idempotent(self) -> None:
        body = defaults.default_workflow_body("test", "test-execution", "测试执行")
        first = assemble_shell(
            stage="test",
            task="test-execution",
            description="测试执行",
            body=body,
            guides=["qa"],
            templates=[],
            sensors=[],
            guide_contents={"qa": "## 输入\n- `<change>`：变更标识。\n"},
        )["body"]
        second = assemble_shell(
            stage="test",
            task="test-execution",
            description="测试执行",
            body=first,
            guides=["qa"],
            templates=[],
            sensors=[],
            guide_contents={"qa": "## 输入\n- `<change>`：变更标识。\n"},
        )["body"]
        self.assertEqual(second.count(GUIDE_INPUTS_START), 1)
        self.assertEqual(second.count(GUIDE_INPUTS_END), 1)

    def test_no_guide_input_keeps_default_input(self) -> None:
        body = defaults.default_workflow_body("arch", "interface-design", "接口设计")
        assembled = assemble_shell(
            stage="arch",
            task="interface-design",
            description="接口设计",
            body=body,
            guides=[],
            templates=[],
            sensors=[],
            guide_contents={},
        )
        self.assertIn("## 输入", assembled["body"])
        self.assertNotIn(GUIDE_INPUTS_START, assembled["body"])

    def test_other_guides_appear_in_appendix(self) -> None:
        assembled = assemble_shell(
            stage="arch",
            task="internal-interface",
            description="内部接口",
            body=defaults.default_workflow_body("arch", "internal-interface", "内部接口"),
            guides=["coding-conventions"],
            templates=[],
            sensors=[],
            other_guides=[("module-boundary-rules", "guide.constraint")],
            guide_contents={
                "coding-conventions": "## 输入\n- `<change>`：变更。\n",
                "module-boundary-rules": "## 输入\n- `<module>`：模块。\n",
            },
        )
        self.assertIn("### 其它 Guides", assembled["appendix"])
        self.assertIn("`module-boundary-rules`", assembled["appendix"])
        self.assertIn("`guide.constraint`", assembled["appendix"])
        self.assertIn("### 来自 `module-boundary-rules`", assembled["body"])

    def test_custom_guide_kind_goes_to_other(self) -> None:
        assembled = assemble_shell(
            stage="dev",
            task="apply",
            description="开发实现",
            body=defaults.default_workflow_body("dev", "apply", "开发实现"),
            guides=["coding-conventions"],
            templates=[],
            sensors=[],
            other_guides=[("team-playbook", "guide.playbook")],
            guide_contents={
                "coding-conventions": "## 输入\n- `<change>`：变更。\n",
                "team-playbook": "## 输入\n- `<slug>`：标识。\n",
            },
        )
        self.assertIn("### 其它 Guides", assembled["appendix"])
        self.assertIn("`guide.playbook`", assembled["appendix"])
        self.assertIn("### 来自 `team-playbook`", assembled["body"])


if __name__ == "__main__":
    unittest.main()
