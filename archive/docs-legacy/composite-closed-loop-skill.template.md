---
name: "<skill_id>"
description: >
  <一句话说明这个技能做什么；必须包含具体的触发场景/关键词，写得"push"一些，
  避免被漏触发（参考 skill-creator 的建议：把"什么时候用"全部写进 description，
  而不是留在正文里）。>
skill_type: "composite-closed-loop"
version: "<0.1.0>"
owner: "<负责人/团队>"
status: "<draft | active | deprecated>"
risk_tier: "<T0 | T1 | T2 | T3>"
tags: ["<tag1>", "<tag2>"]
---

<!--
「组合闭环技能」(Composite Closed-Loop Skill) 规范模版。
填充约定：
1. 尖括号占位符 <xxx> 为待替换内容；<a | b | c> 表示三选一枚举。
2. 表格行、编号步骤、Sensor 小节下方以注释形式给出的"重复一组"提示，说明该结构应
   按数据条数循环渲染；这些提示本身在渲染完成后应删除。
3. 数据契约见同目录下的 composite-closed-loop-skill.schema.json：建议先用它校验/
   组装数据对象，再做占位符替换，最后清理本说明块与所有"重复一组"提示。
-->

# <技能显示名称>

> <一句话定位：这个技能拼什么资产、测什么信号、什么时候算完成>
>
> 生命周期：组装 Assemble → 执行 Execute → 检测 Sense → 研判 Judge → 收敛/再优化 Converge / Refine

---

## 一、任务契约 Task Contract

**目标**：<这个技能要完成的具体任务，一到两句话>

**输入**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| <input_name> | <type> | <是/否> | <default> | <说明> |
<!-- 每个输入参数重复一行 -->

**输出**

| 产物 | 类型 | 位置 | 说明 |
|---|---|---|---|
| <output_name> | <file/text/struct> | <path/location> | <说明> |
<!-- 每个产物重复一行 -->

**前置条件**：<执行前必须满足的条件；无则写"无">

**完成定义 Definition of Done**：<一句可验证的话，须与下方 Sensor 阈值一一对应，
避免"做完了"与"测过了"是两件事>

---

## 二、关联资产清单 Asset Manifest

本技能不从零生成结果，而是拼装以下资产。类型对应 Skill 自身
`scripts/`（代码脚手架）、`references/`（编码规范/文档）、`assets/`（输出模板等）
三段式资源，以及对其它技能的依赖引用：

| asset_id | 类型 | 引用/位置 | 角色 | 是否必需 | 版本约束 |
|---|---|---|---|---|---|
| <asset_id> | <skill\|template\|scaffold\|standard\|schema\|dataset\|other> | <路径/skill名/URL> | <解决什么问题> | <是/否> | <可选> |
<!-- 每个资产重复一行；type=skill 时 引用/位置 指向另一个 skill_id，代表调用/依赖关系 -->

> 资产缺失或版本不满足时如何降级：见「七、异常与降级」。

---

## 三、执行编排 Execution Pipeline

按顺序拼装资产、产出候选结果；每一步须能追溯"用了哪个资产、做了什么、产出了什么"：

1. **<步骤名>**（引用资产：<asset_id, asset_id>）
   - 动作：<具体做什么>
   - 产出：<中间产物>
<!-- 每个步骤重复一组，步骤数不固定 -->

最后一步固定为：**汇总产出候选结果**，交由下一节的 Sensor 检测。

---

## 四、反馈定义与研判 Sensor Spec & Verdict（检测 Sense → 研判 Judge）

候选输出产出后，逐一运行以下 Sensor。信号格式对齐既有评估/看板工具的字段命名
（`expectations[].{text, passed, evidence}` + `summary.{passed, failed, total, pass_rate}`），
便于直接复用已有的评分与展示能力，不需要再造一套。

### Sensor: <sensor_id>

- 类型：<lint | test | schema_validate | llm_judge | human_review | static_analysis | runtime_metric | other>
- 检测对象：<候选输出里的哪一部分/哪个产物>
- 触发方式：<命令行 / 函数调用 / API / 人工评审入口>
- 运行时输出信号的形状（非配置项，仅说明结构）：
  ```json
  {
    "expectations": [
      {"text": "输出包含分页参数 page/page_size", "passed": true, "evidence": "在生成的路由签名中找到 page: int, page_size: int"}
    ],
    "summary": {"passed": 1, "failed": 0, "total": 1, "pass_rate": 1.0}
  }
  ```
- 判定阈值：<例如 pass_rate >= 0.9 且无 severity=critical 的失败项>
<!-- 每个 sensor 重复一组；同一任务通常组合多个 sensor -->

### 研判 Judge：聚合裁决规则 Aggregation Rule

<多个 sensor 结果如何合成一个总裁决，例如：all_must_pass / weighted_score>=0.8 /
任一 critical 失败即一票否决>

---

## 五、收敛与优化循环 Refinement Loop Control

- 最大迭代次数：<max_iterations，例如 3~5>
- 收敛条件：<例如"聚合裁决为 pass 且无 critical 诊断">
- 优化策略：<未收敛时如何把 Sensor 的 diagnostics/evidence 转成下一轮输入——追加
  上下文重新生成 / 定向调用某资产的"修复"子技能 / 回退到 Pipeline 某一步重做>
- 升级策略（达到最大迭代仍未收敛）：<按 risk_tier 路由，例如 T0/T1 → 输出"最佳尝试
  + 诊断报告"；T2/T3 → 触发 HITL gate，人工确认后才可采用>
- 收敛后动作：<落盘 / 提交 / 触发下游技能 / 通知负责人>

运行时会按下表追加迭代台账（这不是定义此技能时要填的内容，仅说明记录结构；字段
对齐既有的版本追溯惯例）：

| 轮次 | 父版本 | Sensor pass_rate | 裁决 | 是否当前最佳 |
|---|---|---|---|---|
| v0 | — | — | baseline | — |

裁决取值：`baseline / won / lost / tie`。

---

## 六、审计与追溯 Audit Trail

- 日志字段：`timestamp, iteration, actor, action, input_hash, output_hash, verdict, prev_hash`
  （链式哈希，兼容既有 TRACE 审计规范）
- 存储位置：<日志落盘路径/审计服务地址>

---

## 七、异常与降级 Fallback

- Sensor 不可用/超时：<例如跳过该 sensor，verdict 标注 unverified，不允许直接判定为 pass>
- 资产缺失/版本不匹配：<例如退回内置默认版本，并在审计日志标注 degraded=true>
- 达到最大迭代仍不收敛且 risk_tier 不允许自动放行：<强制转人工，见「五」升级策略>

---

## 参考文件 Reference Files（可选）

当本文件正文接近 500 行时，把细节挪到以下位置，正文只保留"什么时候去读"：

- `references/<xxx>.md` — <什么时候读它>
- `templates/<xxx>` — <被哪个 Pipeline 步骤使用>
- `scripts/<xxx>.py` — <被哪个 Sensor 或 Pipeline 步骤调用>
