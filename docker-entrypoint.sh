#!/bin/sh
# api 容器入口：同步数据库结构（db push 幂等）→ 空库时初始化种子 → 启动服务
set -e

# JWT_SECRET 兜底：未显式配置时生成随机密钥并持久化到数据卷（/app/data = db-data 卷），
# 避免以仓库中的公开占位密钥静默启动（config.ts 生产环境会拒绝占位值，此处保证开箱即用且安全）
if [ -z "$JWT_SECRET" ]; then
  if [ -f /app/data/jwt-secret ]; then
    export JWT_SECRET="$(cat /app/data/jwt-secret)"
  else
    export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    printf '%s' "$JWT_SECRET" > /app/data/jwt-secret
    echo "[entrypoint] 已生成随机 JWT_SECRET（持久化到 /app/data/jwt-secret，重启复用）"
  fi
fi

echo "[entrypoint] 同步数据库结构..."
cd /app/packages/db
pnpm exec prisma db push --skip-generate

echo "[entrypoint] 检查并初始化种子数据..."
pnpm exec tsx src/init.ts

echo "[entrypoint] 启动 api 服务..."
cd /app/apps/api
exec node dist/index.js
