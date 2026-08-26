import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    // 当前 SQLite 测试库仍按进程隔离；保持单 worker，避免同一进程内 Prisma 连接与 force-reset 互相踩踏。
    fileParallelism: false,
    // setup 的 db push --force-reset 偶发超过默认 10s（test.db-journal 残留根因），放宽避免偶发假失败
    hookTimeout: 30_000,
    setupFiles: ["./test/setup.ts"],
  },
})
