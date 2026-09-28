import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { PERMISSIONS, PORTAL_ICON_NAMES } from "@repo/shared"
import type { AppConfig } from "../config.js"
import { HttpError, notFound } from "../lib/http-error.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { consume } from "../lib/rate-limit.js"
import { requestIp } from "../lib/request-log.js"
import {
  errorBodySchema,
  idParamSchema,
  portalBannerItemSchema,
  portalBannerPageResultSchema,
  portalHomeSchema,
  portalMessageItemSchema,
  portalMessagePageResultSchema,
  portalMessageReceiptSchema,
  portalSectionItemSchema,
  portalSectionPageResultSchema,
  portalSiteSchema,
} from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"
import { readPortalHome, readPortalSite, savePortalSite } from "../services/portal-service.js"

/**
 * 公开留言限流阈值：同一来源 60 秒 1 条 + 每小时 10 条（两条规则同时记账，见 lib/rate-limit.ts）。
 * 来源取自 requestIp（x-forwarded-for 首段）——无代理时该头可伪造，限流只抬高门槛，
 * 最终兜底是管理端的处理状态与删除能力。
 */
const MESSAGE_BURST_LIMIT = 1
const MESSAGE_BURST_WINDOW_MS = 60_000
const MESSAGE_HOURLY_LIMIT = 10
const MESSAGE_HOURLY_WINDOW_MS = 60 * 60 * 1000

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
})

const messagePageQuery = pageQuery.extend({
  status: z.enum(["PENDING", "HANDLED"]).optional(),
  keyword: z.string().optional(),
})

/** 访客留言字段上限与 schema.prisma 注释、docs/database 的 MySQL 类型清单保持一致 */
const portalMessageCreateSchema = z.object({
  name: z.string().min(1).max(64),
  contact: z.string().min(1).max(191),
  content: z.string().min(1).max(1000),
})

const portalMessageUpdateSchema = z.object({
  status: z.enum(["PENDING", "HANDLED"]).optional(),
  remark: z.string().max(500).nullable().optional(),
})

/** 站点配置保存：全字段可选（改谁传谁），显式传 null 表示清空该项 */
const portalSiteUpdateSchema = z.object({
  siteName: z.string().min(1).max(191).optional(),
  siteTagline: z.string().max(191).nullable().optional(),
  contactEmail: z.string().max(191).nullable().optional(),
  contactPhone: z.string().max(64).nullable().optional(),
  whatsappNumber: z.string().max(64).nullable().optional(),
  facebookUrl: z.string().max(512).nullable().optional(),
  instagramUrl: z.string().max(512).nullable().optional(),
  youtubeUrl: z.string().max(512).nullable().optional(),
  telegramUrl: z.string().max(512).nullable().optional(),
  privacyPolicyUrl: z.string().max(512).nullable().optional(),
  footerText: z.string().max(2000).nullable().optional(),
  seoTitle: z.string().max(191).nullable().optional(),
  seoDescription: z.string().max(1000).nullable().optional(),
  seoKeywords: z.string().max(500).nullable().optional(),
})

/** 图文区块写入：icon 取值受 PORTAL_ICON_NAMES 白名单约束（portal 端渲染不出的图标不许入库） */
const portalSectionCreateSchema = z.object({
  icon: z.enum(PORTAL_ICON_NAMES).nullable().optional(),
  title: z.string().min(1).max(64),
  description: z.string().max(1000).nullable().optional(),
  sort: z.number().int().min(0).optional(),
  status: z.boolean().optional(),
})

const portalSectionUpdateSchema = portalSectionCreateSchema.partial()

/** Banner 写入：imageUrl 为外链地址，不经服务端存储（门户公开访问，不引入公开文件链路） */
const portalBannerCreateSchema = z.object({
  title: z.string().min(1).max(64),
  imageUrl: z.string().min(1).max(512),
  linkUrl: z.string().max(512).nullable().optional(),
  sort: z.number().int().min(0).optional(),
  status: z.boolean().optional(),
})

const portalBannerUpdateSchema = portalBannerCreateSchema.partial()

/** 存在性校验（PATCH/DELETE 共用），不存在抛 404 */
async function assertSectionExists(id: string): Promise<void> {
  const found = await prisma.portalSection.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw notFound("图文区块不存在")
}

async function assertBannerExists(id: string): Promise<void> {
  const found = await prisma.portalBanner.findUnique({ where: { id }, select: { id: true } })
  if (!found) throw notFound("Banner 不存在")
}

