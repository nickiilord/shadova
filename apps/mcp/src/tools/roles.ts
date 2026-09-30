import { z } from "zod"
import { PERMISSIONS } from "@repo/shared"
import type { components } from "../api/schema.js"
import { defineTool } from "./registry.js"

/** 角色域工具（只读） */
export const roleTools = [
  defineTool({
    name: "list_roles",
    title: "查询全部角色",
    description: "列出系统全部角色（编码、中英文名称、排序与启用状态），可在分配角色前确认目标角色编码。",
    permission: PERMISSIONS.roleQuery,
    kind: "read",
    inputSchema: {},
    run: (_args, client) => client.request<components["schemas"]["RoleListItem"][]>("/api/roles/list"),
  }),

  defineTool({
    name: "get_role_menus",
    title: "查询角色的菜单授权",
    description:
      "返回某角色已授权的菜单与按钮 ID 列表；ID 与名称的对应关系可由 get_menu_tree 查询（授权为全量覆盖语义）。",
    permission: PERMISSIONS.roleQuery,
    kind: "read",
    inputSchema: { id: z.string().min(1).describe("角色 ID，可由 list_roles 获得（注意不是角色编码）") },
    run: ({ id }, client) => client.request<{ menuIds: string[] }>(`/api/roles/${id}/menus`),
  }),
]
