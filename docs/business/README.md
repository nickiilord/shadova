# 业务文档：RBAC 管理端（shadcn-mono）

> **定位**：本文件是仓库的业务权威文档，描述系统的**当前真实行为**，随代码演进维护。
> 内容以 `packages/db/prisma/schema.prisma`（数据）、`packages/db/src/seed.ts`（种子）、`apps/api/src/routes/*`（接口与规则）、`packages/shared/src/permissions.ts`（权限算法）为准；历史设计文档与实施计划已归档至 `docs/archive/superpowers/`，不再作为事实来源。

## 1. 系统概述

RBAC 管理端 SPA（monorepo：Turborepo + pnpm）：

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Vite + React 19 + React Router 7 + TanStack Query + shadcn-ui | 约定式页面 `apps/web/src/features/<component>/page.tsx`；shadcn 组件严格 CLI 管理 |
| 后端 | Hono + @hono/zod-openapi | zod schema 三合一（校验 / OpenAPI 文档 / 类型）；`/api/docs` 挂 Swagger UI |
| 数据 | Prisma（SQLite 默认 / MySQL / PostgreSQL） | 三方言可移植，无迁移文件，走 `db push` |
| 认证 | 内置 JWT 双 Token + 邮箱/手机 OTP；可选 Clerk 适配器 | 环境变量 `VITE_AUTH_PROVIDER` / 后端 `authProvider` 切换 |

核心能力：三种登录（账号密码 / 邮箱动态码 / 手机动态码）、多角色权限（严格交集）、用户 / 角色 / 菜单 / 部门 / 字典 / 参数 / 公告 / 通知 / 日志 / 会话 / 文件等系统管理模块。

## 2. 领域模型（15 张表，按业务域分组）

> 全字段中文注释以 `schema.prisma` docstring 为权威；本表只列业务语义要点。ER 级细节见 [数据库结构文档](../database/README.md) 与 `docs/database/schema.sql`（MySQL DDL 速查版）。

### 2.1 权限域（RBAC 核心）

| 表 | 业务语义 |
|---|---|
| Menu | 菜单/按钮权限树。`type` = `DIR` 目录 / `MENU` 菜单 / `BUTTON` 按钮（字符串 + zod 校验，不用枚举）。`path`/`component` 仅 MENU 必填；`permission` 权限码（唯一，可空）。父删除级联删子树 |
| Role | 角色（权限分组）。`code` 唯一（如 `ADMIN`），`status` 禁用后授权即时失效 |
| UserRole | 用户↔角色（联合主键，级联删除） |
| RoleMenu | 角色↔菜单授权（**含 BUTTON 节点**，联合主键，级联删除） |

**菜单树类型约束**（后端校验 + 前端限制）：DIR → 子级只能是 DIR/MENU；MENU → 子级只能是 BUTTON；BUTTON → 无子级。改父节点禁止挂到自身子树。

### 2.2 账号与认证域

| 表 | 业务语义 |
|---|---|
| User | 统一认证主体（账号密码 / OTP / Clerk 共用）。`username` 唯一且统一小写存储；`email`/`telephone` 唯一可空（小写/原样存储）；Clerk 用户 `passwordHash` 为空字符串；`avatar` 存文件名（经 /api/files 上传访问）；`departmentId` 仅组织归属，**不参与权限计算**；`status` 禁用即时生效 |
| RefreshToken | 刷新令牌（sha256 哈希存储，不存明文）。`ip`/`userAgent` 记录会话来源；`revokedAt` 非空即吊销；7 天过期；定时清理 |
| OtpCode | 动态码（sha256 哈希存储）。`channel` = EMAIL/TELEPHONE（大写入库）；`target` 小写归一；`attempts` 失败累计；`consumedAt` 一次性消费；5 分钟过期 |
| LoginLog | 登录审计（成功/失败都记录，失败也记尝试用户名——防枚举场景）。用户删除后保留历史（userId 置空） |

### 2.3 组织与扩展域

| 表 | 业务语义 |
|---|---|
| Department | 部门树。仅组织归属（用户可空挂靠）；父删除**级联删除**子部门，部门删除时用户 `departmentId` 置空；禁用不影响用户可用性 |
| DictType / DictItem | 数据字典（类型 + 选项两级）。`typeCode` 唯一；字典项随类型级联删除；禁用项在 `options` 接口不返回 |
| Config | 系统参数（key-value）。`configKey` 唯一且统一小写；程序运行时读取（如 `user.password.minLength`） |

### 2.4 审计与消息域

