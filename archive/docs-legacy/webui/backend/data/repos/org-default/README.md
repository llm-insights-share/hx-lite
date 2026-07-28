# Default Org — Organization HX Hub

本仓库由 **HX WebUI** 组织维护系统导出并推送，保存组织级 HX 配置与资产。

## 目录说明

| 路径 | 说明 |
|------|------|
| `hub-policy.yaml` | 组织策略（不含 token） |
| `profiles.yaml` | Profile → Stage → Task 矩阵（Task 直绑 guides/sensors） |
| `suites.yaml` | 兼容占位（空对象；产品层已取消 Suite） |
| `catalog.yaml` | 全资产索引 |
| `commands/` | IDE 斜杠命令壳（Command Shell） |
| `skill-shells/` | IDE Skill 壳（无 slash command 的 IDE） |
| `packages/guide/` | Guide 资产包（skill / template / …） |
| `packages/sensor/` | Sensor 资产包 |
| `.hx-webui/export-meta.yaml` | 导出元数据 |

## 消费方式

业务项目可按 Profile 从本 Hub 拉取 stage.task 相关资产；IDE 可由 CLI 从 `commands/` 与 `skill-shells/` 投影安装。

> 请勿在本仓库提交 GitHub Token 或其它密钥。
