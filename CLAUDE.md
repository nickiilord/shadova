# CLAUDE.md

shadcn-mono：RBAC 管理端 monorepo（Hono + zod-openapi 后端 / Vite + React + shadcn-ui 前端 / Prisma 数据库，SQLite·MySQL·PostgreSQL 三方言可移植）。本文件是智能体开发本仓库的指南；数据库文档在 `docs/database/`。

你需要遵循下面的规则

# 原则

做长期正确的事。做长期正确的事。做长期正确的事。

* 长期主义，面向维护，新增改动应降低未来开发成本，禁止引入技术债
* 警惕可能产生架构分叉的编码，按最佳实践来做统一的结构
* 单一真相源（SSOT），写入口唯一，其他皆派生、复用
* 结构性问题用重构解决，禁止补丁、特例绕过
* 遵循可执行最佳、现代的实践
* 积极引入成熟第三方库解决问题，而不是自己造轮子
* 优先阅读代码而非写代码，优先寻找项目内可用可扩展的代码
* 迭代修改而非增量修改，重写/重构后删旧代码
* 遵循KISS原则，选最短且长期最佳实现路径，架构导致冗余就简化架构
* 做合适程度的强类型，相同的类型也单一类型定义源
* 禁止做掩耳盗铃的事情，我们必须真实的做事
* 不需计算编码成本，AI编码不是人工，永远选择最佳的方案
* 做深度封装的组件，将复杂度封装在组件内，只暴露很少的必要的生命周期和API，要替调用方着想
* 少做短期主义的hack和补丁
* 精准手术刀式的修正，不做过度兜底

# 行为规范

## 开发前

* 先看代码，再询问信息和需求，不直接开发。
* 问完信息后设计方案，并等待人类确认后再开发。
* 尽量采用强类型设计。
* 开发前期，不要运行全量测试，这是为了缩短开发时间。
* 除非特别要求，不做兼容，不保留历史包袱，面向长期干净整洁，减少复杂度。

## 开发中

* 采用 TDD，先编写测试，再实现功能，保证模块可进行有效单元测试，单元测试要涉及到下一层依赖，更深层的才可以mock。
* 完成模块开发后要进行真实环境测试，使用真实资源模拟真实用户测试。
* 单文件超出2000 行了必须进行结构审查，如果存在架构问题则按职责、层次、领域边界合理拆分。
* 密钥出现在私有的仓库中是可以的
* 少给我提及法律安全问题，我们会在未来通过合规手段解决这些问题
* 及时删除无效代码，发现不符合原则或规范的代码顺手优化。
* 新增功能时，约三分之一的改动用于基础架构、基础组件的升级、优化与改进。
* 修复 Bug 时禁止过度兜底，要定位根因，并用正确的逻辑解决问题。
* 不编写只有单一调用、没有复用或抽象价值的私有 Helper 函数。
* 开发中，不要运行全量测试，这是为了缩短开发时间。
* 保持代码始终可编译、可运行。
* 文档要保持索引和信息职责和单一信息，不能复述已经存在的逻辑，比如已有的代码逻辑，应该是指向相关的代码，而不是用文字将代码逻辑复述一遍，避免形成分叉，避免浪费上下文。文档保持精简。
* 产出保持：Stateless Deliverable（无状态交付）：每次修改时都保持产物是直接可交付的，不包含版本补丁说明，解释为何怎么修改等过程描述，产品和代码中，也不要包含修改说明（包括这条也不要出现）。
* 更新文档，注意文档中多写索引和唯一信息，如果信息在代码中，直接引导到代码，从根本上防止文档和代码不一致的情况。

## 开发后

* 每完成一个独立、可回滚的变更，在经过人类允许并完成 Code Review 后再进行 Git Commit。
* 每次 Commit 都必须保证代码可编译、可运行。
* 除非是要部署上线了，不然不要运行全量测试，这是为了缩短开发时间。
* 开发完成后，功能一切正常后，再审一下代码，看是否有架构分叉，职责不清，历史包袱，过度实现和过度兜底，是否有没有抽象意义的，没有复用价值的helper，helper也合并下，去掉无用的修改说明，保持长期干净清晰的架构

