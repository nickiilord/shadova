---
name: db-schema-change
description: Use when evolving this repo's database schema (adding a model, adding/changing a field or index in packages/db/prisma/schema.prisma), or after a schema change when db push / seed / typecheck fails. For switching database dialect (SQLite/MySQL/PostgreSQL) use switch-database instead.
---

# db-schema-change：数据库结构变更

运行时权威是 `packages/db/prisma/schema.prisma`（三方言可移植）；`docs/database/schema.sql` 是 MySQL 方言文档版，**手工双源同步**。结构同步统一走 `db push`（无迁移文件约定，见 docs/database/README.md）。

## 何时使用

- 新增模型、加字段、改约束/索引
- schema 变更后 db push / seed / typecheck 报错

## 前置假设

- 已确认变更满足三方言约定（§11）：不用 Prisma enum、不用 JSONB/方言专属函数、可空唯一字段冲突转 409
- 涉及新接口/新页面时由 add-module 编排分发到 add-api-route / add-page

## 步骤清单

1. **改 schema.prisma**：模型/字段/索引 + 全字段中文 docstring（可空字段用 `?`，多行文本按 Announcement.content 先例标注 @db.Text 与 MySQL 截断风险）
   → 验证：`pnpm --filter @repo/db generate`（Prisma client 类型同步）
2. **同步 docs/database/schema.sql**（MySQL DDL 文档版）：新表/新字段/索引/注释逐一核对——提交前人工核对，漏同步就是双源分叉
3. **同步结构**：`pnpm --filter @repo/db db:push`（免迁移文件；跨方言历史遗留见 switch-database）
4. **种子**（需要演示数据/菜单/角色时）：改 `packages/db/src/seed.ts`（幂等 upsert 语义见 seed-edit）→ `pnpm --filter @repo/db seed`
5. **接口与页面**：新字段要暴露到 API → add-api-route；新管理模块 → add-module
6. **回归**：受影响包 typecheck + 受影响测试

## 红线

- 禁止用 Prisma enum（字符串 + zod 校验，三方言可移植）
- 禁止 JSONB/方言专属函数/递归 CTE（树操作全量取回 + 内存建树）
- 禁止只改 schema.prisma 不同步 schema.sql（双源强制同步）
- 禁止为结构同步引入迁移文件（当前约定 db push；migrate 预留见 README）

## 范例索引

- 模型 docstring 与索引注释范式：`packages/db/prisma/schema.prisma`（RefreshToken 的 expiresAt 索引注释、Announcement 的 @db.Text 说明）
- MySQL 文档版对照：`docs/database/schema.sql`
- 种子联动：`packages/db/src/seed.ts`

## 易错点

- MySQL 默认 VARCHAR(191) 会截断多行/长内容（Announcement.content 先例：@db.Text + 切库清单说明）。
- 可空唯一字段（邮箱/手机/username）冲突统一转 409，不依赖方言错误码。
- 忘记同步 provider（切库时）是 db push 失败第一原因——切方言走 switch-database。
- 测试库（TEST_DATABASE_URL）独立于开发库，结构变更后由测试初始化重建，不手工维护。
