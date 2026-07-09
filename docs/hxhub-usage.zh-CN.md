# hxhub 使用手册（独立 Hub 运维 CLI）

`hxhub` 是从 `hx hub` 能力中抽离出的独立命令，面向 **Hub 运维、资产脚手架与诊断**。  
`hx` 与 `hxhub` 可长期并存：`hx` 偏项目交付，`hxhub` 偏 Hub 运维。

## 1. 角色分工

| CLI | 主要定位 |
| --- | --- |
| `hx` | 交付流程（propose/design/apply/gate 等）+ 兼容 `hx hub` |
| `hxhub` | Hub 运维、资产交互创建、doctor 诊断、资产建议 |

## 2. 快速开始

### 2.1 初始化轻量运维项目

```bash
hxhub init . --hub git@github.com:your-org/hx-hub.git --actor zhao.platform
```

仅生成最小文件：
- `harnessX/config.yaml`
- `harnessX/roles.yaml`
- `.gitignore`（忽略 `.hub-remotes/.hub-cache`）
- `README.hxhub.md`

### 2.2 连接检查

```bash
hxhub doctor --fix-hints
hxhub search --category package
```

## 3. 运维命令（整合 v0.4）

- `hxhub golden`
- `hxhub seed [path]`
- `hxhub search [query] [--index]`
- `hxhub catalog rebuild`
- `hxhub promote <dir> --by <name>`
- `hxhub review request|approve|reject`
- `hxhub asset info|promote|deprecate`
- `hxhub submit <dir>`
- `hxhub contributions list|show|accept|reject`
- `hxhub policy check [--strict]`
- `hxhub eval <id@version> [--local|--golden|--list]`
- `hxhub push [--message]`

## 4. 资产交互创建

### 4.1 非交互

```bash
hxhub asset create \
  --kind guide.skill \
  --id idempotency-keys \
  --version 1.0.0 \
  --status draft \
  --out ./assets/idempotency-keys
```

### 4.2 交互式

```bash
hxhub asset create --interactive
```

会自动生成 `asset.yaml` 与对应模板文件：
- `guide.skill` -> `SKILL.md`
- `guide.template` -> `template.md`
- `sensor.rubric` -> `rules.yaml`
- `harness.bundle` -> `bundle.yaml` + `assets/`
- `harness.blueprint` -> `blueprint.yaml`

## 5. AI 建议与诊断

### 5.1 建议

```bash
hxhub help general
hxhub help api --json
```

输出推荐资产、推荐原因与下一步命令。

### 5.2 诊断

```bash
hxhub doctor
hxhub doctor --json
hxhub doctor --fix-hints
```

诊断范围：
- Hub 连接与角色配置
- hub-policy maintainer 与审批门禁
- 治理策略问题（owner/hash/review 等）
- contributions 队列健康度
- eval 集是否缺失

## 6. 典型运维流程

```bash
# 1) 生成资产骨架
hxhub asset create --interactive

# 2) 发布到 Hub（maintainer）
hxhub promote ./assets/my-skill --by zhao.platform --evidence "ci://runs/1820"
hxhub review approve my-skill@1.0.0 --reviewer zhao.platform
hxhub asset promote my-skill@1.0.0 --to enforced

# 3) 推送远程
hxhub push --message "publish: my-skill@1.0.0"
```

## 7. 兼容性说明

- 现有 `hx hub ...` 仍可继续使用。
- 推荐新运维项目使用 `hxhub`，旧项目可按需渐进迁移。
