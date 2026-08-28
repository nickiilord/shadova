---
name: switch-database
description: Use when switching this repo's Prisma datasource between SQLite, MySQL, and PostgreSQL, changing DATABASE_URL or the schema provider, or troubleshooting migrate/seed failures after a datasource change.
---

# switch-database：三方言切换清单

运行时权威是 `packages/db/prisma/schema.prisma`（三方言可移植）；`docs/database/schema.sql` 是 MySQL 方言文档版，不参与运行。差异表与权限语义速查见 docs/database/README.md，约定见设计文档 §11。

## 步骤清单

1. **改 DATABASE_URL**：`packages/db/.env`（Prisma 按 schema 所在目录 `packages/db/prisma/` 解析，命令以 packages/db 为 cwd 时加载该文件）。注意 `apps/api/.env` 里的 DATABASE_URL 是相对 api 目录的路径（`file:../../../packages/db/prisma/dev.db`），两处必须指向同一库。
2. **改 provider**：`packages/db/prisma/schema.prisma` 的 `datasource db.provider`（sqlite / mysql / postgresql）。**忘记同步改 provider 是切库失败的第一原因**。
3. **迁移**：
   ```bash
   pnpm --filter @repo/db db:migrate -- --name switch
   ```
   **旧迁移历史处置**：跨方言重放迁移 SQL 不通用。当前仓库 `packages/db/prisma/` 下无 `migrations/` 目录（开发库由 db push 同步），migrate dev 会直接为新 provider 生成基线迁移；若存在旧方言迁移目录，先删除 `packages/db/prisma/migrations/` 再 migrate dev；或改用 `pnpm --filter @repo/db db:push`（免迁移文件，快速同步 schema）。
4. **种子**：`pnpm --filter @repo/db seed`（幂等；会重置 admin/Admin@123 与演示联系方式）。
5. **回归**：`pnpm turbo test` 全绿（api 测试自动重建 SQLite test.db，不影响开发库——测试库与开发库方言可以不同）。
6. **文档同步**：核对 `docs/database/schema.sql`（MySQL 权威文档版）与 schema.prisma 是否有字段差异；有变更需同步更新。若切到 MySQL，按 migrate 产物修正 SQL 中手写近似值（字段宽度/索引名）。

## 易错点

- .env 是 gitignore 的，切库配置不入库；新环境需按本清单重配。
- 迁移历史不清理直接跨方言重放 → 旧 SQL 方言不兼容报错。
- 忘记同步 provider：DATABASE_URL 指向 MySQL 而 provider 仍是 sqlite → migrate 直接报错。
- 时间/布尔/外键方言差异见 docs/database/README.md 差异表，跨库后行为以各 provider 为准。
