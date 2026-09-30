import { execSync } from "node:child_process"
import path from "node:path"
import { beforeAll } from "vitest"

// 与 apps/api/test/setup.ts 同理：setup 文件先于测试模块加载，PrismaClient 构造时即读取 DATABASE_URL。
// 若在 beforeAll 里才设置，client 已绑定 packages/db/.env 的 dev.db（测试误写开发库的根因）。
const testDbUrl = process.env.TEST_DATABASE_URL ?? `file:./mcp-test-${String(process.pid)}.db`
process.env.DATABASE_URL = testDbUrl

const dbDir = path.join(import.meta.dirname, "../../../packages/db")

beforeAll(() => {
  const env = { ...process.env, DATABASE_URL: testDbUrl }
  // 集成测试要跑真实 API，需要干净库 + 种子（admin 账号与权限数据）
  execSync("npx prisma db push --force-reset --skip-generate", { cwd: dbDir, env, stdio: "pipe" })
  execSync("npx tsx src/seed.ts", { cwd: dbDir, env, stdio: "pipe" })
}, 60_000)
