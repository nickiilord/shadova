# 贡献指南

## 环境准备

见 [README 的「快速开始」](./README.md#快速开始)。

## 开发规范

本仓库的代码规范、架构约束与行为准则集中在 **[AGENTS.md](./AGENTS.md)** —— 它是仓库规则的单一真相源，改动前请按它自检。几条最常触发的约束：

- 严格 TypeScript：不允许 `any`、隐式 `any` 与未处理的 Promise
- 权限码统一引用 `packages/shared/src/permission-codes.ts` 的 `PERMISSIONS`，禁止在路由或页面重新定义同名字符串
- `src/components/ui/` 由 shadcn CLI 管理，禁止手写或复制粘贴组件源码
- 数据库结构变更需同步 `docs/database/schema.sql`
- 文案与注释使用中文，与现有代码保持一致

## 提交前自检

```bash
pnpm typecheck     # api + web + portal + e2e 类型检查
pnpm turbo lint    # 全量 lint
git diff --check   # 空白错误
```

改动 API 契约后额外重生成产物：

```bash
pnpm --filter @repo/api generate:openapi
pnpm --filter @repo/api generate:types
pnpm --filter @repo/portal generate:types
```

> 跑 E2E 前需先停掉 `pnpm dev`：Playwright 会自起服务并连独立的 `e2e.db`，端口被占用时会显式报冲突（这是刻意的，避免测试写入开发库）。

## 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/)（commitlint 校验），例如 `feat(portal): ...`、`fix(web): ...`。每个提交都应保持可编译、可运行、可独立回滚。

## Pull Request

1. 从 `main` 切分支开发
2. 改动较大或有架构影响时，先在 issue 中说明方案再动手
3. 确保 CI 五道门全绿（test / lint / typecheck / build / e2e）
4. PR 描述写清「做了什么、为什么这么做」，而不是只贴改动清单
