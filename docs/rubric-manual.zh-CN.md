# Rubric 编写与维护使用手册

**适用角色**：质量负责人、Tech Lead、平台组、Steering 治理负责人  
**适用阶段**：主要在 `dev.verify` 执行；规则内容覆盖 `req` / `arch` / `dev` / `test` 各任务产出  
**版本**：HarnessX v0.6+  
**关联文档**：[场景 07 Steering 质量治理](examples/07-steering-质量治理.md) · [hxhub 使用手册](hxhub-usage.zh-CN.md) · [操作说明](operation-guide.zh-CN.md)

---

## 1. 概述与定位

Rubric 是 HarnessX 的 **「Rubric as Data」** 推断型反馈资产（`sensor.rubric`）：

- 规则以结构化 YAML 存储（`rules.yaml`）
- 由内置传感器 `ai-spec-review`（`builtin: rubric`）在 **dev `verify`** 阶段评估
- 评估对象：change 的 `proposal.md` + 所有 **delta spec** 文件（拼接后送审）
- 输出与 lint、`spec-validate` 等计算型 Sensor 统一的 `SensorReport`

**与 Guide（Skill）的分工**：

| 类型 | 作用时机 | 目的 |
| --- | --- | --- |
| **Guide / Skill** | apply 前馈 | 让 Agent **下次不写错** |
| **Rubric** | verify 反馈 | 机器自动 **检查已写内容** 是否符合团队规则 |

经验法则：**拦截是成本，预防是资产**——高频人工 review 意见应蒸馏为 Rubric，高频 Agent 错误应蒸馏为 Skill（见 [场景 07](examples/07-steering-质量治理.md)）。

---

## 2. 运行机制（必读）

### 2.1 触发时机

`ai-spec-review` 注册在 `harness.yaml`，纳入以下 verification 套件：

| 套件 | Profile | 是否含 Rubric |
| --- | --- | --- |
| `verification` | standard | 否 |
| `verification-strict` | strict | 是 |
| `verification-enterprise` | enterprise / enterprise-sdlc | 是 |

触发命令：

```bash
hx verify <change>
hx gate check <change> --stage dev --task verify
```

### 2.2 评估范围（重要限制）

当前实现 **仅读取**：

```text
harnessX/changes/<id>/proposal.md
harnessX/changes/<id>/specs/**  （delta spec 文件）
```

**不会自动读取**：`docs/prd/`、`docs/architecture/`、`design/`、`requirements/`、`tasks.md`。

因此：

- Rubric 在 **`dev.verify` 执行**，但主要检查 **`dev.propose` 阶段写入的 proposal + delta spec**
- `req` / `arch` 组织级制品由 **script sensor**（`prd-complete`、`arch-hld-complete` 等）门禁，不走 Rubric
- 若希望 Rubric 覆盖 design 叙述，须在 propose 阶段的 delta spec / proposal 中体现（或扩展自定义 sensor）

### 2.3 规则扫描路径

传感器扫描 **`harnessX/assets/rubrics/*/rules.yaml` 全部子目录**，合并评估。

> Hub 安装的 rubric（`.hub-cache/`）**不会自动生效**，须复制或合并到 `assets/rubrics/`（见 §8.3）。

### 2.4 Judge 模式

| 模式 | 条件 | 行为 |
| --- | --- | --- |
| **启发式（默认）** | 无 `HX_JUDGE_CMD` | 有 `pattern` → 正则匹配即违规；无 `pattern` → 跳过 |
| **命令 Judge** | `export HX_JUDGE_CMD="..."` | stdin JSON → stdout JSON verdict；失败 **fail-closed** |

送审前自动 **脱敏**（API key、JWT、私钥等 → `[REDACTED]`），并按 sensor `budget_tokens`（默认 8000）截断。

---

## 3. 文件结构与格式规范

### 3.1 工作区布局

