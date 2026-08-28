---
name: add-module
description: Use when adding a complete new business module to this RBAC admin (a new management category needing its own table + API + page + tests + e2e, e.g. a new system/xxx management feature), or when unsure which of the vertical-slice parts (table / API / page / e2e) are missing.
---

# add-module：新增业务模块总编排

模块 = 表（可选）+ API + 页面 + 测试 + e2e 的垂直切片。本 skill 是**编排入口**：只做盘点与分发，具体步骤委托给执行层 skill，禁止复制执行层内容（双源）。

## 何时使用

- 新增完整业务模块（如"通知管理""定时任务"）
- 需求横跨表/接口/页面多端，无法确定环节

## 前置假设

- 已确认模块需求与数据模型：表结构（或明确复用现有表）？权限码清单（`模块:资源:操作`）？菜单层级？
- 与现有模块无命名/职责重叠（先查 `apps/api/src/routes/`、`apps/web/src/features/`、菜单种子）

## 步骤清单

1. **盘点环节 → 分发执行层**（按需调用，禁止跳过）：
   - 需要建表/改字段 → **db-schema-change**（含 schema.sql 双源同步）
   - 需要后端接口 → **add-api-route**（含 service 边界、契约生成）
   - 需要页面/菜单/按钮 → **add-page**（含权限三处联动、i18n）
   - 需要 e2e → **add-e2e**（含 page object、fixtures）
2. **逐环节验证，不攒到最后**：每个执行层完成后立即验证其自有命令（typecheck / 契约 diff / 受影响测试）
3. **全模块回归**：
   → 验证：`pnpm typecheck`；`pnpm turbo lint`；受影响包测试（`pnpm turbo test --filter=...`）
4. **文档同步**：核对 `docs/database/schema.sql`、AGENTS.md 文档索引（新模块是否应入索引）
5. **提交前**：走 pre-commit-check 质检清单（契约产物、git diff --check、无 dead code、Stateless）

## 红线

- 禁止跳过环节（只加页面不加权限码 = 接口裸奔；只建表不加接口 = 死表）
- 禁止绕过执行层 skill 自行发挥——垂直切片是最高频的格式分叉来源
- 禁止在每个模块重复造轮子：先查 `services/`、`components/business/`、`packages/shared/` 是否已有可复用实现

## 范例索引

- 最简 CRUD 模块全景（含全部环节）：`system/config`——种子段（`packages/db/src/seed.ts`）→ `apps/api/src/routes/configs.ts` → service → `apps/web/src/features/system/config/` → `e2e/tests/09-configs/configs.spec.ts`
- 树模块全景（父级树 + 级联删除 + TreeCheckbox 授权）：`system/department`
- 带字典/枚举值字段的模块：`system/dict`

## 易错点

- 新权限码必须三处联动（seed / 后端中间件 / 前端 `<Permission>`）。
- 新表字段必须同步 `docs/database/schema.sql`（MySQL 文档版双源，提交前人工核对）。
- e2e 每用例独立登录，禁用 storageState（refresh token 单活轮换竞态，见 `e2e/fixtures.ts` 注释）。
- 测试库与开发库隔离：api 集成测试用 TEST_DATABASE_URL，禁止写开发库。
