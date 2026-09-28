# MCP Server 方案（`apps/mcp`）

把管理端已有的能力暴露给 AI 助手（Claude Desktop / Cursor / Claude Code 等），让它能读写这个 RBAC 系统。

**定位**：本方案是 `apps/mcp` 的**设计单一真相源**。实施后，工具清单与实现细节以 `apps/mcp/src/tools/` 代码为准，本文件只保留设计决策与边界。

---

## 1. 为什么做 / 不做什么

**做**：让 AI 助手成为管理端的**另一种客户端**——用自然语言完成查询与常规维护（如「列出最近登录失败的用户」「给张三加上 editor 角色」）。

**不做**（边界，越界即偏离定位）：

| 不做 | 原因 |
|---|---|
| 自己实现 LLM 调用、会话、提示词管理 | 那是 AI 平台（Dify/Coze）的领域，不是管理端框架的职责 |
| 绕过应用鉴权直连数据库 | 市面多数 MCP server 这么做；本方案反而以此为差异点——**AI 的操作受同一套 RBAC 约束并进入操作日志** |
| 暴露不可逆操作（删除类） | AI 误操作的代价过高；需要删除时由人在界面上执行 |
| 成为主流程的必需依赖 | 没有它，项目照旧 `clone → install → dev` 即可运行 |

---

## 2. 架构

```
┌──────────────────┐   stdio (本地)    ┌──────────────┐   HTTP    ┌──────────┐
│ Claude Desktop   │ ────────────────▶ │              │ ────────▶ │          │
│ Cursor / Codex   │                   │  apps/mcp    │  Bearer   │ apps/api │
│                  │ ◀──────────────── │  (MCP server)│ ◀──────── │  (Hono)  │
└──────────────────┘  Streamable HTTP  └──────────────┘           └──────────┘
                       (远程，Bearer)                                   │
                                                                       ▼
                                                              RBAC + 操作日志
```

**关键点**：MCP server 是**纯粹的 API 客户端**，不含任何业务逻辑——它不直接访问数据库，所有读写都经 `apps/api`，因此：

- 权限裁决、唯一性校验、审计日志**全部复用现有链路**，不存在第二套规则
- API 演进时 MCP 不会产生行为分叉

---

## 3. 传输与鉴权

### 3.1 stdio（本地，默认）

客户端配置示例：

```json
{
  "mcpServers": {
    "shadova": {
      "command": "node",
      "args": ["<repo>/apps/mcp/dist/index.js"],
      "env": {
        "SHADOVA_API_URL": "http://localhost:3001",
        "SHADOVA_USERNAME": "admin",
        "SHADOVA_PASSWORD": "Admin@123"
      }
    }
  }
}
```

启动时用凭据调 `POST /api/auth/login` 取双 token，access 过期（5 分钟）时走 `POST /api/auth/refresh` 自动轮换——**复用现有 refresh 单活轮换语义**，无需新机制。

### 3.2 Streamable HTTP（远程）

- 传输：官方 SDK 的 Streamable HTTP（[Serve over HTTP](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html)）
- 鉴权：`Authorization: Bearer <access token>` **直传**，MCP server 收到后以该 token 调 API，不额外持有凭据

