#!/usr/bin/env bash
# Codespaces 首次创建容器时执行：生成 .env → 装依赖 → 构建 workspace 包 → 建库 → 种子。
# 只在 onCreate 阶段跑一次，因此这里可以放相对耗时的步骤。
set -euo pipefail

cd "$(dirname "$0")/.."

# 启用仓库锁定的 pnpm 版本（package.json 的 packageManager: pnpm@9.12.0）
# devcontainer 镜像里 corepack 可能装在仅 root 可写的目录，故失败时回落 sudo
corepack enable 2>/dev/null || sudo corepack enable

# 生成 .env：这些文件被 .gitignore 排除，Codespaces 检出后并不存在
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -f apps/web/.env ] || cp apps/web/.env.example apps/web/.env
[ -f packages/db/.env ] || cp packages/db/.env.example packages/db/.env

pnpm install

# api 以 tsx 运行时从 workspace 包的 dist 导入类型与代码（见 AGENTS.md「运行时产物边界」）
pnpm --filter @repo/shared build
pnpm --filter @repo/db build

pnpm --filter @repo/db db:push
pnpm --filter @repo/db seed

echo ""
echo "✔ 环境就绪：admin / Admin@123"
echo "  管理端 http://localhost:5173 · 门户 http://localhost:5174 · API http://localhost:3001"
echo "  三个端口已在「PORTS」面板转发，右键可改为 Public 供他人访问。"
