---
name: test-writing
description: Use before writing any test in this RBAC admin (unit / api integration / web RTL / e2e), when a test fails unexpectedly, or when deciding how deep to mock. Covers the three test layers, TDD order, naming, fixtures, and isolation rules.
---

# test-writing：测试规范

四层测试边界固定：**shared 纯函数**（直接调用）→ **api 集成**（真实 Prisma + `createApp().request()`，mock 到 helpers）→ **web RTL**（mock 到 api client 层）→ **e2e**（page object + fixtures）。单元测试要涉及到下一层依赖，更深层才允许 mock。

## 何时使用

- 写任何测试前（TDD：先写测试再实现）
- 测试失败排查（先判断是断言问题还是实现问题）
- 不确定 mock 边界

## 步骤清单

1. **选定层级**：
   - shared 纯函数（tree/permissions）→ `packages/shared/test/` 直接调用，无 mock
   - api 集成 → `apps/api/test/<module>.test.ts`：`createApp()` + `app.request()`，真实数据库（TEST_DATABASE_URL 指定，setup.ts 在 Prisma client 加载前初始化）
   - web RTL → `apps/web/test/<page>.test.tsx`：jsdom + setup.ts（已 stub ResizeObserver/matchMedia/PointerEvent/VITE_APP_NAME/i18n zh），mock 边界在 `@/api/client` 层
   - e2e → add-e2e
2. **TDD 顺序**：先写失败测试 → 实现 → 测试转绿（断言业务规则，不断言实现细节/内部调用次数）
3. **前置数据**：测试内自建（beforeAll 建用户/角色/菜单——用 helpers 的 `createTestUser`/`loginAs`/`upsertMenu`；beforeEach 清理本文件前缀数据，防测试间污染）
4. **断言模式**：状态码 + 契约体字段 + 落库校验（`prisma.findUnique` 验证副作用）；错误断言 code/message 而非仅状态码
5. **权限用例**：每个接口至少覆盖 401（未登录）+ 403（无权限，越权操作不落库）
6. **验证**：跑受影响文件（不跑全量）——`pnpm --filter @repo/api test -- test/<module>.test.ts` 或 vitest 对应 filter

## 红线

- 禁止 mock 下一层依赖（深度 mock 会掩盖集成错误；只有更深层才 mock）
- 禁止写开发库（api 集成测试必须走 TEST_DATABASE_URL）
- 禁止在 web 测试发真实网络请求（mock api client）
- 禁止 e2e 用例依赖种子数据之外的固定 id/顺序

## 范例索引

- api 集成完整模式：`apps/api/test/configs.test.ts`（角色/菜单前置 + 清理 + 409/401/403 全覆盖）
- helpers：`apps/api/test/helpers.ts`（createTestUser/loginAs/upsertMenu/captureDevOtpCode）
- web 环境 stub：`apps/web/test/setup.ts`（jsdom 缺失 API 注入）
- 契约测试：`apps/api/test/schemas.test.ts`（递归 schema 以真实响应实测）
- e2e fixture：`e2e/fixtures.ts`

## 易错点

- SQLite LIKE 对 ASCII 大小写不敏感且 `_` 是通配符——清理前缀与管理员用户名严格区分（configs 先例）。
- exactOptionalPropertyTypes：测试数据可选字段显式置 null（helpers.ts 注释）。
- 测试库与开发库方言可以不同（api 测试自动重建 SQLite test.db）。
- 动态码测试用 `captureDevOtpCode` 读进程内验证码，不落库。