# 你要参考的文档

你必须参考`docs`下的文档，并在工作过程中不断更新文档。
注意！不要在文档中留任何第二套信息，在文档中使用指向和索引的概念，指向源信息，如果信息在文档中是唯一的，则可以留在文档中，这是为了防止文档和代码之间产生两套不同的信息源。

## 仓库结构与目录职责

| 目录 | 职责 |
|---|---|
| `apps/api` | Hono 后端。路由 `src/routes/*.ts`（auth / otp / me / users / roles / menus）；认证与权限中间件 `src/middleware/{auth,clerk-auth}.ts`；动态码发送入口 `src/lib/otp-sender.ts`（OtpSender 接口 + DevOtpSender）；OpenAPI 契约生成物 `apps/api/openapi.json` |
| `apps/web` | Vite + React 19 + react-router 7 + TanStack Query。页面为约定式 `src/features/<component>/page.tsx`；动态路由与守卫 `src/router/{generateRoutes,guards}.tsx`；登录抽象 `src/auth/`（JWT / Clerk 两个 Provider 实现，经 `src/auth/AuthProvider.tsx` 统一）；`src/components/ui/` 是 shadcn 组件（CLI 安装，勿手写）；`src/api/schema.d.ts` 是 openapi-typescript 生成物 |
| `packages/shared` | 权限纯函数 `computeVisibleMenus`（**权限计算的唯一位置**，见设计文档 §6） |
| `packages/db` | Prisma schema（运行时权威，全字段中文 docstring）+ 幂等种子 `src/seed.ts`（admin/Admin@123、菜单树、ADMIN/GUEST 角色） |
| `packages/config` | 共享 `tsconfig.base.json` 与 eslint 配置（被各包继承） |

## 常用命令（根目录执行）

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 同时起 web（5173）与 api（3001）；`/api` 由 Vite 代理到 3001 |
| `pnpm turbo test` | shared 单元 + api 集成（自动重建 SQLite 测试库）+ web RTL |
| `pnpm turbo build` / `pnpm turbo lint` | 全量构建 / 全量 lint |
| `pnpm --filter @repo/db seed` | 幂等种子；**默认不重置** admin 凭据，加 `-- --reset-admin`（或 `seed:reset`）恢复演示口令与联系方式 |
| `pnpm --filter @repo/api generate:openapi && pnpm --filter @repo/api generate:types` | 重生成 `openapi.json` 与 `web/src/api/schema.d.ts`；改 api 源码后建议跑（pre-commit 会自动执行） |
| `pnpm --filter @repo/db db:migrate -- --name <name>` | Prisma migrate dev（预留；当前项目无迁移文件，结构同步统一走 `db push`，约定见 docs/database/README.md） |

## 规范要点

