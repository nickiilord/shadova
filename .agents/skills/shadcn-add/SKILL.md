---
name: shadcn-add
description: Use when this RBAC admin needs a new UI component from the shadcn registry (adding a component to src/components/ui/), upgrading or overriding an existing one, or when a component is missing because it was hand-written instead of CLI-installed.
---

# shadcn-add：shadcn 组件安装/升级

本仓库 shadcn 严格 CLI：组件一律 `npx shadcn@latest add` 安装，**禁止手写/复制粘贴组件源码**；升级/覆盖走 `--dry-run` → `--diff` 合并。

## 何时使用

- 新 UI 需求需要组件（先 registry 搜索，官方/社区）
- 升级/覆盖既有组件（dry-run 先看影响面）
- 排查组件缺失/被手写污染

## 步骤清单

1. **搜索**：`npx shadcn@latest search <关键词>`（官方 registry 优先，社区 registry 注意来源）
2. **安装**：`npx shadcn@latest add <component>`（在 `apps/web` 目录执行，写入 `src/components/ui/`）
   → 验证：`pnpm --filter @repo/web typecheck`；页面中使用正常渲染
3. **升级/覆盖**：先 `--dry-run` 看变更清单 → `--diff` 审查 → 合并（跳过 ignore 面）
4. **组件化用法**：业务组件优先封装（`src/components/business/` 先例：Permission/PageHeader 等深度封装组件，暴露最小 API）

## 红线

- 禁止手写/复制粘贴 `src/components/ui/` 组件源码（CLI 安装物，手写 = 无法升级的分叉）
- 升级时禁止跳过 ignore 面：`src/components/ui/` 全部 + `src/hooks/use-mobile.ts` + `src/api/schema.d.ts`（生成物与 CLI 无关，勿被覆盖）
- 禁止扩展 ui 组件源码以满足单页需求（用 shadcn 的 data-* 变体或业务层封装）

## 范例索引

- `apps/web/components.json`（registry 配置）
- 业务深度封装先例：`apps/web/src/components/business/`（PageHeader、Permission、TreeCheckbox）

## 易错点

- web 包 `exactOptionalPropertyTypes: false` 是唯一放宽面（shadcn 上游产物不兼容），勿扩大。
- 组件升级 diff 会被 pre-commit 的 lint-staged 重写格式——先本地跑 `pnpm turbo lint` 再提交。
- `npx shadcn` 会写 components.json 与依赖——升级后核对 package.json 依赖未缺失。
