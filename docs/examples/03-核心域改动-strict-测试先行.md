# 场景 03：支付核心域改动 —— strict profile 与测试先行

## 背景

支付网关（payment-gateway）的 `constitution.md` 声明了核心域：

```markdown
core-domains: [payment-charging, payment-settlement]
```

本次需求：**支持预授权（先冻结后扣款）**，直接动 `payment-charging`。团队规则：核心域改动必须走 strict profile——多一个 explore 阶段、verification-strict 套件、以及**测试先行**（人先批准测试断言，agent 才能写实现）。

角色：**周工**（支付组开发）、**陈老师**（QA，负责批准测试断言）、**张架构师**（spec 批准人）。

## 操作步骤

### 1. 创建 change，profile 推荐自动介入

```console
$ hx change create pre-auth --domains payment-charging
Created change "pre-auth" (profile: standard, domains: payment-charging)

$ hx profile recommend pre-auth --diff-lines 600
recommended: strict (score 4)
  - estimated diff 600 lines (+1)
  - touches core domain(s) payment-charging (+3)

$ hx profile recommend pre-auth --choose strict
recommended: strict (score 3)
  - touches core domain(s) payment-charging (+3)
profile set to strict
```

如果周工想偷懒选 standard，系统会要求书面理由并记录在案：

```console
$ hx profile recommend pre-auth --choose standard
hx: profile "standard" is below the recommended "strict" — provide --override-reason (recorded in meta.yaml, FR-013)
```

（降级理由会写入 `meta.yaml` 的 `profileRecommendation.overrideReason`，审计时一目了然——谁在核心域上跳过了严格流程、为什么。）

### 2. explore：只读探索

strict profile 的第一个阶段是 explore。周工让 agent 先读代码、不许写：

```console
$ hx explore pre-auth --topic "现有扣款状态机与幂等键设计"
Wrote harnessX/changes/pre-auth/explore.md
Read-only phase: do not modify code. Gate check will flag staged code edits.
```

`hx guide pack pre-auth --phase explore` 组装的 Context Pack 中权限声明是 **READ-ONLY**——这是喂给 agent 的第一条指令。探索结论（"现有状态机有 CREATED→CHARGED 两态，需插入 FROZEN 态；幂等键可复用"）写入 explore.md，成为 design 阶段的输入。

### 3. propose / design / spec / 批准（同场景 02，略）

delta spec 写好、`hx gate advance` 逐阶段推进、张架构师 `hx gate approve pre-auth --gate spec --approver zhang.arch`。

### 4. 测试先行：生成 → 人工评审 → 批准锁定

```console
$ hx testfirst generate pre-auth
wrote tests/generated/pre-auth-payment-charging.test.ts
Review the stubs, write assertions, then: hx testfirst approve <change> --files <f1,f2> --by <name>
```

生成的桩按 Scenario 一一对应，初始全部抛错（保证"未实现前必红"）：

```typescript
it("Scenario: freeze succeeds within limit", () => {
  // Requirement: 预授权冻结
  throw new Error("not implemented — write assertions before implementation (FR-026)");
});
```

**陈老师（QA）补全断言**——金额边界、幂等重放、超时解冻——然后批准锁定：

```console
$ hx testfirst approve pre-auth --files tests/generated/pre-auth-payment-charging.test.ts --by chen.qa
approved test files recorded in meta.yaml (hash-locked)
```

### 5. 独立会话实现：agent 改不动已批准的断言

`hx plan` + `hx apply` 后，周工换一个**全新的 agent 会话**做实现（测试先行的核心：写测试的会话和写实现的会话隔离，避免 agent "顺手"把测试改成能过的样子）。

某次迭代中 agent 觉得一个断言"太严格"，直接改了期望值。verification-strict 套件里的 `approved-tests` 传感器当场拦截：

```console
$ hx verify pre-auth
BLOCKER  approved-tests: 1 approved test file(s) modified
  - approved test modified: tests/generated/pre-auth-payment-charging.test.ts — assertions were approved by a human (FR-026)
NOT VERIFIED
```

两条出路，都要走人：

- **断言确实该改**（规格理解错了）：陈老师重新 review 后再次 `hx testfirst approve ... --by chen.qa`（更新哈希）；
- **临时豁免**（如断言依赖的外部沙箱环境本周不可用）：

```console
$ hx waiver add pre-auth \
    --target "tests:tests/generated/pre-auth-payment-charging.test.ts" \
    --reason "银行沙箱 7/10 前不可用，超时断言暂放宽" \
    --requested-by zhou.dev --approved-by chen.qa \
    --expires 2026-07-11T00:00:00Z
waiver 3fa1b2c8 added for tests:tests/generated/pre-auth-payment-charging.test.ts, expires 2026-07-11T00:00:00.000Z
```

waiver 有**申请人、批准人、理由、过期时间**四要素；过期自动失效，janitor 会催办（场景 07）。

### 6. verify（strict 套件）→ archive

verification-strict 比 standard 多跑 `ai-spec-review`（rubric 传感器，检查规格与实现的一致性叙述）等推理型检查。全绿后照常 archive。

## 关键机制解析

- **profile 推荐是"防遗忘"而非"防恶意"**：真正的强制在于降级必须留痕。月度审计只需查 `profileRecommendation.overrideReason` 非空的 change。
- **测试先行的三道锁**：① 生成桩必红（未实现先失败）；② 人批准后哈希锁定；③ 修改被 `approved-tests` 传感器阻断，豁免必须走 waiver。这把"测试是行为规格的可执行形式"落成了硬约束。
- **会话隔离**：写测试与写实现分属不同 agent 会话，等价于人类团队的"测试评审与实现评审分离"，是对抗 reward hacking（改测试凑绿）最有效的结构性手段。
