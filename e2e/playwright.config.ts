import { defineConfig } from "@playwright/test"

/** E2E 专用 SQLite 库（相对 packages/db/prisma 解析，与 dev.db 隔离；global-setup 重建+种子） */
export const E2E_DB_URL = "file:../../../e2e/e2e.db"

/** E2E API 服务地址（fixtures 与各 spec 直连 API 共用，webServer 健康检查也用它） */
export const E2E_API_URL = "http://localhost:3001"

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // 本地/CI 均重试 1 次：Windows 长时运行 + vite dev 偶发慢加载（实测单文件连跑稳定、全量组合偶发超时）
  retries: 1,
  // 全套场景共享一份 E2E 数据库，且包含修改 admin 密码/语言等全局状态的用例。
  // 串行执行可避免跨文件 worker 互相污染；单个用例内部仍可自行验证并发业务。
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  globalSetup: "./global-setup.ts",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // 两个前端应用各一个 project：
  // admin = 管理端（5173，会话由 fixtures.ts 的 adminPage 逐用例独立登录，refresh token 单活轮换不可跨用例复用）
  // portal = 公开门户（5174，无登录态）
  projects: [
    {
      name: "admin",
      testMatch: /\.spec\.ts/,
      testIgnore: /16-portal\/portal-visitor\.spec\.ts/,
      use: { baseURL: "http://localhost:5173" },
    },
    {
      name: "portal",
      testMatch: /16-portal\/portal-visitor\.spec\.ts/,
      use: { baseURL: "http://localhost:5174" },
    },
  ],
  // 三个服务：api（e2e 库）+ web + portal（vite dev）。
  // reuseExistingServer 强制 false：复用本地已运行的 dev server 会让测试连上**开发库**（dev.db）
  // 并写入测试数据，污染开发数据且跨用例重名冲突（实测：反复跑时创建类用例成片失败）。
  // 跑 E2E 前请先停掉 pnpm dev —— 端口被占用时 Playwright 会显式报冲突，而不是静默写脏开发库。
  webServer: [
    {
      command: "pnpm --filter @repo/shared build && pnpm --filter @repo/db build && pnpm exec tsx src/index.ts",
      cwd: "../apps/api",
      url: `${E2E_API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DB_URL,
        JWT_SECRET: "e2e-test-secret-with-at-least-32-characters",
        PORT: "3001",
      },
    },
    {
      command: "pnpm exec vite --port 5173 --strictPort",
      cwd: "../apps/web",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 60_000,
      // apps/web/.env 被 gitignore，CI 检出后不存在；直接注入避免 %VITE_APP_NAME% 未替换警告
      env: {
        VITE_APP_NAME: "shadova",
      },
    },
    {
      command: "pnpm exec vite --port 5174 --strictPort",
      cwd: "../apps/portal",
      url: "http://localhost:5174",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