| 表 | 业务语义 |
|---|---|
| OperationLog | 写操作审计（POST/PATCH/PUT/DELETE，非 GET 才记录）。`requestBody` 为 JSON 快照：**按键名脱敏**（password/token/secret/code 键值替换 `***`）+ 180 字符截断；登录/OTP/改密/系统参数等敏感路径不记录请求体；用户删除时级联删除 |
| Notification | 站内通知（系统/管理员发送）。按接收用户隔离，**发送方不落库**；`isRead`/`readAt` 已读状态；用户删除级联删除 |
| Announcement | 全局公告（管理员维护，登录用户首页横幅展示）。`status=true` 才进 `latest`；下架后首页不可见 |

## 3. 权限模型（核心规则）

### 3.1 计算规则

```
可见权限 = ∩(用户所有【启用】角色的授权菜单集合)   // 纯严格交集，无超管例外
```

- 无角色，或任一角色授权为空集合 ⇒ 用户无任何权限（空集 ∩ 任何集合 = 空集）。
- **禁用角色不参与计算**；**禁用菜单**不进导航树、不进权限码。
- 导航树 = 交集内非 BUTTON 节点 + **祖先补全**（祖先目录强制进入，保证导航可达）→ **空目录折叠**（无可见子孙的 DIR 移除）→ 同层按 `sort` 升序。
- **BUTTON 节点参与交集**，只产出 `permissionCodes` 供页面按钮显隐，不进侧边栏、不生成路由。
- `permissionCodes` = 交集内所有节点（MENU + BUTTON）的 `permission` 非空集合。

实现唯一位置：`packages/shared/src/permissions.ts`（纯函数 `computeVisibleMenus(roleMenuIdsList, allMenus)`），后端 `requirePermission` 与前端 `usePermissionCodes`/`<Permission>` 共用同一逻辑。

### 3.2 实时生效

- `requirePermission(code)`：每次请求实时拉取计算（数据量小不缓存）；未认证 401，无权 403 `PERMISSION_DENIED`。
- 状态变化（用户/角色/菜单 status、角色授权变更、用户角色变更）**立即影响下一次请求**：旧 access token 不保留已撤销权限；禁用用户的旧 refresh 在 refresh/换发时被拒。
- 用户 `status=false` 后：现有 access token 立即失效（authenticate 每请求查库校验）。

### 3.3 权限码清单（种子全量，共 30 个）

`模块:资源:操作` 规范。菜单树（种子，zh 名 / 路径 / 组件 / 权限码）：

| 层级 | 名称 | 类型 | 路径 / 组件 | 权限码（BUTTON 行） |
|---|---|---|---|---|
| 0 | 概览 Dashboard | MENU | `/` → `dashboard` | — |
| 1 | 系统管理 System | DIR | — | — |
| 2 | 用户管理 Users | MENU | `/system/user` → `system/user` | — |
| 3 | — | BUTTON | — | `system:user:create` / `update` / `delete` / `assign-role` |
| 2 | 角色管理 Roles | MENU | `/system/role` → `system/role` | — |
| 3 | — | BUTTON | — | `system:role:create` / `update` / `delete` / `assign` |
| 2 | 菜单管理 Menus | MENU | `/system/menu` → `system/menu` | — |
| 3 | — | BUTTON | — | `system:menu:create` / `update` / `delete` |
| 2 | 日志管理 Logs | MENU | `/system/log` → `system/log` | — |
| 2 | 会话管理 Sessions | MENU | `/system/session` → `system/session` | — |
| 3 | — | BUTTON | — | `system:session:revoke` |
| 2 | 数据字典 Dictionary | MENU | `/system/dict` → `system/dict` | — |
| 3 | — | BUTTON | — | `system:dict:create` / `update` / `delete` |
| 2 | 参数配置 Parameters | MENU | `/system/config` → `system/config` | — |
| 3 | — | BUTTON | — | `system:config:create` / `update` / `delete` |
| 2 | 通知中心 Notifications | MENU | `/system/notification` → `system/notifications` | 无查询码（个人页，登录即见） |
| 3 | — | BUTTON | — | `system:notification:create` |
| 2 | 部门管理 Departments | MENU | `/system/department` → `system/department` | — |
| 3 | — | BUTTON | — | `system:dept:create` / `update` / `delete` |
| 2 | 公告管理 Announcements | MENU | `/system/announcement` → `system/announcement` | — |
| 3 | — | BUTTON | — | `system:announcement:create` / `update` / `delete` |

