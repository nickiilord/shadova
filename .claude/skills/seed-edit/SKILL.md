---
name: seed-edit
description: Use when modifying this repo's seed data (adding menu tree entries, permission codes, roles, dictionary types/items, configs, or demo data in packages/db/src/seed.ts), or when a seed rerun creates duplicates / silently misbehaves.
---

# seed-edit：种子数据修改

种子幂等可重跑，但 upsert 匹配语义有讲究：**有 permission 按 permission 匹配；无 permission 按 nameZh+parentId+path 匹配；已存在则只同步 nameEn/icon，其余字段不更新**。改错了会静默新建节点、旧节点残留。

## 何时使用

- 加菜单/按钮、加权限码、加角色、加字典/参数/演示数据
- seed 重跑出现重复数据、改名后旧节点残留

## 前置假设

- 已确认走种子（随版本入库、团队共享）还是菜单管理页在线创建（运行时配置、不入种子）——两者可以并存，种子不删在线节点
- 新增权限码必须三处联动：种子 BUTTON 行 + 后端 `requirePermission` + 前端 `<Permission>`（见 add-page）

## 步骤清单

1. **定位 seed.ts 对应段**：菜单树（1）/ 角色授权（2）/ admin 账号（3）/ 演示部门（3.1）/ 演示数据（4.0-4.1）/ 摘要（5）
2. **按幂等语义修改**：
   - 菜单/按钮：`upsertMenu(...)`，MENU 行带 permission（稳定键）+ component/path；BUTTON 行带 permission
   - 角色：`prisma.role.upsert`（code 唯一键）+ deleteMany/createMany 全量覆盖授权
   - 字典：typeCode 唯一键 upsert，字典项 deleteMany + createMany 全量替换
   - 演示数据（公告/通知）：仅表空时插入，**不得覆盖人工编辑内容**
3. **重跑种子**：`pnpm --filter @repo/db seed`
4. **验证幂等**：再跑一次 `pnpm --filter @repo/db seed`，确认无重复、无异常输出
   → 验证：`pnpm --filter @repo/db seed` 连续两次结果一致

## 红线

- 禁止在 seed 之外手改 dev.db（种子是唯一数据来源时先重跑再回归）
- 禁止修改 admin 凭据逻辑（默认不重置；`--reset-admin` 才恢复演示凭据，防生产库误跑回滚）
- 禁止只加种子不加后端中间件/前端门控（权限码三处联动）

## 范例索引

- `packages/db/src/seed.ts`（upsertMenu 语义注释在文件头部 + 各演示数据段注释）

## 易错点

- DIR 节点无 permission/path 稳定键（按 nameZh+parentId 匹配）：**改名会静默新建节点、旧节点残留**——删除节点走菜单管理页（级联删子树）。
- 菜单管理页创建的节点不会被种子删除（upsert 只增不改）。
- 无 permission 的 MENU（通知中心先例）按 nameZh+parentId+path 匹配，改名同样触发静默新建。
- 摘要计数在文件尾，改完可对照数量核对。
