# Guide Harness 设计与样例（constraint / exemplar / scaffold / glossary / capability）

> 面向组织 HX 维护：说明内置前馈 Guide 类型如何在 AI 编程交付中起 **harness** 作用，并给出可入库的真实样例。组织还可在「设置」中增加自定义 `guide.*` 类型。

相关设计总览见 [harness-delivery-system-design.html](./harness-delivery-system-design.html)。WebUI + nhx 用法见 [webui-nhx-usage.zh-CN.md](./webui-nhx-usage.zh-CN.md)。

## 1. 为何需要这些类型

Skill / Template 解决「怎么写」与「产出长什么样」。交付系统仍需要：

- **收窄解空间**（不许怎样）→ Constraint  
- **用实例校准**（像不像金标准）→ Exemplar  
- **确定性起盘**（先别猜目录）→ Scaffold  
- **统一语言**（别发明词）→ Glossary  
- **能力边界**（能调什么工具）→ Capability  
- **组织扩展** → 自定义 `guide.<slug>`（在组织设置中维护）

它们与 Check **成对**才构成完整 harness：Guide 前馈改变行为分布，Check 反馈给出可消费的校正信号。

## 2. 与 Skill / Template 的分工

| 对比 | Skill | Template | 其它内置典型职责 |
|------|-------|----------|----------------|
| Constraint | 教规范 | — | 声明硬禁令与边界，宜机器可读 |
| Exemplar | 抽象步骤 | — | 正/反例 few-shot |
| Scaffold | — | 文档骨架 | 仓库/变更目录的可执行起盘 |
| Glossary | — | — | 术语与命名映射 |
| Capability | — | — | Agent 工具/命令白名单与红线 |

## 3. 各类设计口径

### 3.1 `guide.constraint`（硬约束）

- **Harness 作用**：把非法解直接排除（依赖方向、兼容性禁令等）。  
- **写法**：条目化 + 理由 + 违规示例；尽量可被结构测试/规则 sensor 复用。  
- **成对 Check**：`sensor.arch` / `sensor.rule` / inline `file.exists` 等。  
- **建议阶段**：`arch`、`dev`。

### 3.2 `guide.exemplar`（范例）

- **Harness 作用**：用短正/反例校准输出形态，比长篇抽象规则更稳。  
- **写法**：金标准片段 + 反例 + 「为何好/坏」；可复制到产物。  
- **建议阶段**：`req`、`arch`、`dev`。

### 3.3 `guide.scaffold`（脚手架）

- **Harness 作用**：用确定性步骤生成骨架，避免 Agent「猜」工程结构。  
- **写法**：目录树、必建文件、初始化命令、完成标准。  
- **建议阶段**：`req`/`arch` 起盘、`dev/plan`。

### 3.4 `guide.glossary`（术语表）

- **Harness 作用**：统一语言，防止文档与代码命名漂移。  
- **写法**：术语定义、禁用说法、代码/产物命名映射。  
- **建议阶段**：全阶段（尤其 `req`/`arch`）。

### 3.5 `guide.capability`（能力说明）

- **Harness 作用**：从工具与权限边界约束 Agent 行为空间。  
- **写法**：允许命令、禁止操作、MCP/密钥红线。  
- **建议阶段**：全阶段 / IDE hooks 前置提醒。

### 3.6 自定义 `guide.<slug>`

- 在组织 **设置 → 自定义 Guide 类型** 增加 id（如 `guide.playbook`）、标题、说明与 category。  
- 创建 Guide 时可选用；任务壳附录中归入「其它 Guides」。

## 4. 样例清单与建议绑定

| asset_id | kind | 意图摘要 | 建议绑定 |
|----------|------|----------|----------|
| `module-boundary-rules` | constraint | UI→App→Domain→Infra 依赖方向 | `arch/internal-interface` |
| `api-compat-constraints` | constraint | 对外 API 无版本破坏禁令 | （UI 绑定；默认不强制挂矩阵） |
| `prd-section-exemplars` | exemplar | PRD 用户故事/验收标准正反例 | `req/prd-writing` |
| `api-handler-exemplars` | exemplar | Handler 校验/错误码/日志对照 | `dev/apply`（可选） |
| `change-scaffold` | scaffold | `changes/<id>/` 起盘步骤 | `dev/plan` |
| `module-scaffold` | scaffold | 新业务模块目录与空文件清单 | （UI 绑定） |
| `delivery-glossary` | glossary | HX 交付术语（Stage/Task/…） | 全阶段可读；默认挂 `req/prd-writing` 旁或仅入库 |
| `domain-naming-glossary` | glossary | slug/task_id/artifact 命名 | （UI 绑定） |
| `agent-tool-allowlist` | capability | nhx/git/测试允许与破坏性禁止 | （UI 绑定） |
| `mcp-boundary-capability` | capability | MCP/密钥红线 | （UI 绑定） |

**默认幂等种子仅自动绑定：**

- `prd-section-exemplars` → `req` / `prd-writing`  
- `module-boundary-rules` → `arch` / `internal-interface`  
- `change-scaffold` → `dev` / `plan`  

其余样例入库（`status=trial`），由组织管理员在 Stage&Task 中按需勾选。

## 5. 使用方式（简）

1. 组织 HX → Guides：按 kind 筛选查看样例。  
2. Stage & Task：将 Guide 绑到任务。  
3. 项目侧「初始化/同步」或本地 `nhx sync` 后，任务壳附录可见绑定。  
4. 宣称完成前：`nhx check --stage … --task …`。

## 6. 维护约定

- 样例正文位于 `webui/backend/data/hubs/default/packages/guide/<kind>/<asset_id>/1.0.0/`。  
- 元数据见 `webui/backend/app/domain/guide_samples.py`。  
- 启动时幂等插入，**不会**清空已有组织资产（不同于全量 bootstrap）。
