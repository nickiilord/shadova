import { z } from "zod"
import { PERMISSIONS } from "@repo/shared"
import type { components } from "../api/schema.js"
import { pageQuery, pageShape } from "./query.js"
import { defineTool } from "./registry.js"

/** 组织与运维域工具（只读）：部门 / 参数 / 会话 / 日志 / 公告 */
export const systemTools = [
  defineTool({
    name: "list_departments",
    title: "查询部门列表",
    description: "返回扁平部门列表（含父级 ID 与直属用户数），层级关系可由 parentId 自行还原。",
    permission: PERMISSIONS.departmentQuery,
    kind: "read",
    inputSchema: {},
    run: (_args, client) => client.request<components["schemas"]["DepartmentList"]>("/api/departments"),
  }),

  defineTool({
    name: "list_configs",
    title: "查询系统参数",
    description: "分页查询系统级 key-value 参数（如 user.password.minLength），返回参数键、值、名称与说明。",
    permission: PERMISSIONS.configQuery,
    kind: "read",
    inputSchema: {
      ...pageShape,
      keyword: z.string().optional().describe("按参数键 / 中文名称模糊匹配"),
    },
    run: ({ page, pageSize, keyword }, client) =>
      client.request<components["schemas"]["ConfigPageResult"]>(
        `/api/configs?${pageQuery({ page, pageSize, keyword })}`,
      ),
  }),

  defineTool({
    name: "list_sessions",
    title: "查询在线会话",
    description: "分页查询当前有效的登录会话（未吊销且未过期），含来源 IP、浏览器 UA 与登录时间。",
    permission: PERMISSIONS.sessionQuery,
    kind: "read",
    inputSchema: {
      ...pageShape,
      keyword: z.string().optional().describe("按用户名 / 昵称模糊匹配"),
    },
    run: ({ page, pageSize, keyword }, client) =>
      client.request<components["schemas"]["SessionPageResult"]>(
        `/api/sessions?${pageQuery({ page, pageSize, keyword })}`,
      ),
  }),

  defineTool({
    name: "list_login_logs",
    title: "查询登录日志",
    description: "分页查询登录日志（成功与失败都记录），含尝试的用户名、来源 IP 与结果消息；适合排查登录异常。",
    permission: PERMISSIONS.logQuery,
    kind: "read",
    inputSchema: {
      ...pageShape,
      keyword: z.string().optional().describe("按用户名模糊匹配"),
    },
    run: ({ page, pageSize, keyword }, client) =>
      client.request<components["schemas"]["LoginLogPageResult"]>(
        `/api/logs/login?${pageQuery({ page, pageSize, keyword })}`,
      ),
  }),

  defineTool({
    name: "list_operation_logs",
    title: "查询操作日志",
    description: "分页查询写操作审计日志（接口、状态码、耗时、脱敏后的请求体），适合追溯谁改了什么。",
    permission: PERMISSIONS.logQuery,
    kind: "read",
    inputSchema: {
      ...pageShape,
      keyword: z.string().optional().describe("按用户名 / 接口路径模糊匹配"),
    },
    run: ({ page, pageSize, keyword }, client) =>
      client.request<components["schemas"]["OperationLogPageResult"]>(
        `/api/logs/operation?${pageQuery({ page, pageSize, keyword })}`,
      ),
  }),

  defineTool({
    name: "list_announcements",
    title: "查询公告列表",
    description: "分页查询全局公告（标题、正文、发布状态与时间）。该接口不支持关键词搜索。",
    permission: PERMISSIONS.announcementQuery,
    kind: "read",
    inputSchema: { ...pageShape },
    run: ({ page, pageSize }, client) =>
      client.request<components["schemas"]["AnnouncementPageResult"]>(
        `/api/announcements?${pageQuery({ page, pageSize })}`,
      ),
  }),
]
