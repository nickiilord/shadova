import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import type { AppConfig } from "../config.js"
import { notFound } from "../lib/http-error.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { errorBodySchema, idParamSchema, sessionPageResultSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

const revokeAllParamSchema = z.object({ userId: z.string() })

/** 在线会话查询条件：未吊销且未过期（三个端点共用同一"在线"定义） */
function activeWhere(keyword?: string) {
  return {
    revokedAt: null,
    expiresAt: { gt: new Date() },
    ...(keyword ? { user: { username: { contains: keyword } } } : {}),
  }
}

export function sessionRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/sessions",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.sessionQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "在线会话分页列表", ...okBody(sessionPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      const where = activeWhere(keyword)
      const [sessions, total] = await Promise.all([
        prisma.refreshToken.findMany({
          where,
          select: {
            id: true,
            ip: true,
            userAgent: true,
            createdAt: true,
            expiresAt: true,
            user: { select: { username: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        prisma.refreshToken.count({ where }),
      ])
      const list = sessions.map((session) => ({
        id: session.id,
        username: session.user.username,
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      }))
      return c.json({ code: 0, data: { list, total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/sessions/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.sessionRevoke)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "已吊销", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "会话不存在或已吊销", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      // 带 revokedAt=null 条件更新（CAS）：已吊销会话返回 404
      const revoked = await prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      if (revoked.count !== 1) throw notFound("会话不存在或已吊销")
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/sessions/{userId}/revoke-all",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.sessionRevoke)],
      security: bearerSecurity,
      request: { params: revokeAllParamSchema },
      responses: {
        200: { description: "已吊销该用户全部在线会话", ...okBody(z.object({ count: z.number() })) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { userId } = c.req.valid("param")
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) throw notFound("用户不存在")
      const revoked = await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      })
      return c.json({ code: 0, data: { count: revoked.count }, message: "ok" }, 200)
    },
  )

  return app
}
