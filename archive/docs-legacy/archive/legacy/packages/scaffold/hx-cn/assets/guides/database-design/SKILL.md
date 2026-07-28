# 数据库设计

填写 HLD 数据库章节；迁移注意见 `db-migration-template`。

## 何时使用
- 任务 `arch.database-design`

## 覆盖
- 核心实体与关系；存储与租户/分区；索引与一致性/迁移风险

## 规则
- 组织级模型；应用迁移放在 change design

## 完成条件
`hx arch check --task database-design` 绿灯
