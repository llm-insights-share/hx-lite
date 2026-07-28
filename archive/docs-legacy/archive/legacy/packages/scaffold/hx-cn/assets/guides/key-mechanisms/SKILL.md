# 关键设计机制

在组织 HLD 记录横切机制与 ADR（可选任务）。

## 何时使用
- 任务 `arch.key-mechanisms`

## 覆盖
- 鉴权、幂等、事务/发件箱、缓存、限流等（按需）；决策上下文与后果

## 规则
- 优先链接已有 ADR；可选任务允许 warn

## 完成条件
`hx arch check --task key-mechanisms` 绿灯（或仅 warn）