```text
harnessX/
├── assets/rubrics/
│   ├── team-review/rules.yaml       # hx rubric add / harvest-pr 默认目标
│   ├── spec-quality/rules.yaml      # bundle 内置
│   └── <package-id>/rules.yaml      # Hub 包或蒸馏产出
├── harness.yaml                     # ai-spec-review sensor
└── .hub-cache/<id>/                 # hx hub add（sensor 不直接读）
```

### 3.2 `rules.yaml` 字段

```yaml
rules:
  - id: rule-001
    status: trial          # draft | trial | enforced | deprecated
    check: 人类可读检查描述
    pattern: "可选正则"
    severity: block        # block | warn | info
    falsePositives: 0      # hx rubric feedback 维护
    evaluations: 0
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 规则唯一 ID |
| `status` | 是 | 见 §3.3 生命周期 |
| `check` | 是 | finding 消息主体 |
| `pattern` | 否 | 启发式 Judge 正则；无则需 LLM Judge |
| `severity` | 是 | `enforced` 时生效；`trial` 强制降为 `info` |
| `falsePositives` / `evaluations` | 否 | 误报统计 |

### 3.3 规则级生命周期

| status | 参与评估 | 违规时 severity |
| --- | --- | --- |
| `draft` | 否 | — |
| `trial` | 是 | 强制 `info`（观察期） |
| `enforced` | 是 | 使用声明的 severity |
| `deprecated` | 否 | — |

晋级：**手动编辑** `rules.yaml` 中 `status`（`draft` → `trial` → `enforced`）。

### 3.4 资产级 `asset.yaml`（Hub 发布 / asset promote 时需要）

```yaml
id: team-review
kind: sensor.rubric
version: 1.0.0
origin: local
status: trial
execution: inferential
stage: dev
task: verify
metrics:
  evaluations: 12
  falsePositives: 1
