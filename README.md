<div align="center">
  <h1>shadcn-mono</h1>
  <p><strong>一个契约驱动、可测试的全栈 RBAC 管理端 monorepo。</strong></p>
  <p>简体中文 · <a href="./README.en.md">English</a> · <a href="./README.ja.md">日本語</a></p>
</div>

`shadcn-mono` 将 React 管理端、Hono API、Prisma 数据层与共享 RBAC 规则组合在一个 Turborepo 中。它支持本地 JWT、邮箱/手机动态码和 Clerk 登录，并从同一份 Zod/OpenAPI 契约生成接口文档与前端类型。

> [!IMPORTANT]
> `admin / Admin@123` 仅用于本地演示。部署前请更换默认凭据、配置生产密钥，并接入真实的邮件/短信发送服务。

## 设计原则

- **契约优先**：运行时校验、OpenAPI 文档和前端类型来自同一套路由 schema。
- **权限单一事实源**：多角色权限严格交集，算法位于 `packages/shared`，前后端复用。
- **数据库可移植**：Prisma schema 支持 SQLite、MySQL 和 PostgreSQL，避免依赖单一方言。
- **安全默认值**：生产 JWT 密钥强制校验，OTP 数据库只保存哈希，未配置生产 Sender 时失败关闭。
- **可验证交付**：GitHub Actions、Vitest、Testing Library、ESLint、Husky 和 commitlint 组成质量门。

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- pnpm 9.x（仓库固定为 `pnpm@9.12.0`）

### 本地启动

```bash
git clone https://github.com/Nicki518412/shadcn-mono.git
cd shadcn-mono

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

pnpm install
pnpm --filter @repo/db db:push
pnpm --filter @repo/db seed
pnpm dev
```

打开 <http://localhost:5173>。API 地址默认为 <http://localhost:3001>，Swagger UI 位于 <http://localhost:3001/api/docs>。

默认演示账号：`admin / Admin@123`。种子脚本可幂等重跑，并会重置该账号的密码和演示联系方式。

## 功能

- **管理端**：React 19、Vite、React Router、TanStack Query、Tailwind CSS、shadcn/ui。
- **API**：Hono、Zod、`@hono/zod-openapi` 和 Swagger UI。
- **认证**：账号密码、邮箱/手机动态码、Clerk 托管登录。
- **授权**：严格多角色交集；菜单、动态路由和页面按钮共享权限语义。
- **数据层**：Prisma + SQLite / MySQL / PostgreSQL。
- **测试**：API 集成测试、Web RTL 测试、共享权限纯函数测试。
- **工程化**：Turborepo、GitHub Actions、严格 TypeScript、ESLint、Husky、lint-staged、commitlint。

## 仓库结构

```text
apps/
├── api/          # Hono API，默认端口 3001
└── web/          # React 管理端，默认端口 5173
packages/
├── db/           # Prisma schema、client 与幂等种子
├── shared/       # 前后端共享的权限纯函数
└── config/       # 共享 TypeScript / ESLint 配置
docs/
├── business/     # 业务文档（权威：领域模型/权限/规则/API/种子）
├── database/     # 三方言数据库约定与参考 DDL
└── archive/superpowers/  # 历史设计规格与实施计划（已归档）
```

## 权限模型

用户最终权限是所有角色授权集合的**严格交集**：

```text
effectivePermissions(user) = role₁ ∩ role₂ ∩ ... ∩ roleₙ
```

- 任一角色权限为空，最终权限即为空；没有超级管理员绕过。
- `BUTTON` 节点参与权限计算，但不会进入侧边栏或动态路由。
- 导航树会自动补全祖先节点并折叠空目录。
- 权限码格式为 `模块:资源:操作`，例如 `system:user:create`。
- 后端 `requirePermission(code)` 是最终裁决；前端组件只负责显隐。

算法唯一实现在 [`packages/shared/src/permissions.ts`](./packages/shared/src/permissions.ts)。

## 认证与 OTP

前后端 provider 必须保持一致：

```dotenv
# 本地模式
VITE_AUTH_PROVIDER=local
AUTH_PROVIDER=local

# Clerk 模式
VITE_AUTH_PROVIDER=clerk
VITE_CLERK_PUBLISHABLE_KEY="pk_..."
AUTH_PROVIDER=clerk
CLERK_SECRET_KEY="sk_..."
```

开发环境的 `DevOtpSender` 会把验证码输出到 API 控制台，并只保存在当前进程内；数据库始终只保存验证码哈希。OTP 默认 5 分钟有效、60 秒冷却、最多 5 次尝试。

## 数据库

Prisma schema 是运行时权威，参考 DDL 位于 `docs/database/schema.sql`。切换数据库：

1. 修改 `packages/db/.env` 中的 `DATABASE_URL`。
2. 修改 `packages/db/prisma/schema.prisma` 的 `datasource.db.provider`。
3. 执行迁移与种子：

```bash
pnpm --filter @repo/db db:migrate -- --name switch-database
pnpm --filter @repo/db seed
```

完整方言差异见 [数据库指南](./docs/database/README.md)。

## OpenAPI

Swagger UI：<http://localhost:3001/api/docs>

修改 API 后重新生成契约与前端类型：

```bash
pnpm --filter @repo/api generate:openapi
pnpm --filter @repo/api generate:types
```

生成物为 `apps/api/openapi.json` 和 `apps/web/src/api/schema.d.ts`。API 源码提交时，pre-commit hook 会自动更新它们。

## 开发

```bash
# 启动全部开发服务
pnpm dev

# 运行测试、构建和 lint
pnpm turbo test
pnpm turbo build
pnpm turbo lint

# 重建演示数据
pnpm --filter @repo/db seed
```

API 集成测试会重建独立的 SQLite 测试库，不会修改开发数据库。生产启动前必须设置至少 32 个字符的随机 `JWT_SECRET`；开发占位值会导致 API 拒绝启动。

## 文档

- [数据库与权限语义](./docs/database/README.md)
- [业务文档](./docs/business/README.md)
- [历史设计规格与实施计划（归档）](./docs/archive/superpowers/)
- [智能体开发指南](./CLAUDE.md)

## 参与贡献

提交改动前请运行：

```bash
pnpm turbo test
pnpm turbo build
pnpm turbo lint
```

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。开始较大功能前，请先阅读设计文档并在 issue 中说明方案。
