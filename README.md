<div align="center">
  <h1>Shadova</h1>
  <p><strong>一个契约驱动、可测试的全栈 RBAC 管理端 monorepo。</strong></p>
  <p>
    <a href="https://github.com/nickiilord/shadova/actions/workflows/ci.yml"><img src="https://github.com/nickiilord/shadova/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node >=22">
    <img src="https://img.shields.io/badge/pnpm-9.12.0-orange.svg" alt="pnpm 9.12.0">
    <img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" alt="Strict TypeScript">
  </p>
  <p>
    <a href="https://codespaces.new/nickiilord/shadova"><img src="https://github.com/codespaces/badge.svg" alt="Open in GitHub Codespaces"></a>
  </p>
  <p>简体中文 · <a href="./README.en.md">English</a> · <a href="./README.ja.md">日本語</a></p>
</div>

![管理端 · 用户管理](./docs/images/admin-users.png)

`Shadova` 将 React 管理端、Hono API、Prisma 数据层与共享 RBAC 规则组合在一个 Turborepo 中。它支持本地 JWT、邮箱/手机动态码和 Clerk 登录，并从同一份 Zod/OpenAPI 契约生成接口文档与前端类型。

> [!IMPORTANT]
> `admin / Admin@123` 仅用于本地演示。部署前请更换默认凭据、配置生产密钥，并接入真实的邮件/短信发送服务。

## 为什么选它

| 特性 | 说明 |
|---|---|
| **契约驱动** | 一份 zod schema 同时产出运行时校验、OpenAPI 文档与前后端 TypeScript 类型；改接口不会漏改前端（`openapi.json` → 两端 `schema.d.ts` 由 pre-commit 自动同步） |
| **权限严格交集** | 多角色权限取**交集**而非并集，无超管例外；算法单一实现于 `packages/shared`，菜单、动态路由、页面按钮与接口中间件共用同一语义 |
| **数据库可移植** | 一份 Prisma schema 兼容 SQLite / MySQL / PostgreSQL，规避方言特性（不用 enum、不用递归 CTE、不用 JSONB） |
| **垂直切片完整** | 用户 / 角色 / 菜单 / 部门 / 字典 / 参数 / 公告 / 通知 / 日志 / 会话 / 文件 共 11 个模块，每个都带 API + 页面 + 集成测试 |
| **附带公开门户** | `apps/portal` 是独立的免登录门户应用（品牌区 / 轮播 / 图文区块 / 留言表单），与管理端共用同一个后端 |
| **安全默认值** | 生产环境强制校验 JWT 密钥长度、OTP 只存哈希、未配置生产 Sender 时失败关闭 |
| **可验证交付** | Vitest 三层测试 + Playwright E2E（52 个跨层用例）+ GitHub Actions 五道门（test / lint / typecheck / build / e2e） |

> 与常见的 Next.js admin 模板相比，差别在于：后端是 **Hono**（可部署到边缘运行时），额外提供**公开门户应用**，以及**三方言可移植**的数据层。

## 界面预览

| 管理端 · 角色授权（权限树） | 公开门户 |
|---|---|
| ![角色授权](./docs/images/admin-role-grant.png) | ![门户首页](./docs/images/portal-home.png) |

![Swagger UI（由 zod schema 生成）](./docs/images/api-docs.png)

## 快速开始

### 在线试用（无需本地环境）

点击顶部 **Open in GitHub Codespaces** 徽标，GitHub 会创建一个已装好依赖、建好库并灌入演示数据的云端环境，三个服务自动启动并转发端口：

| 端口 | 服务 |
|---|---|
| 5173 | 管理端（`admin / Admin@123`） |
| 5174 | 公开门户 |
| 3001 | API（Swagger UI 在 `/api/docs`） |

> 端口默认 private（仅自己可见），在编辑器的 **PORTS** 面板右键可改为 Public 分享给他人；Codespaces 闲置 30 分钟后自动停止，重新打开即恢复。

### 环境要求

- Node.js 22 或更高版本
- pnpm 9.x（仓库固定为 `pnpm@9.12.0`）

### 本地启动

```bash
git clone https://github.com/nickiilord/shadova.git
cd shadova

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env

pnpm install
pnpm --filter @repo/db db:push
pnpm --filter @repo/db seed
pnpm dev
```

打开 <http://localhost:5173>（管理端）与 <http://localhost:5174>（公开门户）。API 地址默认为 <http://localhost:3001>，Swagger UI 位于 <http://localhost:3001/api/docs>。

默认演示账号：`admin / Admin@123`。种子脚本可幂等重跑，并会重置该账号的密码和演示联系方式。

## 功能

- **管理端**：React 19、Vite、React Router、TanStack Query、Tailwind CSS、shadcn/ui。
- **门户**：面向访客的公开单页（`apps/portal`，端口 5174）：品牌区、轮播图、图文区块、联系方式与社交链接、留言表单；中英双语跟随浏览器，SEO 元信息取自站点配置。
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
├── web/          # React 管理端，默认端口 5173
└── portal/       # 公开门户（免登录单页），默认端口 5174
packages/
├── db/           # Prisma schema、client 与幂等种子
├── shared/       # 前后端共享的权限纯函数
└── config/       # 共享 TypeScript / ESLint 配置
docs/
├── business/     # 业务文档（权威：领域模型/权限/规则/API/种子）
├── database/     # 三方言数据库约定与参考 DDL
└── review/       # 业务 Review 矩阵（专项检查基线）
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
- [业务 Review 矩阵](./docs/review/business-rules.md)
- [智能体开发指南](./CLAUDE.md)

## 参与贡献

开发规范与提交前自检见 [CONTRIBUTING.md](./CONTRIBUTING.md)，规则细节以 [AGENTS.md](./AGENTS.md) 为准。

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)；改动较大时请先在 issue 中说明方案。
