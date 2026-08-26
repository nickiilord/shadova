import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { HttpError, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { errorBodySchema, idParamSchema, notificationItemSchema, notificationPageResultSchema, unreadCountSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})

/** 发送通知请求体（管理员给指定用户发站内通知） */
const notificationCreateSchema = z.object({
  targetUserId: z.string().min(1),
  title: z.string().min(1).max(64),
  content: z.string().min(1).max(500),
})

/** 通知转列表项：Prisma DateTime → OpenAPI string（三方言一致：UTC ISO 字符串） */
function toNotificationItem(notification: {
  id: string
  type: string
  title: string
  content: string
  isRead: boolean
  readAt: Date | null
  createdAt: Date
}) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    content: notification.content,
    isRead: notification.isRead,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  }
}

/**
 * 通知中心路由（站内通知）：
 * - 查询/已读类接口为个人数据，仅要求登录（authenticate），不挂权限码（顶栏铃铛与页面共用）
 * - 发送通知为管理操作，挂 system:notification:create（前端 <Permission> 同码门控）
 */
export function notificationRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/notifications",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "我的通知分页列表（按创建时间倒序）", ...okBody(notificationPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const userId = c.get("userId")
      const { page, pageSize } = c.req.valid("query")
      const [list, total] = await Promise.all([
        prisma.notification.findMany({
          where: { userId },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        prisma.notification.count({ where: { userId } }),
      ])
      return c.json({ code: 0, data: { list: list.map(toNotificationItem), total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/notifications/unread-count",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      responses: {
        200: { description: "我的未读通知数", ...okBody(unreadCountSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const userId = c.get("userId")
      const count = await prisma.notification.count({ where: { userId, isRead: false } })
      return c.json({ code: 0, data: { count }, message: "ok" }, 200)
    },
  )

  // 标记单条已读：updateMany 带 userId 条件（防越权标记他人通知）；未命中（不存在或非本人）→ 404
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/notifications/{id}/read",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "标记成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "通知不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const userId = c.get("userId")
      const { id } = c.req.valid("param")
      const updated = await prisma.notification.updateMany({
        where: { id, userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
      if (updated.count !== 1) throw notFound("通知不存在")
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/notifications/read-all",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      responses: {
        200: { description: "全部标记成功（返回实际标记条数）", ...okBody(unreadCountSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const userId = c.get("userId")
      const updated = await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
      return c.json({ code: 0, data: { count: updated.count }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/notifications",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.notificationCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: notificationCreateSchema } } } },
      responses: {
        200: { description: "发送成功（返回通知详情）", ...okBody(notificationItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "接收用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { targetUserId, title, content } = c.req.valid("json")
      const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } })
      if (!target) throw new HttpError(404, "USER_NOT_FOUND", "接收用户不存在")
      const notification = await prisma.notification.create({
        data: { userId: targetUserId, title, content },
      })
      return c.json({ code: 0, data: toNotificationItem(notification), message: "ok" }, 200)
    },
  )

  return app
}