> 菜单页（含 BUTTON）的 `permission` 非空即查询码：`system:{user,role,menu,log,session,dict,config,dept,announcement}:query`（通知中心无查询码，同 Dashboard 先例）。改动权限相关代码时三处联动：种子/菜单表 + 后端 `requirePermission` + 前端 `<Permission>`。

## 4. 认证与安全规则

### 4.1 登录（账号密码）

- 用户名统一小写归一（登录与创建/更新一致）。
- **防枚举**：用户不存在与密码错误同响应 `401 LOGIN_FAILED`（「用户名或密码错误」）。
- **限流**：按账号维度内存计数（key `login:<username>`），连续失败 5 次锁定 **15 分钟**（`423 ACCOUNT_LOCKED`）；不信任客户端可伪造的 X-Forwarded-For（防换 IP 绕过）；登录成功清除计数；有条目上限与陈旧清理（防用户名喷洒）。
- 账号禁用：`403 ACCOUNT_DISABLED`。登录结果（成功/失败/锁定/禁用）均写 LoginLog。

### 4.2 OTP 动态码（邮箱 / 手机）

- **发送** `POST /api/auth/otp/send`：6 位数字码，sha256 哈希入库；5 分钟过期；同 channel+target **60 秒冷却**（超限 `429 RATE_LIMITED`）；send 按 channel+target 串行化（单实例锁，防并发窗口）；目标不存在也返回成功且不投递（防枚举）；过期记录即删（防表膨胀）。
- **登录** `POST /api/auth/otp/login`：校验未消费 + 未过期 + 失败 `attempts < 5`；成功标记 `consumedAt` 一次性消费；超限 `423`。
- 投递走 `OtpSender` 抽象（`apps/api/src/lib/otp-sender.ts`）：本期 `DevOtpSender` 打印到日志，真实邮件/短信通道由使用者注入。

### 4.3 双 Token（access + refresh）

- access：5 分钟无状态 JWT（HS256，payload 含 userId）；refresh：7 天随机串 **sha256 哈希存库**（可吊销）。
- `POST /api/auth/refresh`：校验存在、未吊销、未过期、用户存在且启用 → **原子轮换**（带 `revokedAt=null` 条件的 CAS 更新，并发重放旧 token 仅一个成功）→ 签发新双 Token，会话记录带最新 ip/UA。
- `POST /api/auth/logout`：吊销当前 refresh。
- `POST /api/auth/change-password`：校验旧密码 → 拒绝与当前相同（`400 SAME_PASSWORD`）→ 事务内改密 + **吊销该用户全部 refresh token（其他会话强制下线）**。
- 管理员改用户密码（PATCH /api/users/{id} 带 password）同样由业务约定触发安全刷新；用户禁用后 refresh 立即失效。
- 过期/已吊销的 RefreshToken 与过期/已消费的 OtpCode 由后台任务每小时清理（`apps/api/src/lib/scheduler.ts`）。

### 4.4 文件（头像上传）

- `POST /api/files`（仅登录）：multipart；**MIME 白名单** jpg/png/webp/gif；**≤ 2MB**；文件名**服务端生成**（uuid + 白名单扩展名），杜绝路径穿越/重名/危险扩展名；存本地磁盘（`AppConfig.uploadDir`）。
- `GET /api/files/{filename}`（仅登录）：文件名正则白名单 + join 前缀双保险；按扩展名回 Content-Type；`cache-control: private`。

### 4.5 审计与脱敏

- **登录日志**：成功/失败/锁定/禁用全记录（含失败尝试的用户名、ip、UA、失败原因）。
- **操作日志**：非 GET 写操作记录（操作人、方法、路径、状态码、耗时、ip/UA、错误信息）；请求体 JSON 快照**按键名脱敏**（password/token/secret/code → `***`）并截断 180 字符；登录/OTP/改密/系统参数等敏感路径不记录请求体。

## 5. 各模块业务规则速查