**为什么不走 spec 推荐的 OAuth 2.1**：规范建议受保护的 MCP server 作为 [OAuth 2.1 resource server](https://modelcontextprotocol.io/specification/draft/basic/authorization)，需要授权服务器 + Protected Resource Metadata 发现。本项目**没有 OAuth 基础设施**（认证是自建 JWT 双 token），为此新建一套授权服务器与定位不符。Bearer 直传是[被广泛使用的简化实践](https://www.nxsi.io/guides/mcp-bearer-token-auth)，且 API 侧无需任何改动。

> HTTP 模式引入了网络暴露面，因此**默认不启用**（需 `SHADOVA_TRANSPORT=http`），且设计上只面向内网/本地。

---

## 4. 工具清单

契约里共 **51 路径 / 78 个操作**。**不做 1:1 映射**——全量注册会撑爆 LLM 的工具上下文，且大量操作 AI 用不上。按"AI 真正能帮上忙"精选 23 个。

### 4.1 只读（默认启用，15 个）

| 工具 | 内部调用 | 所需权限码 |
|---|---|---|
| `list_users` | `GET /api/users` | `system:user:query` |
| `get_user` | `GET /api/users/{id}` | `system:user:query` |
| `list_roles` | `GET /api/roles/list` | `system:role:query` |
| `get_role_menus` | `GET /api/roles/{id}/menus` | `system:role:query` |
| `get_menu_tree` | `GET /api/menus/tree` | `system:menu:query` |
| `list_departments` | `GET /api/departments` | `system:dept:query` |
| `list_dict_types` | `GET /api/dicts/types` | `system:dict:query` |
| `get_dict_options` | `GET /api/dicts/types/{typeCode}/options` | `system:dict:query` |
| `list_configs` | `GET /api/configs` | `system:config:query` |
| `list_sessions` | `GET /api/sessions` | `system:session:query` |
| `list_login_logs` | `GET /api/logs/login` | `system:log:query` |
| `list_operation_logs` | `GET /api/logs/operation` | `system:log:query` |
| `list_announcements` | `GET /api/announcements` | `system:announcement:query` |
| `get_portal_site` | `GET /api/portal/site` | `portal:site:query` |
| `list_portal_messages` | `GET /api/portal/messages` | `portal:message:query` |

### 4.2 写入（需 `SHADOVA_ENABLE_WRITE_TOOLS=true`，8 个）

| 工具 | 内部调用 | 所需权限码 |
|---|---|---|
| `create_user` | `POST /api/users` | `system:user:create` |
| `update_user` | `PATCH /api/users/{id}` | `system:user:update` |
| `set_user_status` | `PATCH /api/users/{id}`（仅 status） | `system:user:update` |
| `assign_user_roles` | `PUT /api/users/{id}/roles` | `system:user:assign-role` |
| `create_role` | `POST /api/roles` | `system:role:create` |
| `grant_role_menus` | `PUT /api/roles/{id}/menus` | `system:role:assign` |
| `create_announcement` | `POST /api/announcements` | `system:announcement:create` |
| `handle_portal_message` | `PATCH /api/portal/messages/{id}` | `portal:message:update` |

### 4.3 明确排除

| 排除项 | 原因 |
|---|---|
| 所有 `DELETE` | 不可逆，交给人 |
| 会话吊销（`DELETE /api/sessions/{id}`、`POST /api/sessions/{userId}/revoke-all`） | 强制他人下线的能力，误用影响面大 |
| `POST /api/users/{id}/reset-password`、`/auth/change-password` | 凭据类操作，交给人 |
| `/api/auth/*` | MCP 自己用它登录，不作为工具暴露 |
| `/api/files`（上传/读取） | 二进制内容不适合工具调用 |
| `/api/users/export`、`/api/users/import` | CSV 语义，更适合界面 |
| 门户 Banner / 图文区块的增删改 | 低频且强视觉，界面上做更合适 |

---

## 5. 权限与安全

### 5.1 权限感知的工具注册（核心设计）

启动时调 `GET /api/auth/me`，拿到的 `permissionCodes` 决定**注册哪些工具**：

```ts
// 伪代码：只有当前账号确实有权限的工具才会出现在 AI 的工具列表里
const { permissionCodes } = await client.me()
const tools = ALL_TOOLS.filter((tool) => permissionCodes.has(tool.requiredPermission))
```

好处有三：

1. **AI 不会看到它注定调不通的工具**（否则每次调用都是 403，浪费轮次与上下文）
2. **权限边界对 AI 透明**——换一个低权限账号，工具集自动收窄
3. 仍然是**后端 `requirePermission` 最终裁决**，注册过滤只是体验优化，不是安全边界

### 5.2 安全默认值

| 项 | 默认 | 说明 |
|---|---|---|
| 写入工具 | **关闭** | `SHADOVA_ENABLE_WRITE_TOOLS` 显式开启才注册 |
| HTTP 传输 | **关闭** | `SHADOVA_TRANSPORT=stdio` 默认；远程需显式切换 |
| 删除类操作 | **不实现** | 见 §4.3 |

### 5.3 审计（天然覆盖）

MCP 的写操作经 `apps/api`，会**自动进入 `OperationLog`**（含操作人、接口、状态码、脱敏后的请求体）——AI 做的每一次变更都可追溯，无需为 MCP 单独做审计。这是"不绕过应用层"这个设计选择的直接收益。

---

## 6. 包结构

```
apps/mcp/
├── package.json          # 依赖 @modelcontextprotocol/sdk、@repo/shared（权限码）、openapi-typescript 生成的类型
├── tsconfig.json         # 继承 @repo/config
├── src/
│   ├── index.ts          # 入口：按 SHADOVA_TRANSPORT 选择 stdio / HTTP
│   ├── client.ts         # API 客户端：登录、refresh 单飞、错误映射（复用 web/portal 的同构写法）
│   ├── server.ts         # MCP server 装配：权限过滤 + 工具注册
│   └── tools/
│       ├── index.ts      # 工具注册表（名称、权限码、schema、handler）
│       ├── users.ts      # 按域拆分，与 API 路由一一对应
│       ├── roles.ts
│       └── ...
└── src/api/schema.d.ts   # openapi-typescript 生成物（与 web/portal 同约定）
```

**契约复用**：工具的入参/出参类型从 `openapi.json` 派生（`openapi-typescript`），**不手写第二份**。契约变更后 pre-commit / CI 的既有生成链路自动覆盖它（需把 `apps/mcp/src/api/schema.d.ts` 加入 `lint-staged` 与 CI 的契约校验清单）。

---

## 7. 分期与工作量

| 阶段 | 内容 | 产出 |
|---|---|---|
| **P1** | 骨架 + stdio + 只读 15 工具 + 权限感知注册 + 集成测试 | 可在 Claude Desktop / Cursor 里查询管理端数据 |
| **P2** | Streamable HTTP + Bearer 直传 + 写入 8 工具（默认关） | 可远程接入；AI 可在授权下做常规维护 |
| **P3** | README 接入章节 + AGENTS.md 结构表 + `docs/mcp/README.md` 收敛为"指向代码" | 对外可用、文档闭环 |

**估**：P1 ≈ 1 天，P2 ≈ 0.5 天，P3 ≈ 0.5 天。

---

## 8. 验证方案

| 层 | 内容 |
|---|---|
| 单测 | 工具入参 zod 校验、权限过滤逻辑（给定 permissionCodes 集合 → 期望工具集） |
| API 集成 | 至少 2 个工具端到端真实调用（1 只读 + 1 写入），断言经 `apps/api` 生效且写入 `OperationLog` |
| 手动验收 | 在真实 MCP 客户端（Claude Desktop 或 Cursor）配置 stdio，跑通"查用户 → 分配角色" |
| 负例 | 低权限账号启动 → 工具集收窄；未开启写入开关 → 写工具不存在；无权限调用 → API 返回 403 |

---

## 9. 风险与开放问题

| 风险 | 说明 | 缓解 |
|---|---|---|
| **SDK 版本线** | npm `latest` 仍是 `1.30.0`（v1）；[v2 文档](https://ts.sdk.modelcontextprotocol.io/v2/) 已发布但未成为稳定 npm 线 | 用 1.30.0；v2 转正后评估迁移（只依赖 tools + 两种传输，属最稳定子集） |
| **MCP 规范演进快** | 授权、传输细节持续变化 | 只用 `tools` 能力与 stdio/HTTP 传输；不碰 prompts/resources 等仍在变的部分 |
| **HTTP 模式的鉴权合规性** | Bearer 直传不是 spec 推荐的 OAuth 流程 | 默认关闭 + 只面向内网；若将来要做多租户远程服务，再评估补 OAuth resource server |
| **工具粒度** | 过粗则 AI 难用，过细则上下文膨胀 | 当前 23 个为起点；实施后按真实使用情况增删，清单以代码为准 |
| **写操作的风险面** | AI 可能做非预期变更 | 默认关 + 排除删除/凭据类 + RBAC 裁决 + 操作日志可追溯 |

---

## 10. 开放问题（待定）

1. **HTTP 模式是否需要 token 透传之外的"服务端托管凭据"**（即 MCP server 自己持有账号，客户端免配置）——方便但削弱"操作可归因到具体人"的特性，倾向不做。
2. **是否提供 `resources`**（如把菜单树、字典暴露为可读资源而非工具）——规范支持，但当前 22 个工具已覆盖，暂不做。
3. **是否需要 `prompts`**（预置提示词模板，如"排查登录失败"）——与项目定位关联弱，暂不做。
