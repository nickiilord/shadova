#!/usr/bin/env bash
# Codespaces 每次启动容器时执行：后台拉起三个 dev server。
# 用 nohup 后台运行而非前台阻塞，避免阻塞容器启动；日志见 /tmp/shadova-dev.log。
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v pgrep > /dev/null 2>&1 && pgrep -f "turbo run dev" > /dev/null 2>&1; then
  echo "dev 服务已在运行，跳过启动。"
  exit 0
fi

nohup pnpm dev > /tmp/shadova-dev.log 2>&1 &
echo "已在后台启动 pnpm dev，日志：tail -f /tmp/shadova-dev.log"