```

**两套 lifecycle 需分别维护**：

- 规则 `status`（`rules.yaml`）→ 单条规则是否评估
- 资产 `status`（`asset.yaml`）→ Hub 发布与 `hx asset promote --to enforced` 门槛

---

## 4. 各阶段（stage）各任务（task）常用 Rubric

> 说明：除 `dev.verify` 外，其他任务的「常用 Rubric」指 **建议在 proposal/delta spec 中体现的评审要点**，以及 **团队可添加到 `team-review` 的自定义规则**。内置 Hub 包按 profile/scenario 种子化，见 §4.6。

### 4.1 req 阶段（组织级 `docs/prd/`）

req 阶段门禁由 **script sensor**（`prd-complete`、`prd-approved`）负责，**不执行 Rubric sensor**。下表为 PRD 编写时建议对齐的 Rubric 思路（可沉淀到 `team-review`，在 change propose 后于 verify 间接生效）：

| 任务 | 常用检查要点 | 推荐 Hub / 内置规则 | 建议自定义 rule（示例） |
| --- | --- | --- | --- |
| `biz-understanding` | 业务目标可度量、干系人明确 | — | `check: 业务目标含可量化指标` |
| `requirements-research` | 调研结论有证据引用、开放问题列出 | — | `pattern: "## Open Questions"` |
| `requirements-analysis` | 用户故事 ID、AC 与用户故事关联 | — | `pattern: "US-\\d+"` + `AC-\\d+` |
| `prototype-design` | 空态/错态/加载态、交互一致性 | `ux-consistency-rubric` → `empty-state-defined` | `pattern: "\\b(empty state\|loading)\b"` |
| `prd-writing` | 避免模糊词、NFR 可量化、范围明确 | `common-review-rubrics` → `spec-ambiguous` | `pattern: "\\b(P0\|P1)\\b"`；NFR 数字指标 |

**PRD 阶段 script 门禁**（非 Rubric）：

```bash
hx req prd check <slug>    # prd-complete
hx approve prd <slug> --approver <name>
```

---

### 4.2 arch 阶段（组织级 `docs/architecture/`）

arch 阶段由 **script sensor**（`arch-hld-complete`、`arch-lld-complete`、`arch-approved` 等）负责。下表为 HLD/LLD 编写时建议对齐的 Rubric 思路：

| 任务 | 常用检查要点 | 推荐 Hub 规则 | 建议自定义 rule（示例） |
| --- | --- | --- | --- |
| `subsystem-division` | 模块职责表、系统边界、registry 同步 | — | `pattern: "## ADR"` |
| `tech-selection` | ADR 含 Decision/Alternatives/Consequences | — | `pattern: "Alternatives:"` |
| `database-design` | 迁移回滚与校验步骤 | `risk-review-rubrics` → `data-migration-risk` | `pattern: "\\b(rollback\|backfill)\b"` |
| `interface-design` | 外部 API 破坏性变更显式标注 | `api-breaking-change-rubric` → `breaking-endpoint-change` | `pattern: "\\b(BREAKING\|breaking change)\\b"` |
| `key-mechanisms` | 关键机制有风险缓解、回滚策略 | `common-review-rubrics` → `rollback-mentioned` | `pattern: "\\b(feature flag\|kill switch)\\b"` |
| `internal-interface` | 模块接口契约、向后兼容策略 | `backward-compat-rubric` → `compat-note` | `pattern: "\\b(IF-\\d+\|deprecat)"` |

**arch 阶段 script 门禁**（非 Rubric）：

```bash
hx arch check
hx arch lld check <module>
hx approve arch --approver <name>
hx approve arch-lld <module> --approver <name>
```

---

### 4.3 dev 阶段（change 级）

Rubric sensor **在 `dev.verify` 执行**，主要检查 **propose 阶段产出的 proposal + delta spec**。

| 任务 | Rubric 是否执行 | 常用 Hub / 内置规则 | 检查内容说明 |
| --- | --- | --- | --- |
| `plan` | 否（`plan-coverage` sensor） | `change-risk-rubric` → `risk-tier-documented` | 建议在 proposal 中记录风险档位 |
| `propose` | **间接（verify 时检查）** | 见下表「propose 核心规则集」 | proposal.md + delta spec |
| `design` | 否（design 传感器为 script） | `rollback-mentioned`、`compat-note` | design 内容须在 delta/proposal 中体现才被 Rubric 读到 |
| `apply` | 否 | — | 代码质量由 lint/typecheck/arch-boundary 等 script sensor 负责 |
| `verify` | **是（执行点）** | 全部 `assets/rubrics/` 下 active 规则 | 触发 `ai-spec-review` |
| `archive` | 否 | — | 由 gate 前置与 promote 传感器负责 |

#### propose 核心规则集（最常用）

| 规则 ID | 来源包 | status | severity | 检查内容 |
| --- | --- | --- | --- | --- |
| `ears-trigger` | `spec-quality`（bundle 内置） | enforced | warn | delta spec 使用 EARS 句式 `WHEN ... THE SYSTEM SHALL` |
| `no-placeholder` | `spec-quality` | enforced | **block** | 规格无未填尖括号占位符 `<...>` |
| `spec-ambiguous` | `common-review-rubrics` | enforced | warn | 避免 maybe/probably/might 等模糊词 |
| `rollback-mentioned` | `common-review-rubrics` | trial | info | 高风险变更提及 rollback/feature flag |
| `breaking-endpoint-change` | `api-breaking-change-rubric` | enforced | **block** | API 破坏性变更显式标注 BREAKING |
| `data-migration-risk` | `risk-review-rubrics` | enforced | warn | 数据迁移含 rollback/backfill/validation |
| `authz-change` | `risk-review-rubrics` | trial | info | 权限变更提及 role/permission |
| `compat-note` | `backward-compat-rubric` | trial | warn | 兼容性策略（backward compatible/deprecat） |
| `empty-state-defined` | `ux-consistency-rubric` | trial | warn | UI 变更提及 empty/error/loading state |
| `a11y-mention` | `a11y-rubric` | trial | info | 可访问性（a11y/accessibility/keyboard） |
| `risk-tier-documented` | `change-risk-rubric` | trial | info | 变更风险档位记录 |
| `uat-signoff` | `uat-quality-rubric` | enforced | warn | UAT 签收记录（enterprise-sdlc） |

#### dev 阶段常用 team-review 自定义规则

```bash
# 错误处理：空 catch 块
hx rubric add "catch 块不得静默吞错" \
  --pattern "catch\\s*(\\([^)]*\\))?\\s*\\{\\s*\\}" \
  --severity block

