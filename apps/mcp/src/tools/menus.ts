import { PERMISSIONS } from "@repo/shared"
import type { components } from "../api/schema.js"
import { defineTool } from "./registry.js"

/** 菜单域工具（只读） */
export const menuTools = [
  defineTool({
    name: "get_menu_tree",
    title: "查询菜单树",
    description:
      "返回完整菜单树，含三级类型（DIR 目录 / MENU 菜单 / BUTTON 按钮）、权限码与路由信息；" +
      "可用于把角色授权里的菜单 ID 翻译成名称。",
    permission: PERMISSIONS.menuQuery,
    kind: "read",
    inputSchema: {},
    run: (_args, client) =>
      client.request<(components["schemas"]["MenuNode"] | null)[]>("/api/menus/tree"),
  }),
]
