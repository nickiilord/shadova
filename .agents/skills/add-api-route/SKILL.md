---
name: add-api-route
description: Use when adding or modifying a backend API endpoint in this RBAC admin (new REST route, changing a request/response contract, or a 500/契约错误 caused by a schema mismatch). For a full vertical slice, the add-module skill orchestrates this.
---

# add-api-route：后端接口新增

后端接口 = 具名 zod schema（`lib/schemas.ts`）+ 路由（`routes/*.ts`）+ 领域 service（`services/`，跨接口复用才需要）+ 契约生成。契约由 zod 单一驱动：请求校验、OpenAPI 文档、前端类型三处同源。

## 何时使用

- 新增/修改后端接口（响应契约、请求参数、错误码）
- 接口报错：契约与实现不一致、schema.d.ts 缺类型

## 前置假设

- 权限码已确定（`模块:资源:操作`，引用 `packages/shared` 的 PERMISSIONS，禁止新定义字符串）
- 涉及表结构变更时先走 db-schema-change

## 步骤清单

1. **写具名 zod schema**（`apps/api/src/lib/schemas.ts`）：列表项 → Detail → PageResult 三件套，`.openapi("XxxListItem")` 命名；递归 schema 见 menuNodeSchema 先例（zod-openapi 不支持 z.lazy，OAS 组件在 index.ts 手工注册）
2. **写路由** `apps/api/src/routes/<name>.ts`：`createRoute` 五要素齐全——method/path/middleware（`authenticate(cfg)` + `requirePermission(PERMISSIONS.x)`）/`security: bearerSecurity`/request/responses（400/401/403/404/409 按需）；子应用用 `createSubApp()`（统一 defaultHook）
3. **响应与错误**：成功 `okBody(schema)` 包装；唯一冲突 `p2002Conflict(err, UNIQUE_FIELDS)` → `HttpError(409, code, message)`；不存在 `notFound("...")`；校验失败自动 400（validationHook）
4. **领域 service**：跨接口复用的查询、事务、唯一性校验、树操作、DTO 映射放 `services/`；单接口简单查询留在路由（如 configs 先例）
5. **操作日志敏感路径**：接口请求体含凭据/敏感值时，将路径加入 index.ts 的 SENSITIVE_PATHS（跳过请求体快照）
6. **注册路由**：index.ts `app.route("/", xxxRoutes(cfg))` + import
7. **契约生成**：`pnpm --filter @repo/api generate:openapi && pnpm --filter @repo/api generate:types`
   → 验证：`git diff --exit-code -- apps/api/openapi.json apps/web/src/api/schema.d.ts`（无漂移）
8. **测试**：`apps/api/test/<name>.test.ts` 集成测试（写法见 test-writing；helpers 复用 loginAs/upsertMenu）

## 红线

- 禁止在路由内复制 Prisma 事务或 DTO 映射（领域服务边界，AGENTS.md 规范要点）
- 禁止手写第二份递归 schema（集中在 schemas.ts + index.ts 注册处维护）
- 禁止裸 `as` 转类型——用 zod 校验收窄（menuTypeSchema 先例）
- 响应必须是 `{ code: 0, data, message }`；错误码不依赖 HTTP 语义
- 可空唯一字段冲突统一转 409（三方言约定）

## 范例索引

- 最简 CRUD 路由：`apps/api/src/routes/configs.ts`（分页/创建/详情/PATCH/删除 + 409 映射 + exactOptionalPropertyTypes 条件赋值）
- 领域 service：`apps/api/src/services/role-service.ts`（事务 + 唯一性校验 + 响应映射）
- 递归 schema：`apps/api/src/lib/schemas.ts` menuNodeSchema + index.ts 注册
- 集成测试：`apps/api/test/configs.test.ts`（beforeAll 建角色菜单、beforeEach 清理、权限 401/403 用例）

## 易错点

- exactOptionalPropertyTypes：`undefined` 不可赋给可选字段——条件赋值或显式转 null（configs 先例）。
- P2002 大小写变体同样命中唯一约束（如 configKey 统一小写存储 + 409 语义）。
- PATCH 语义：显式 null = 清空，undefined = 不修改（body 全字段 partial）。
- 改 api 源码后 typecheck 报 schema.d.ts 缺类型 → 生成产物陈旧，先跑 generate:openapi + generate:types。
- 带敏感字段的接口不落请求体快照（SENSITIVE_PATHS），否则操作日志泄密。