# 退款域：结构化日志含 orderId
hx rubric add "退款相关须打印带 orderId 的结构化日志" \
  --pattern "refund(?![\\s\\S]{0,200}orderId)" \
  --severity warn

# 核心域：必须引用 Scenario 名
hx rubric add "测试须以 Scenario 命名可追溯" \
  --pattern "Scenario:" \
  --severity warn
```

---

### 4.4 test 阶段（change 级 `test-cases/`）

test 阶段门禁由 **script sensor**（`test-cases-complete`、`uat-complete`、`bugs-closed`）负责。Rubric 可在 verify 时检查 proposal/delta 中的测试/UAT 叙述：

| 任务 | 常用 Rubric | 说明 |
| --- | --- | --- |
| `test-case-design` | —（`test-cases-complete` sensor） | 建议在 delta spec 中保持 Scenario↔测试映射 |
| `test-execution` | `uat-quality-rubric` → `uat-signoff` | proposal/验收文档含 UAT/sign-off 字样 |

```bash
hx gate check <change> --stage test --task test-case-design
hx gate check <change> --stage test --task test-execution
```

---

### 4.5 阶段 × 任务 × 传感器类型总览

| 阶段 | 任务 | 门禁类型 | Rubric 是否直接执行 |
| --- | --- | --- | --- |
| req | 全部 | script sensor | 否 |
| arch | 全部 | script sensor | 否 |
| dev | plan / propose / design / apply / archive | script sensor / gate | 否（propose 产出待 verify 检查） |
| dev | **verify** | **rubric + script** | **是** |
| test | 全部 | script sensor | 否（uat 相关规则在 verify 时读 proposal） |

---

### 4.6 按 Profile / Scenario 推荐的 Hub Rubric 包

| Profile / Scenario | 推荐 Rubric 包 |
| --- | --- |
| `minimal` | `common-review-rubrics@1.0.0` |
| `standard` | + `risk-review-rubrics@1.0.0` |
| `strict` | + `api-breaking-change-rubric@1.0.0`、`backward-compat-rubric@1.0.0` |
| `enterprise` | 同 standard（verify-enterprise 含 ai-spec-review） |
| `enterprise-sdlc` | + `uat-quality-rubric@1.0.0`、`change-risk-rubric@1.0.0` |
| scenario `frontend` | + `ux-consistency-rubric@1.0.0`、`a11y-rubric@1.0.0` |
| scenario `api` | + `api-breaking-change-rubric`、`backward-compat-rubric` |
| scenario `library` | + `backward-compat-rubric@1.0.0` |

安装示例：

```bash
hxhub seed --profile standard --with rubrics
# 或
hxhub add common-review-rubrics@1.0.0
# 复制到 sensor 扫描路径
cp -r harnessX/.hub-cache/common-review-rubrics harnessX/assets/rubrics/
```

---

## 5. 编写规范

### 5.1 写好一条可维护的规则

1. **`check` 可判定**：避免「代码要清晰」类模糊表述
2. **`pattern` 可测试**：`new RegExp(pattern, "im")`；先在样例文本验证
3. **新规则从 `trial` 开始**：观察误报后再改 `enforced`
4. **`severity` 分级**：`block` 明确反模式；`warn` 最佳实践；`info` 建议

### 5.2 常见 pattern 模式

| 模式 | pattern 示例 |
| --- | --- |
| 关键词必须出现 | `\b(rollback\|feature flag)\b` |
| 关键词必须不出现 | `\b(maybe\|probably\|might)\b` |
| 结构反模式 | `catch\s*(\([^)]*\))?\s*\{\s*\}` |
| EARS 规范 | `WHEN .+ THE SYSTEM SHALL` |
| 占位符检测 | `<[a-zA-Z][^>]*>` |
| 破坏性变更 | `\b(BREAKING\|breaking change)\b` |

### 5.3 LLM Judge（语义级规则）

```bash
export HX_JUDGE_CMD="my-judge-script"
hx verify <change>
```

协议：stdin `{"rule":{"id","check"},"content"}` → stdout 末行 `{"violation":bool,"note"?}`。

---

## 6. 编写入口（四种方式）

| 方式 | 命令 | 产出 |
| --- | --- | --- |
| A. 口语化添加 | `hx rubric add "<text>" [--pattern] [--severity]` | `team-review/rules.yaml`（draft） |
| B. PR 评论收割 | `hx steer harvest-pr --from <json>` | `team-review/rules.yaml` 草稿 |
| C. 失败模式蒸馏 | `hx steer distill "<sig>" --kind sensor.rubric` | `distilled-*/` |
| D. Hub 脚手架 | `hxhub asset create --kind sensor.rubric ...` | 完整资产包 |

---

## 7. 维护流程（Steering 闭环）

```text
观测 → 沉淀 → 试运行 → 反馈 → 晋级/退役 → 组织共享 → 巡检
```

| 步骤 | 命令 |
| --- | --- |
| 1. 观测 | `hx steer report`、`hx steer coverage` |
| 2. 沉淀 | `hx rubric add` / `hx steer harvest-pr` / `hx steer distill` |
| 3. 试运行 | 规则 `status: trial` → `hx verify <change>` |
| 4. 反馈 | `hx rubric feedback <file> <ruleId> [--false-positive]` |
| 5. 规则晋级 | 编辑 `rules.yaml` → `status: enforced` |
| 6. 资产晋级 | `hx asset backfill` → `hx asset promote --to enforced` |
| 7. 退役 | `status: deprecated` |
| 8. 组织共享 | `hx steer publish` / `hx hub promote` |
| 9. 巡检 | `hx janitor run` |

### 7.1 误报反馈

```bash
hx rubric feedback harnessX/assets/rubrics/team-review/rules.yaml rule-001 --false-positive
# rule-001: 1/12 false positives (8%)
```

写入 **规则级** `rules.yaml` 统计。

### 7.2 资产级晋级门槛

`hx asset promote --to enforced` 要求 `asset.yaml` 中：

- `metrics.evaluations ≥ 5`
- `metrics.falsePositives / evaluations ≤ 20%`

指标来自 `hx asset backfill`（telemetry），与 `hx rubric feedback` **分离**。

---

## 8. 完整示例：PR 意见 → enforced 规则

```bash
# 1. 收割
hx steer harvest-pr --from /tmp/review-comments.json

