# 接口设计

在组织 HLD 写清外部/系统间接口；契约形态参考 `api-contract-template`。

## 何时使用
- 任务 `arch.interface-design`

## 覆盖
- 消费方/提供方；协议、鉴权、错误模型；兼容与版本策略

## 规则
- 组织契约；change 级 OpenAPI 放 `design/api/`

## 完成条件
`hx arch check --task interface-design` 绿灯