| 模块 | 核心规则 |
|---|---|
| 用户 | 用户名小写唯一；邮箱/手机唯一可空（冲突统一 409）；**禁止删除自己**（`400 SELF_DELETE`）；`PATCH /users/me` 仅本人改 nickname/email/telephone/avatar（username/status/角色由管理员管）；`PUT /users/{id}/roles` 角色全量替换（事务）；CSV 导出（query 码）/ 导入（create 码，逐行创建、部分失败不中断、返回明细）；删除级联 UserRole/操作日志/通知，保留登录日志 |
| 角色 | `code` 唯一（大写规范）；删除自动清理 UserRole/RoleMenu（用户侧不受影响）；授权（`PUT /roles/{id}/menus`）**全量替换、含按钮节点**（事务）；禁用/撤销立即影响现有 token 的后续请求 |
| 菜单 | 树类型约束（见 §2.1）；`permission` 唯一；删除**级联删子树** + 清理 RoleMenu；BUTTON 不生成路由不进侧边栏 |
| 部门 | 树结构；禁止挂到自身/子孙（防循环）；删除级联子部门，用户归属置空；不参与权限计算 |
| 字典 | 类型 `typeCode` 唯一；字典项**全量替换**（PUT items，事务）；禁用项不出现在 `options` 接口 |
| 参数 | `configKey` 唯一且统一小写；列表/编辑/删除一致（管理操作） |
| 公告 | `status=true` 才进 `GET /announcements/latest`（首页横幅）；下架后不可见；内容上限 2000（MySQL 需 `@db.Text`） |
| 通知 | 查询/已读/未读数均为**本人数据隔离**（仅登录即可，不挂权限码）；发送是管理操作（`system:notification:create`）；标记已读 CAS（防重复写）；`read-all` 仅本人 |
| 日志 | 登录日志 / 操作日志两个列表（`system:log:query`）；详情字段见 §4.5；敏感体脱敏后落库与展示 |
| 会话 | **在线定义** = 未吊销且未过期；单条吊销带 CAS 条件（已吊销的会话重复操作不报错）；`revoke-all` 按 userId 吊销该用户全部会话（强制下线） |

## 6. API 清单（全部 `/api` 前缀，`{ code, data, message }` 包装）

### 认证（公开，`authenticate` 除外）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 账号密码登录（限流/锁定/防枚举，见 §4.1） |
| POST | `/auth/otp/send` | 发送动态码（冷却 60s） |
| POST | `/auth/otp/login` | 动态码登录（一次性） |
| POST | `/auth/refresh` | refresh 轮换（CAS 防重放） |
| POST | `/auth/logout` | 吊销 refresh |
| POST | `/auth/change-password` | 改密（吊销全部会话） |
| GET | `/auth/me` | 登录即可：user + 启用角色 + navTree + permissionCodes |

### 用户（权限码见 §3.3）

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| GET | `/users` | query | 分页 + keyword（用户名/昵称/邮箱/手机模糊） |
| POST | `/users` | create | 创建（含密码、可选联系方式、角色、部门） |
| GET | `/users/export` | query | CSV 导出 |
| GET | `/users/{id}` | query | 详情（含已挂角色） |
| PATCH | `/users/me` | 登录即可 | 本人改资料（昵称/邮箱/手机/头像） |
| PATCH | `/users/{id}` | update | 含可选密码（改密）、角色全量替换、部门挂靠/断开 |
| DELETE | `/users/{id}` | delete | 禁止删除自己 |
| PUT | `/users/{id}/roles` | assign-role | 角色全量替换 |
| POST | `/users/import` | create | CSV 导入（逐行创建，返回失败明细） |

### 角色 / 菜单

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| GET | `/roles` / `/roles/list` | query | 分页列表 / 全量（下拉框用） |
| POST | `/roles` | create | 创建 |
| GET / PATCH / DELETE | `/roles/{id}` | query / update / delete | 详情 / 更新 / 删除（自动清理关联） |
| GET | `/roles/{id}/menus` | query | 已授权 menuId 数组（树形勾选回显） |
| PUT | `/roles/{id}/menus` | assign | 全量提交（含按钮） |
| GET | `/menus/tree` | query | 全量树（含按钮，管理页用） |
| POST / GET / PATCH / DELETE | `/menus` / `/menus/{id}` | 对应码 | 类型约束 + 权限码唯一 + 防循环 + 级联删除 |

### 部门 / 字典 / 参数

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| GET / POST | `/departments` | query / create | 树 / 创建 |
| PATCH / DELETE | `/departments/{id}` | update / delete | 防自挂 + 级联删除子部门 |
| GET / POST | `/dicts/types` | query / create | 字典类型分页 / 创建 |
| GET / PATCH / DELETE | `/dicts/types/{id}` | query / update / delete | 详情 / 更新 / 删除（级联项） |
| PUT | `/dicts/types/{id}/items` | update | 字典项全量替换 |
| GET | `/dicts/types/{typeCode}/options` | query | 启用项选项列表（表单下拉） |
| GET / POST | `/configs` | query / create | 参数分页 / 创建 |
| GET / PATCH / DELETE | `/configs/{id}` | query / update / delete | 详情 / 更新 / 删除 |