# 2. 细化 rules.yaml，status: trial
# 3. 试运行
hx verify order-split

# 4. 反馈
hx rubric feedback harnessX/assets/rubrics/team-review/rules.yaml rule-001 --false-positive

# 5. 晋级
# 编辑 rules.yaml: status: enforced
hx asset promote harnessX/assets/rubrics/team-review --to enforced
```

---

## 9. CLI 命令速查

### 9.1 Rubric 专用

| 命令 | 说明 |
| --- | --- |
| `hx rubric add "<text>" [--pattern <regex>] [--severity block\|warn\|info]` | 添加 draft 规则 |
| `hx rubric feedback <file> <ruleId> [--false-positive]` | 误报统计 |

### 9.2 Steering

| 命令 | 说明 |
| --- | --- |
| `hx steer report [--threshold 3]` | 失败模式报表 |
| `hx steer distill <sig> --kind sensor.rubric` | 蒸馏 rubric 草稿 |
| `hx steer harvest-pr --from <json>` | PR 评论 → 规则 |
| `hx steer coverage [--aggregate <dir>]` | 覆盖率 |
| `hx steer publish <dir> --hub <path> --by <name>` | 发布 Hub |

### 9.3 资产与 Hub

| 命令 | 说明 |
| --- | --- |
| `hx asset promote <dir> --to trial\|enforced\|deprecated` | 资产状态晋级 |
| `hx asset backfill <dir>` | 回填 metrics |
| `hx verify <change>` | 触发 ai-spec-review |
| `hx janitor run` | 死资产巡检 |
| `hxhub asset create --kind sensor.rubric ...` | Hub 脚手架 |
| `hxhub seed --with rubrics` | 按 profile 种子化 |

---

## 10. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| verify 无 rubric finding | 规则为 draft/deprecated | 改 `trial` 或 `enforced` |
| Hub rubric 不生效 | sensor 只读 `assets/rubrics/` | 复制到 `assets/rubrics/<id>/` |
| 有 check 无 pattern 从不违规 | 启发式跳过 | 补 pattern 或设 `HX_JUDGE_CMD` |
| design 内容未被 Rubric 检查 | 实现只读 proposal+delta | 关键设计点写入 delta spec |
| trial 不阻断 | 设计如此 | 晋级 `enforced` 后 block 生效 |
| `hx asset promote` 失败 | 无 asset.yaml 或 metrics 不足 | 补 manifest + backfill |

---

## 11. 内置 Hub Rubric 规则全表

| 包 ID | 规则 ID | status | severity | check 摘要 |
| --- | --- | --- | --- | --- |
| `common-review-rubrics` | `spec-ambiguous` | enforced | warn | 避免模糊词 |
| `common-review-rubrics` | `rollback-mentioned` | trial | info | 高风险变更提及回滚 |
| `risk-review-rubrics` | `data-migration-risk` | enforced | warn | 数据迁移含回滚/校验 |
| `risk-review-rubrics` | `authz-change` | trial | info | 权限变更提及角色 |
| `api-breaking-change-rubric` | `breaking-endpoint-change` | enforced | block | API 破坏性变更显式标注 |
| `backward-compat-rubric` | `compat-note` | trial | warn | 兼容性策略文档化 |
| `ux-consistency-rubric` | `empty-state-defined` | trial | warn | UI 空态/错态/加载态 |
| `a11y-rubric` | `a11y-mention` | trial | info | 可访问性考量 |
| `uat-quality-rubric` | `uat-signoff` | enforced | warn | UAT 签收记录 |
| `change-risk-rubric` | `risk-tier-documented` | trial | info | 风险档位记录 |
| `spec-quality`（bundle） | `ears-trigger` | enforced | warn | EARS 句式 |
| `spec-quality`（bundle） | `no-placeholder` | enforced | block | 无未填占位符 |

---

## 12. 延伸阅读

| 文档 | 内容 |
| --- | --- |
| [场景 07：Steering 质量治理](examples/07-steering-质量治理.md) | 完整 Steering walkthrough |
| [hxhub 使用手册 §3.4 样例 C](hxhub-usage.zh-CN.md) | Hub rubric 脚手架 |
| [产品经理需求文档编写使用手册](pm-req-manual.zh-CN.md) | req 阶段（script 门禁） |
| [架构师概要设计使用手册](arch-hld-manual.zh-CN.md) | arch 阶段（script 门禁） |
| `packages/core/src/rubric.ts` | 规则模型与 Judge |
| `packages/sensors/src/rubricSensor.ts` | Sensor 执行器 |
