import { z } from "zod"
import { PERMISSIONS } from "@repo/shared"
import type { components } from "../api/schema.js"
import { pageQuery, pageShape } from "./query.js"
import { defineTool } from "./registry.js"

/** 用户域工具（只读） */
export const userTools = [
  defineTool({
    name: "list_users",
    title: "查询用户列表",
    description: "分页查询系统用户，返回用户名、昵称、邮箱、手机、所属部门、角色与启用状态。",
    permission: PERMISSIONS.userQuery,
    kind: "read",
    inputSchema: {
      ...pageShape,
      keyword: z.string().optional().describe("按用户名 / 昵称 / 邮箱 / 手机模糊匹配"),
    },
    run: ({ page, pageSize, keyword }, client) =>
      client.request<components["schemas"]["UserPageResult"]>(
        `/api/users?${pageQuery({ page, pageSize, keyword })}`,
      ),
  }),

  defineTool({
    name: "get_user",
    title: "查询用户详情",
    description: "按用户 ID 查询单个用户的完整信息（含角色、所属部门与创建时间）。",
    permission: PERMISSIONS.userQuery,
    kind: "read",
    inputSchema: { id: z.string().min(1).describe("用户 ID，可由 list_users 获得") },
    run: ({ id }, client) => client.request<components["schemas"]["UserDetail"]>(`/api/users/${id}`),
  }),
]
