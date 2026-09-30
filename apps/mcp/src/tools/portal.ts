import { z } from "zod"
import { PERMISSIONS } from "@repo/shared"
import type { components } from "../api/schema.js"
import { pageQuery, pageShape } from "./query.js"
import { defineTool } from "./registry.js"

/** 门户域工具（只读） */
export const portalTools = [
  defineTool({
    name: "get_portal_site",
    title: "查询门户站点配置",
    description:
      "返回公开门户的站点配置（站点名称与标语、联系方式、社交链接、隐私政策、页脚与 SEO 文案）。",
    permission: PERMISSIONS.portalSiteQuery,
    kind: "read",
    inputSchema: {},
    run: (_args, client) => client.request<components["schemas"]["PortalSite"]>("/api/portal/site"),
  }),

  defineTool({
    name: "list_portal_messages",
    title: "查询门户留言",
    description: "分页查询访客在门户首页提交的留言，可按处理状态筛选；返回姓名、联系方式、内容、状态与内部备注。",
    permission: PERMISSIONS.portalMessageQuery,
    kind: "read",
    inputSchema: {
      ...pageShape,
      status: z
        .enum(["PENDING", "HANDLED"])
        .optional()
        .describe("按处理状态筛选：PENDING 待处理 / HANDLED 已处理；不传则返回全部"),
      keyword: z.string().optional().describe("按姓名 / 联系方式 / 留言内容模糊匹配"),
    },
    run: ({ page, pageSize, status, keyword }, client) => {
      const params = new URLSearchParams(pageQuery({ page, pageSize, keyword }))
      if (status !== undefined) params.set("status", status)
      return client.request<components["schemas"]["PortalMessagePageResult"]>(
        `/api/portal/messages?${params.toString()}`,
      )
    },
  }),
]
