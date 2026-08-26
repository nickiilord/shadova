import { execSync } from "node:child_process"
import path from "node:path"
import { beforeAll } from "vitest"

// 模块级设置：setup 文件先于测试文件模块加载，PrismaClient 构造时即读取 DATABASE_URL，
// 若在 beforeAll 里再设，client 已绑定 packages/db/.env 的 dev.db（测试误写 dev 库根因）
const testDbUrl = process.env.TEST_DATABASE_URL ?? `file:./test-${String(process.pid)}.db`
process.env.DATABASE_URL = testDbUrl

beforeAll(() => {
  // 每次测试运行前重建测试库（--force-reset 保证干净；--skip-generate 避免重复生成 client）
  // cwd 必须指向 packages/db（Prisma 找 schema.prisma 与 .env 的基准目录）
  execSync("npx prisma db push --force-reset --skip-generate", {
    cwd: path.join(import.meta.dirname, "../../../packages/db"),
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "pipe",
  })
})
