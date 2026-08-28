---
name: pre-commit-check
description: Use before every git commit in this RBAC admin (or when asked to review readiness of changes). A executable quality gate: typecheck, contract artifacts, lint, dead code, Stateless deliverable, and doc dual-source sync. Skips full test suite by design.
---

# pre-commit-check：提交前质检清单

把"开发后"行为规范变成可执行清单。每步都有验证命令；**不全量跑测试**（除非部署上线），只跑受影响范围。

## 何时使用

- 每次提交前（独立变更、可回滚）
- 被要求审查变更是否可交付

## 步骤清单

1. **受影响包 typecheck**：`pnpm typecheck`（根级；或 `pnpm --filter <pkg> typecheck`）
2. **空白与冲突**：`git diff --check`
3. **契约产物无漂移**（api 源码有变更时）：
   `pnpm --filter @repo/api generate:openapi && pnpm --filter @repo/api generate:types` 后
   `git diff --exit-code -- apps/api/openapi.json apps/web/src/api/schema.d.ts`
4. **lint**：`pnpm turbo lint`（受影响包即可；全量也快）
5. **dead code 审查**（本轮改动引入的）：无用 import/变量/函数、无复用价值的私有 helper（合并或删除）；不动本轮之前的存量 dead code
6. **Stateless**：产物与代码中无"为何修改/过程描述"类说明（修改说明残留 = 交付物污染）
7. **文档双源核对**：
   - schema.prisma 变更 → `docs/database/schema.sql` 已同步
   - skill/规则变更 → `.agents/skills/` 与 `.claude/skills/` 双目录同步
   - 新模块/页面 → AGENTS.md 文档索引是否该更新
8. **受影响测试**：跑本轮改动的测试文件（api 集成 or web RTL），全绿
9. **提交信息**：conventional commits（commitlint 自动校验；husky pre-commit 自动重生成契约 + lint-staged）

## 红线

- 禁止提交无法编译的代码（每次 Commit 必须可编译、可运行）
- 禁止跑全量测试（`pnpm turbo test` 只在发布/验收阶段）
- 禁止在未 Code Review 的情况下提交他人代码

## 范例索引

- 规范来源：AGENTS.md「交付验证」「提交规范」段
- 自动化现状：`.husky/pre-commit`（契约重生成 + lint-staged）、`lint-staged.config.ts`

## 易错点

- 改了 api 源码后 typecheck 报 schema.d.ts 缺类型 → 生成产物陈旧，先手动 generate 再检查。
- husky pre-commit 会把契约生成物自动 add——若 openapi.json 意外出现在 diff 里，说明 api 源码有未预期的变更。
- markdown/文档变更不会触发 lint-staged（只匹配 ts/tsx），但 commitlint 仍校验提交信息。
