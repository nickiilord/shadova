import { z } from "zod"
import { PERMISSIONS } from "@repo/shared"
import type { components } from "../api/schema.js"
import { pageQuery, pageShape } from "./query.js"
import { defineTool } from "./registry.js"

/** 数据字典域工具（只读） */
export const dictTools = [
  defineTool({
    name: "list_dict_types",
    title: "查询字典类型列表",
    description: "分页查询数据字典类型（如 user_status），返回类型编码、中英文名称与启用状态。",
    permission: PERMISSIONS.dictQuery,
    kind: "read",
    inputSchema: {
      ...pageShape,
      keyword: z.string().optional().describe("按类型编码 / 名称模糊匹配"),
    },
    run: ({ page, pageSize, keyword }, client) =>
      client.request<components["schemas"]["DictTypePageResult"]>(
        `/api/dicts/types?${pageQuery({ page, pageSize, keyword })}`,
      ),
  }),

  defineTool({
    name: "get_dict_options",
    title: "查询字典项选项",
    description: "按字典类型编码返回其**启用**的字典项（值 + 中英文标签），适合在填写其他工具参数前确认取值。",
    permission: PERMISSIONS.dictQuery,
    kind: "read",
    inputSchema: { typeCode: z.string().min(1).describe("字典类型编码，如 user_status（注意不是类型 ID）") },
    run: ({ typeCode }, client) =>
      client.request<components["schemas"]["DictOption"][]>(`/api/dicts/types/${typeCode}/options`),
  }),
]