export function portalRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  // ---------- 公开接口（无需登录：门户首页面向访客） ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/portal/home",
      request: {},
      responses: {
        200: { description: "门户首页聚合数据（站点配置 + 启用区块 + 启用 Banner）", ...okBody(portalHomeSchema) },
      },
    }),
    async (c) => c.json({ code: 0, data: await readPortalHome(), message: "ok" }, 200),
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/portal/messages",
      request: { body: { content: { "application/json": { schema: portalMessageCreateSchema } } } },
      responses: {
        200: { description: "留言已提交", ...okBody(portalMessageReceiptSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        429: { description: "提交过于频繁", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { name, contact, content } = c.req.valid("json")
      const source = requestIp(c) ?? "unknown"
      // 两条规则都记账（不短路），否则被跳过的规则不会生效
      const allowed = [
        consume(`portal:message:${source}:burst`, MESSAGE_BURST_LIMIT, MESSAGE_BURST_WINDOW_MS),
        consume(`portal:message:${source}:hour`, MESSAGE_HOURLY_LIMIT, MESSAGE_HOURLY_WINDOW_MS),
      ].every(Boolean)
      if (!allowed) throw new HttpError(429, "RATE_LIMITED", "提交过于频繁，请稍后再试")
      const created = await prisma.portalMessage.create({
        data: { name, contact, content },
        select: { id: true, createdAt: true },
      })
      return c.json({ code: 0, data: created, message: "ok" }, 200)
    },
  )

  // ---------- 站点配置 ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/portal/site",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalSiteQuery)],
      security: bearerSecurity,
      request: {},
      responses: {
        200: { description: "站点配置（未配置时返回默认值）", ...okBody(portalSiteSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => c.json({ code: 0, data: await readPortalSite(), message: "ok" }, 200),
  )

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/portal/site",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalSiteUpdate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: portalSiteUpdateSchema } } } },
      responses: {
        200: { description: "保存成功（返回完整站点配置）", ...okBody(portalSiteSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const fields = c.req.valid("json")
      return c.json({ code: 0, data: await savePortalSite(fields), message: "ok" }, 200)
    },
  )

  // ---------- 图文区块 ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/portal/sections",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalSectionQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "图文区块分页列表", ...okBody(portalSectionPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize } = c.req.valid("query")
      const [list, total] = await Promise.all([
        prisma.portalSection.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        }),
        prisma.portalSection.count(),
      ])
      return c.json({ code: 0, data: { list, total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/portal/sections",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalSectionCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: portalSectionCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(portalSectionItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { icon, title, description, sort, status } = c.req.valid("json")
      const data: Prisma.PortalSectionCreateInput = { title }
      // exactOptionalPropertyTypes：undefined 不赋值（Prisma 侧缺省即用默认值）
      if (icon !== undefined) data.icon = icon
      if (description !== undefined) data.description = description
      if (sort !== undefined) data.sort = sort
      if (status !== undefined) data.status = status
      const created = await prisma.portalSection.create({ data })
      return c.json({ code: 0, data: created, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/portal/sections/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalSectionUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: portalSectionUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(portalSectionItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "图文区块不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      await assertSectionExists(id)
      const data: Prisma.PortalSectionUpdateInput = {}
      if (fields.icon !== undefined) data.icon = fields.icon
      if (fields.title !== undefined) data.title = fields.title
      if (fields.description !== undefined) data.description = fields.description
      if (fields.sort !== undefined) data.sort = fields.sort
      if (fields.status !== undefined) data.status = fields.status
      const updated = await prisma.portalSection.update({ where: { id }, data })
      return c.json({ code: 0, data: updated, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/portal/sections/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalSectionDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "图文区块不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      await assertSectionExists(id)
      await prisma.portalSection.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  // ---------- Banner ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/portal/banners",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalBannerQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "Banner 分页列表", ...okBody(portalBannerPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize } = c.req.valid("query")
      const [list, total] = await Promise.all([
        prisma.portalBanner.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        }),
        prisma.portalBanner.count(),
      ])
      return c.json({ code: 0, data: { list, total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/portal/banners",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalBannerCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: portalBannerCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(portalBannerItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { title, imageUrl, linkUrl, sort, status } = c.req.valid("json")
      const data: Prisma.PortalBannerCreateInput = { title, imageUrl }
      if (linkUrl !== undefined) data.linkUrl = linkUrl
      if (sort !== undefined) data.sort = sort
      if (status !== undefined) data.status = status
      const created = await prisma.portalBanner.create({ data })
      return c.json({ code: 0, data: created, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/portal/banners/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalBannerUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: portalBannerUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(portalBannerItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "Banner 不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      await assertBannerExists(id)
      const data: Prisma.PortalBannerUpdateInput = {}
      if (fields.title !== undefined) data.title = fields.title
      if (fields.imageUrl !== undefined) data.imageUrl = fields.imageUrl
      if (fields.linkUrl !== undefined) data.linkUrl = fields.linkUrl
      if (fields.sort !== undefined) data.sort = fields.sort
      if (fields.status !== undefined) data.status = fields.status
      const updated = await prisma.portalBanner.update({ where: { id }, data })
      return c.json({ code: 0, data: updated, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/portal/banners/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalBannerDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "Banner 不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      await assertBannerExists(id)
      await prisma.portalBanner.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  // ---------- 留言反馈（管理端只做收单与状态流转，无新增接口） ----------

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/portal/messages",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalMessageQuery)],
      security: bearerSecurity,
      request: { query: messagePageQuery },
      responses: {
        200: { description: "留言分页列表（可按处理状态筛选）", ...okBody(portalMessagePageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, status, keyword } = c.req.valid("query")
      const where: Prisma.PortalMessageWhereInput = {}
      if (status !== undefined) where.status = status
      if (keyword !== undefined && keyword !== "") {
        where.OR = [{ name: { contains: keyword } }, { contact: { contains: keyword } }, { content: { contains: keyword } }]
      }
      const [list, total] = await Promise.all([
        prisma.portalMessage.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        prisma.portalMessage.count({ where }),
      ])
      return c.json({ code: 0, data: { list, total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/portal/messages/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalMessageUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: portalMessageUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(portalMessageItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "留言不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      const found = await prisma.portalMessage.findUnique({ where: { id }, select: { id: true } })
      if (!found) throw notFound("留言不存在")
      const data: Prisma.PortalMessageUpdateInput = {}
      if (fields.status !== undefined) {
        data.status = fields.status
        // 状态与处理时间同步流转：转 HANDLED 记录处理时间，退回 PENDING 清空
        data.handledAt = fields.status === "HANDLED" ? new Date() : null
      }
      if (fields.remark !== undefined) data.remark = fields.remark
      const updated = await prisma.portalMessage.update({ where: { id }, data })
      return c.json({ code: 0, data: updated, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/portal/messages/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.portalMessageDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "留言不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const found = await prisma.portalMessage.findUnique({ where: { id }, select: { id: true } })
      if (!found) throw notFound("留言不存在")
      await prisma.portalMessage.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
