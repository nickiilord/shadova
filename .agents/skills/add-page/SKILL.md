---
name: add-page
description: Use when adding a new page or menu to this RBAC admin (new management page, new menu entry, or a new operation button), or when an existing menu shows 404 / a button is missing because the component key, permission code, or seed entry was not registered.
---

# add-page：新增页面全流程

本仓库页面 = 菜单树节点（DB）+ 约定式页面组件（`src/features/<component>/page.tsx`）+ 权限码（后端裁决 + 前端按钮门控）+ OpenAPI 契约（zod 三合一）。四个环节缺一不可。

## 何时使用

- 新增菜单 / 页面 / 操作按钮
- 菜单点击 404、按钮不显示：组件 key、权限码或种子未注册
- 属于完整业务模块的一部分时：走 add-module 编排，本 skill 作为执行层

## 前置假设

- 已确认菜单注册方式：改种子（随版本入库、团队共享） vs 在线创建（运行时配置、不入种子）
- 后端接口已就绪；需要新增接口时先走 add-api-route 或由 add-module 编排

## 步骤清单

1. **菜单表加 MENU/BUTTON 行**（二选一）：
   - 改种子 `packages/db/src/seed.ts` 菜单树加节点（幂等：有 permission 按 permission upsert，无 permission 按 name+parentId+path 匹配，已存在则复用不更新）→ `pnpm --filter @repo/db seed`
   - 在线创建：登录后用菜单管理页创建（注意种子重跑不会删除在线节点，upsert 只增不改）
   → 验证：DB 中可见新行（`pnpm --filter @repo/db` 下查表或菜单管理页可见）
2. **创建页面组件** `src/features/<component>/page.tsx`（component key 与菜单 `component` 字段完全一致，如 `system/user` → `features/system/user/page.tsx`；路由由 `generateRoutes.tsx` 的 import.meta.glob 自动注册，无需改路由文件）
   → 验证：`pnpm typecheck`；dev 下直接访问该路由非 404
3. **权限码三处联动**：种子 BUTTON 行（如 `system:user:create`，规范 `模块:资源:操作`）+ 后端路由 `requirePermission("...")`（createRoute 的 middleware 数组）+ 前端 `<Permission code="...">` 包裹或 `usePermissionCodes()`
   → 验证：无权限角色登录后按钮不可见（可复用 e2e authorization 用例）
4. **前端按钮/交互模式**：参考 `components/business/` 既有组件（PageHeader、Permission）；请求复用 `src/api/client.ts` 统一重试链，禁止在页面内自行刷新 token
5. **契约与类型**：api 源码有变更时先跑 `pnpm --filter @repo/api generate:openapi && pnpm --filter @repo/api generate:types`
   → 验证：`git diff --exit-code -- apps/api/openapi.json apps/web/src/api/schema.d.ts`（无产物漂移）
6. **文档同步**：涉及表结构变更时同步 `docs/database/schema.sql`（与 schema.prisma 双源约定）；纯接口/页面变更不需要
7. **测试**：补对应测试（api 集成 or web RTL，写法见 test-writing）；e2e 属模块级验收，见 add-e2e

## 红线

- 禁止手写/复制粘贴 `src/components/ui/` 组件源码（shadcn 严格 CLI，见 AGENTS.md 规范要点）
- 禁止在页面/路由内重新定义权限常量字符串（统一引用 `packages/shared/src/permission-codes.ts` 的 PERMISSIONS）
- 禁止只加菜单行而不挂后端中间件——等于接口裸奔；只挂后端不包 `<Permission>`——按钮对所有人生效
- 禁止为单次操作引入递归 SQL/方言专属查询（树操作走 `packages/shared/src/tree.ts` 纯函数）

## 范例索引

- 最简 CRUD 页面四件套：`apps/web/src/features/system/config/`（page + useConfigs + FormDialog + locale）
- 树形页面：`apps/web/src/features/system/department/`（TreeTable + TreeCheckbox）
- 权限门控组件：`apps/web/src/components/business/Permission.tsx`、hook `usePermissionCodes.ts`
- 查询 hook 范式：`apps/web/src/features/system/config/useConfigs.ts`（CONFIGS_QUERY_KEY 前缀 + invalidate 失效模式）
- 种子菜单树结构：`packages/db/src/seed.ts`

## 易错点

- component key 必须与菜单 `component` 字段完全一致（含 `/` 分隔符），否则动态路由映射不到 → 点击 404。
- 新 BUTTON 权限码必须三处联动（种子/后端中间件/前端 `<Permission>`）；只加菜单行不挂码 = 前端按钮不可见、后端接口裸奔。
- 改已有菜单的 name/path（尤其无 permission 的 DIR 节点）会静默新建节点、旧节点残留——删除节点走菜单管理页（级联删子树）。
- 若种子是唯一数据来源，先重跑 seed 再回归，避免手改 dev.db。
- i18n：新页面文案必须 zh/en 两份 locale JSON 同步（`apps/web/src/localization/locales/`）。