### 公告 / 通知 / 日志 / 会话 / 文件

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| GET | `/announcements` | query | 公告分页 |
| GET | `/announcements/latest` | 登录即可 | 已发布公告（首页横幅） |
| POST / PATCH / DELETE | `/announcements` / `/{id}` | 对应码 | 维护（下架=status=false） |
| GET | `/notifications` | 登录即可 | 我的通知分页（倒序） |
| GET | `/notifications/unread-count` | 登录即可 | 未读数（顶栏徽标） |
| POST | `/notifications/{id}/read` | 登录即可 | 标记已读（本人） |
| POST | `/notifications/read-all` | 登录即可 | 全部已读（本人） |
| POST | `/notifications` | notification:create | 管理员发送（targetUserId + 标题 + 内容） |
| GET | `/logs/login` / `/logs/operation` | log:query | 登录日志 / 操作日志分页 |
| GET | `/sessions` | session:query | 在线会话分页（未吊销且未过期，keyword 按用户名） |
| DELETE | `/sessions/{id}` | session:revoke | 单条强制下线（CAS） |
| POST | `/sessions/{userId}/revoke-all` | session:revoke | 该用户全部会话下线 |
| POST | `/files` | 登录即可 | 图片上传（白名单 + 2MB） |
| GET | `/files/{filename}` | 登录即可 | 图片访问（防穿越） |

## 7. 种子数据（`pnpm --filter @repo/db seed`，幂等可重跑）

| 数据 | 内容 | 幂等策略 |
|---|---|---|
| 菜单树 | §3.3 全树 | 有 permission 按 permission 匹配，否则按 nameZh+parentId+path 匹配；存在仅同步 nameEn，不重复创建 |
| 角色 | `ADMIN` 管理员（授权**全部**菜单+按钮）/ `GUEST` 访客（仅概览） | upsert + RoleMenu 全量覆盖 |
| 用户 | `admin / Admin@123`（角色 ADMIN，部门「总部」） | upsert；**默认不重置**已存在 admin 的口令与联系方式，`--reset-admin` 才恢复演示凭据 |
| 演示部门 | 总部 → 技术部 / 市场部 / 财务部 | 按 nameZh+parentId upsert |
| 演示字典 | `user_status`（enabled/disabled） | 类型 upsert + 字典项全量替换 |
| 演示参数 | `user.password.minLength = 8` | upsert |
| 演示公告 | 「平台上线公告」 | 仅表空时插入（运营数据，不覆盖人工编辑） |
| 演示通知 | admin 两条示例 | 仅表空时插入（用户数据，不覆盖已读状态） |

## 8. 关键约定（开发与排障必读）

- **响应契约**：成功 `{ code: 0, data, message }`；错误 `{ code, message }` + 状态码：400 校验 / 401 未登录 / 403 无权限 / 404 不存在 / 409 唯一冲突 / 423 账号锁定 / 429 发送限流。**接口错误语义以 body.code 为准**，不依赖 HTTP 语义。
- **三方言可移植**：不用 Prisma enum（字符串 + zod 校验）；可空唯一字段多 NULL 允许、冲突统一转 409；树操作全量取回 + 内存建树（不用递归 CTE）；不用 JSONB/方言专属函数；时间统一 UTC（响应转 ISO 字符串）。
- **MySQL 类型标注**：超 191 字符字段需 `@db.Text`/`@db.VarChar`（清单见 [docs/database/README.md](../database/README.md)），切库前核对。
- **schema 双源同步**：`schema.prisma` 字段/注释变更必须同步 `docs/database/schema.sql`（MySQL DDL 文档版）。
- **权限码联动**：新增权限三处：种子菜单（或菜单管理页在线创建）+ 后端 `requirePermission` + 前端 `<Permission>`；计算规则唯一在 `packages/shared`。

## 9. 维护指南与文档索引

改业务行为时按此更新：改数据 → `schema.prisma` + `docs/database/schema.sql`；改规则 → 本文件对应章节 + 后端路由 + `docs/review/business-rules.md`（Review 检查基线）；改接口 → 本文件 §6 + 重生成 `openapi.json` / `schema.d.ts`；改种子 → `seed.ts` + 本文件 §7。

| 文档 | 用途 |
|---|---|
| `docs/business/README.md`（本文件） | 业务权威：领域模型、权限、规则、API、种子 |
| `docs/database/README.md` | 数据库三方言差异、切库步骤、MySQL 类型清单 |
| `docs/review/business-rules.md` | 业务 Review 矩阵（每轮专项检查基线） |
| `docs/archive/superpowers/` | 历史设计文档与实施计划（2026-08-06，已被本文件取代，仅存档） |
