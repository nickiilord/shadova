import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // 集成测试会进程内起一个真实 API 并共用同一个 SQLite 测试库，串行避免互相踩踏（与 apps/api 同约定）
    fileParallelism: false,
    hookTimeout: 30_000,
    setupFiles: ["./test/setup.ts"],
  },
})
