# /hx-req-biz-understanding — 业务理解

你正在执行 **req** 阶段任务 `biz-understanding`。

## 输入
- 从斜杠命令参数或用户消息中解析标识（如 change / slug / 模块名）。

## 步骤
1. 加载本阶段/任务的 Context Pack 与约束。
2. 遵循绑定的 Skill / Template（见附录「特别上下文」）。
3. 产出本任务约定的交付物。

## 产出
- 按绑定模板与任务定义生成交付文档或代码变更。

## 护栏
- 已有绑定模板时，不得自行发明文档结构。
- 不得伪造未确认的业务规则或接口。

## 完成标准
- 本阶段/任务对应的 Sensor 门禁通过（绿灯）。

<!-- harnessx:bound-guides -->

## 特别上下文 / 特别约束（自动注入）

### 特别上下文 — 加载上下文
1. 加载 `<slug>` 的 PRD Context Pack。
2. 阅读章程、绑定 Guide 与 PRD 产物。

### 绑定 Skills

| id | kind | source |
|----|------|--------|
| `biz-understanding-outline` | guide.skill | |
| `requirements-research-outline` | guide.skill | |

### 绑定 Templates

| id | kind | source |
|----|------|--------|
| — | — | — |

### 如何使用绑定 Guide
- **Skills（2）：** 按领域匹配优先；不明确时询问用户优先级。

### 特别约束 — 绑定 Sensors

| sensor |
|--------|
| `req-biz-understanding` |

### 特别约束 — 门禁
宣称完成前：执行 gate check `--stage req --task biz-understanding`，未通过不得结束。
