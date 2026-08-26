import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import {
  errorBodySchema,
  loginLogPageResultSchema,
  operationLogPageResultSchema,
} from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

// 列表响应返回对外可展示字段（含 userAgent / 操作日志的 requestBody 脱敏快照与 errorMessage——
// 日志详情页展示所需，属有意设计；requestBody 在写入前已按键名脱敏并截断 180 字符）
const loginSelect = {
  id: true,
  username: true,
  status: true,
  ip: true,
  userAgent: true,
  message: true,
  createdAt: true,
} as const
const operationSelect = {
  id: true,
  username: true,
  method: true,
  path: true,
  statusCode: true,
  durationMs: true,
  ip: true,
  requestBody: true,
  errorMessage: true,
  createdAt: true,
} as const

export function logRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/logs/login",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.logQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "登录日志分页列表", ...okBody(loginLogPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      // keyword contains 三方言决策同 users 路由（SQLite/MySQL LIKE 大小写不敏感，PG 下敏感）
      const where = keyword ? { username: { contains: keyword } } : {}
      const [list, total] = await Promise.all([
        prisma.loginLog.findMany({
          where,
          select: loginSelect,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        prisma.loginLog.count({ where }),
      ])
      return c.json({ code: 0, data: { list, total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/logs/operation",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.logQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "操作日志分页列表", ...okBody(operationLogPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      // keyword 同时匹配操作账号与请求路径
      const where = keyword ? { OR: [{ username: { contains: keyword } }, { path: { contains: keyword } }] } : {}
      const [list, total] = await Promise.all([
        prisma.operationLog.findMany({
          where,
          select: operationSelect,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        prisma.operationLog.count({ where }),
      ])
      return c.json({ code: 0, data: { list, total }, message: "ok" }, 200)
    },
  )

  return app
}
