import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { prisma } from "@repo/db"
import { notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import {
  announcementItemSchema,
  announcementPageResultSchema,
  errorBodySchema,
  idParamSchema,
  latestAnnouncementSchema,
} from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})

const announcementCreateSchema = z.object({
  title: z.string().min(1).max(64),
  content: z.string().min(1).max(2000),
  status: z.boolean().optional(),
})

// 全部字段可选（改谁传谁）
const announcementUpdateSchema = announcementCreateSchema.partial()

/** 公告转列表项：Prisma DateTime → OpenAPI string */
function toAnnouncementItem(announcement: {
  id: string
  title: string
  content: string
  status: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    status: announcement.status,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
  }
}

/**
 * 公告管理路由：
 * - 管理接口（分页/创建/更新/删除）挂 system:announcement:* 权限码
 * - GET /api/announcements/latest 为全员展示（登录即可），返回最新已发布公告（无则 null）
 */
export function announcementRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/announcements",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.announcementQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "公告分页列表（按创建时间倒序）", ...okBody(announcementPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize } = c.req.valid("query")
      const [list, total] = await Promise.all([
        prisma.announcement.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        prisma.announcement.count(),
      ])
      return c.json({ code: 0, data: { list: list.map(toAnnouncementItem), total }, message: "ok" }, 200)
    },
  )

  // 最新已发布公告（首页横幅）：全员可见，仅要求登录（不挂权限码）
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/announcements/latest",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      responses: {
        200: { description: "最新已发布公告（无则 null）", ...okBody(latestAnnouncementSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const latest = await prisma.announcement.findFirst({
        where: { status: true },
        orderBy: { createdAt: "desc" },
      })
      return c.json({ code: 0, data: latest ? toAnnouncementItem(latest) : null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/announcements",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.announcementCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: announcementCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回公告）", ...okBody(announcementItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { title, content, status } = c.req.valid("json")
      const data: Prisma.AnnouncementCreateInput = { title, content }
      if (status !== undefined) data.status = status
      const created = await prisma.announcement.create({ data })
      return c.json({ code: 0, data: toAnnouncementItem(created), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/announcements/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.announcementUpdate)],
      security: bearerSecurity,
      request: {
        params: idParamSchema,
        body: { content: { "application/json": { schema: announcementUpdateSchema } } },
      },
      responses: {
        200: { description: "更新成功（返回公告）", ...okBody(announcementItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "公告不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } })
      if (!existing) throw notFound("公告不存在")
      const data: Prisma.AnnouncementUpdateInput = {}
      if (fields.title !== undefined) data.title = fields.title
      if (fields.content !== undefined) data.content = fields.content
      if (fields.status !== undefined) data.status = fields.status
      const updated = await prisma.announcement.update({ where: { id }, data })
      return c.json({ code: 0, data: toAnnouncementItem(updated), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/announcements/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.announcementDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "公告不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const target = await prisma.announcement.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("公告不存在")
      await prisma.announcement.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
