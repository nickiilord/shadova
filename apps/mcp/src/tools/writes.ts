import { z } from "zod"
import { PERMISSIONS } from "@repo/shared"
import type { components } from "../api/schema.js"
import { defineTool } from "./registry.js"

/**
 * 写入类工具：仅在 SHADOVA_ENABLE_WRITE_TOOLS=true 时注册（见 registry.ts 的 selectTools）。
 *
 * 两条设计约定：
 * 1. 只做增量更新——不提供任何删除能力，不可逆操作交给人（见 docs/mcp/README.md §4.3）
 * 2. 用户启用状态单独成工具（set_user_status），避免与 update_user 的普通资料编辑混淆
 */
export const writeTools = [
  defineTool({
    name: "create_user",
    title: "创建用户",
    description:
      "新建一个系统用户。用户名只允许字母数字与 _.- ；初始密码需 8-128 位；可选配置邮箱、手机、部门与角色。",
    permission: PERMISSIONS.userCreate,
    kind: "write",
    inputSchema: {
      username: z
        .string()
        .min(2)
        .max(64)
        .regex(/^[a-zA-Z0-9_.-]+$/)
        .describe("登录用户名：字母数字与 _.- 组成，2-64 位"),
      password: z.string().min(8).max(128).describe("初始密码，8-128 位"),
      nickname: z.string().min(1).max(64).describe("显示昵称"),
      email: z.string().email().optional().describe("邮箱（可选）"),
      telephone: z.string().min(5).max(32).optional().describe("手机号（可选）"),
      departmentId: z.string().nullable().optional().describe("所属部门 ID（可选，可由 list_departments 获得）"),
      roleIds: z.array(z.string()).optional().describe("角色 ID 列表（可选，可由 list_roles 获得；传 ID 不是编码）"),
    },
    run: (input, client) =>
      client.request<components["schemas"]["UserDetail"]>("/api/users", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  }),

  defineTool({
    name: "update_user",
    title: "更新用户资料",
    description:
      "修改指定用户的昵称、邮箱、手机、所属部门或角色。只提交需要变更的字段；" +
      "启用状态请用 set_user_status。邮箱/手机/部门传 null 表示清空。",
    permission: PERMISSIONS.userUpdate,
    kind: "write",
    inputSchema: {
      id: z.string().min(1).describe("用户 ID，可由 list_users 获得"),
      nickname: z.string().min(1).max(64).optional().describe("昵称（可选）"),
      email: z.string().email().nullable().optional().describe("邮箱；传 null 清空（可选）"),
      telephone: z.string().min(5).max(32).nullable().optional().describe("手机号；传 null 清空（可选）"),
      departmentId: z.string().nullable().optional().describe("所属部门 ID；传 null 移出部门（可选）"),
      roleIds: z.array(z.string()).optional().describe("角色 ID 全量列表（整体替换语义，可选）"),
    },
    run: ({ id, ...patch }, client) =>
      client.request<components["schemas"]["UserDetail"]>(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  }),

  defineTool({
    name: "set_user_status",
    title: "启用或禁用用户",
    description: "切换用户的启用状态。禁用后该用户无法再登录；已有会话不受影响，需要时用会话管理接口处理。",
    permission: PERMISSIONS.userUpdate,
    kind: "write",
    inputSchema: {
      id: z.string().min(1).describe("用户 ID，可由 list_users 获得"),
      status: z.boolean().describe("true 启用 / false 禁用"),
    },
    run: ({ id, status }, client) =>
      client.request<components["schemas"]["UserDetail"]>(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  }),

  defineTool({
    name: "assign_user_roles",
    title: "分配用户角色",
    description: "整体替换某用户的角色列表（全量覆盖，不是追加）。角色 ID 可由 list_roles 获得。",
    permission: PERMISSIONS.userAssignRole,
    kind: "write",
    inputSchema: {
      id: z.string().min(1).describe("用户 ID，可由 list_users 获得"),
      roleIds: z.array(z.string()).describe("替换后的角色 ID 全量列表；传空数组表示清空角色"),
    },
    run: ({ id, roleIds }, client) =>
      client.request<components["schemas"]["UserDetail"]>(`/api/users/${id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds }),
      }),
  }),

  defineTool({
    name: "create_role",
    title: "创建角色",
    description: "新建角色。code 是权限判断使用的唯一编码，创建后不建议更改；新角色默认没有任何菜单授权。",
    permission: PERMISSIONS.roleCreate,
    kind: "write",
    inputSchema: {
      nameZh: z.string().min(1).max(64).describe("中文名称"),
      code: z
        .string()
        .min(2)
        .max(32)
        .regex(/^[A-Za-z0-9_-]+$/)
        .describe("角色编码（唯一）：字母数字与 _- ，2-32 位"),
      nameEn: z.string().max(64).nullable().optional().describe("英文名称（可选）"),
      description: z.string().max(255).optional().describe("说明（可选）"),
      sort: z.number().int().optional().describe("排序值，越小越靠前（可选，默认 0）"),
      status: z.boolean().optional().describe("是否启用（可选，默认启用）"),
    },
    run: (input, client) =>
      client.request<components["schemas"]["RoleDetail"]>("/api/roles", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  }),

  defineTool({
    name: "grant_role_menus",
    title: "设置角色的菜单授权",
    description:
      "整体替换角色的菜单与按钮授权（全量覆盖）。菜单 ID 可由 get_menu_tree 获得，" +
      "当前已有授权可由 get_role_menus 查询；变更后该角色下所有用户的权限即时收窄或扩大。",
    permission: PERMISSIONS.roleAssign,
    kind: "write",
    inputSchema: {
      id: z.string().min(1).describe("角色 ID，可由 list_roles 获得"),
      menuIds: z.array(z.string()).max(500).describe("替换后的菜单/按钮 ID 全量列表；传空数组表示收回全部授权"),
    },
    run: ({ id, menuIds }, client) =>
      client.request<null>(`/api/roles/${id}/menus`, {
        method: "PUT",
        body: JSON.stringify({ menuIds }),
      }),
  }),

  defineTool({
    name: "create_announcement",
    title: "发布公告",
    description: "创建一条全局公告，所有登录用户可见（受公告状态控制）。",
    permission: PERMISSIONS.announcementCreate,
    kind: "write",
    inputSchema: {
      title: z.string().min(1).max(64).describe("公告标题，1-64 字"),
      content: z.string().min(1).max(2000).describe("公告正文，1-2000 字"),
      status: z.boolean().optional().describe("是否发布（可选，默认发布）"),
    },
    run: (input, client) =>
      client.request<components["schemas"]["AnnouncementItem"]>("/api/announcements", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  }),

  defineTool({
    name: "handle_portal_message",
    title: "处理门户留言",
    description:
      "更新访客留言的处理状态与内部备注。转为 HANDLED 会记录处理时间；退回 PENDING 会清空处理时间；" +
      "仅补写备注时保留原有处理时间。备注是内部内容，不会展示给访客。",
    permission: PERMISSIONS.portalMessageUpdate,
    kind: "write",
    inputSchema: {
      id: z.string().min(1).describe("留言 ID，可由 list_portal_messages 获得"),
      status: z
        .enum(["PENDING", "HANDLED"])
        .optional()
        .describe("处理状态：HANDLED 已处理 / PENDING 待处理（可选）"),
      remark: z.string().max(500).nullable().optional().describe("内部备注，最多 500 字；传 null 清空（可选）"),
    },
    run: ({ id, ...patch }, client) =>
      client.request<components["schemas"]["PortalMessageItem"]>(`/api/portal/messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  }),
]