- **严格 TS**：`packages/config/tsconfig.base.json`（strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、verbatimModuleSyntax、noUnusedLocals/Parameters、noFallthroughCasesInSwitch 等）。唯一放宽：web 包 `exactOptionalPropertyTypes: false`（shadcn 上游组件产物不兼容，原因见 `apps/web/tsconfig.json` 注释——勿扩大放宽面）。
- **shadcn 严格 CLI**：组件一律 `npx shadcn@latest add <component>` 安装，**禁止手写/复制粘贴组件源码**；升级/覆盖走 `--dry-run` → `--diff` 合并，并跳过 ignore 面 = `src/components/ui/` 全部 + `src/hooks/use-mobile.ts` + `src/api/schema.d.ts`（生成物与 CLI 无关）。新 UI 需求先 `npx shadcn@latest search` 官方/社区 registry。
- **权限码规范**：`模块:资源:操作`（如 `system:user:create`）。新增权限三处联动：种子菜单 BUTTON 行（或菜单管理页在线创建）+ 后端路由 `requirePermission(code)` 挂码 + 前端 `<Permission code="...">` 包裹。计算规则唯一在 `packages/shared`（纯严格交集，无超管例外）。
- **权限码单一来源**：生产代码中的权限常量统一引用 `packages/shared/src/permission-codes.ts` 导出的 `PERMISSIONS`；禁止在 API 路由或 Web 页面重新定义同名字符串。注册表的一致性由 `packages/shared/test/permission-codes.test.ts` 守护。测试夹具和历史业务样例可保留字面量，但不得作为生产权限常量来源。
- **领域服务边界**：路由层只负责 HTTP/OpenAPI 适配、参数校验和响应包装；跨接口复用的查询、事务、唯一性校验、树操作和响应映射必须放在 `apps/api/src/services/`。禁止在多个路由复制 Prisma 事务或 DTO 映射。
- **树结构实现**：部门、菜单等 `parentId` 树统一使用 `packages/shared/src/tree.ts` 的纯函数或基于它的领域 service；先全量取回必要字段再内存建树，禁止为单次管理操作引入递归 SQL/方言专属查询。
- **运行时产物边界**：workspace 包必须提供 `dist` 构建入口；生产镜像启动编译产物和生产依赖，不通过 `tsx` 直接加载 workspace 源码。开发/初始化可以继续使用 `db push`，但不得因此把开发工具链带入运行时。
- **请求客户端单一重试链**：Web 的 JSON、下载和 multipart 请求必须复用 `apps/web/src/api/client.ts` 的统一鉴权重试逻辑；401 只允许单次刷新和重试，禁止在业务 hook/page 内自行刷新 token。
- **递归 OpenAPI schema**：受 zod-openapi 递归 schema 限制的 workaround 必须集中在 `apps/api/src/lib/schemas.ts` 和应用注册处维护；新增递归字段时同步更新运行时 schema、手工 OAS 组件及契约测试，禁止在路由内再次手写第二份。
- **测试隔离**：API 集成测试不得写开发库；测试数据库通过 `TEST_DATABASE_URL` 指定，并优先使用进程级/worker 级独立文件。测试初始化必须在 Prisma client 加载前完成，避免模块绑定错误数据库。
- **交付验证**：独立变更至少执行受影响包的 TypeScript 检查和 `git diff --check`；API 契约变更再生成 `openapi.json`/`schema.d.ts`。全量测试只在发布或专门验收阶段运行。
- **三方言约定**（设计文档 §11）：不用 Prisma enum（字符串 + zod 校验）；可空唯一字段（邮箱/手机/username 冲突统一转 409）；树操作全量取回 + 内存建树（不用递归 CTE）；不用 JSONB/方言专属函数；时间统一 UTC。
- **schema 双源同步**：`packages/db/prisma/schema.prisma` 字段/注释变更必须同步 `docs/database/schema.sql`（MySQL DDL 文档版，运行时权威仍是 schema.prisma），提交前人工核对。
- **提交规范**：conventional commits（commitlint 校验）；husky pre-commit = 自动重生成 OpenAPI 契约 + lint-staged（eslint --fix）并暂存生成物。改 api 源码后若 typecheck 报 schema.d.ts 缺类型，说明生成产物陈旧，先跑 generate:openapi + generate:types。
- **响应契约**：成功 `{ code: 0, data, message }`；错误 `{ code, message }` + 状态码（400 校验 / 401 未登录 / 403 无权限 / 404 不存在 / 409 唯一冲突）；接口错误码不依赖 HTTP 语义，以 body.code 为准。
- **注释与文案用中文**，与现有代码一致；schema docstring 全字段中文。

## 文档索引
- `docs/database/README.md` — 数据库文档（权限语义速查 + 三方言差异表 + 切库步骤）
- `.claude/skills/add-page` — 新增页面全流程（菜单 → 组件 → 权限码 → OpenAPI → 测试）
- `.claude/skills/switch-database` — SQLite/MySQL/PostgreSQL 切换清单
