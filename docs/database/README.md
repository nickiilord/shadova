# 数据库结构文档

- `schema.sql`：MySQL 方言 DDL，全字段中文注释，开发者速查用
- **运行时权威**是 `packages/db/prisma/schema.prisma`，本 SQL 文件仅作文档
- **同步约定**：任何 schema.prisma 变更（增删字段、改约束/索引/注释），必须同步更新本文件；提交前人工核对双源一致性，CI 可加自动化字段名比对脚本
- 字段宽度与索引名均为手写近似值，以 `schema.prisma` + `prisma db push` 实际落库结构为准（本项目不含迁移文件，见下）

## 权限语义速查（重要）

可见权限 = **用户所有角色授权菜单集合的纯严格交集**（非并集）：
- 任一角色为空集合 ⇒ 用户无任何权限；无任何角色同理
- 按钮（BUTTON）同样参与交集，仅用于页面内按钮显隐
- 导航规则：祖先目录补全显示（保证可达性）；无可见子孙的目录自动折叠

详细定义见 [docs/business/README.md §3 权限模型](../business/README.md)

## 三方言差异说明

> 口径说明：下表为手写方言指南，仅作人工对照参考（本项目不使用迁移文件，部署统一走 `prisma db push`）。
> 字段注释（下表首行）：Prisma migrate 不输出字段注释（docstring 不进 SQL），SQL 注释仅为本文档速查所用。

| 项目 | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| 字段注释 | 不支持 COMMENT，用 `--` 行注释 | `COMMENT '...'` 内联 | `COMMENT ON COLUMN t.c IS '...'` |
| 布尔 | INTEGER 0/1 | BOOLEAN/TINYINT(1) | BOOLEAN |
| 外键级联 | 需 PRAGMA foreign_keys=ON（Prisma 自动处理） | 内联约束 | Prisma PG 产物为 CREATE TABLE 内联外键 |
| 时间 | TEXT/DATETIME | DATETIME | TIMESTAMP(3)（Prisma 默认，无时区；TIMESTAMPTZ 需显式 `@db.Timestamptz`） |

本文件为 MySQL 权威版；SQLite 与 PostgreSQL 的结构由 Prisma 按 schema.prisma 经 `db push` 直接生成。

## 迁移策略（明确约定）

本项目当前保留 `prisma db push` 作为部署与开发的结构同步方式，schema 演进不记录历史迁移。运行时 workspace 包必须先构建到各自 `dist`，生产 API 仅从编译产物启动；详见根目录 `Dockerfile`。

## 切换数据库

```bash
# packages/db 下
# 1. 改 .env 的 DATABASE_URL
# 2. 改 prisma/schema.prisma 的 provider（sqlite/mysql/postgresql）
# 3. 按下方「MySQL 原生类型清单」为超长字段补 @db.VarChar/@db.Text 标注后推库
pnpm --filter @repo/db db:push
pnpm --filter @repo/db seed
```

### MySQL 原生类型清单（切库必读）

Prisma 的 `String` 在 MySQL 下默认映射 `VARCHAR(191)`。以下字段的业务上限超过 191，**切 MySQL 前必须在 schema.prisma 补原生类型标注**（SQLite/PostgreSQL 无需改动，Prisma 自动映射 TEXT）：

| 字段 | zod 上限 | 切 MySQL 需标注 |
|---|---|---|
| Announcement.content | 2000 | `@db.Text` |
| Config.configValue | 1024 | `@db.Text` |
| Notification.content | 500 | `@db.Text` |
| Config.description / DictType.description / Role.description | 255 | `@db.Text`（或 `@db.VarChar(255)`） |
| OtpCode.target | 255 | `@db.VarChar(255)` |
| RefreshToken/LoginLog/OperationLog.userAgent | 无上限（UA 字符串） | `@db.VarChar(512)` |

未列入的字段 zod 上限均 ≤191 或已做截断（OperationLog.requestBody 截断 180），无需处理。
