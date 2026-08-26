import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { prisma } from "@repo/db"
import { HttpError, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { p2002Conflict } from "../lib/prisma-error.js"
import { configDetailSchema, configPageResultSchema, errorBodySchema, idParamSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

const configCreateSchema = z.object({
  configKey: z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/),
  configValue: z.string().min(1).max(1024),
  nameZh: z.string().min(1).max(64),
  nameEn: z.string().max(64).nullable().optional(),
  description: z.string().max(255).nullable().optional(),
  status: z.boolean().optional(),
})

// 全部字段可选（改谁传谁）；description 显式传 null 表示清空（undefined 不修改）
const configUpdateSchema = configCreateSchema.partial()

/** P2002 字段 → 409 code+message 映射（create/PATCH 共用；大小写变体同样命中唯一约束） */
const CONFIG_UNIQUE_FIELDS = {
  configKey: { code: "CONFIG_KEY_TAKEN", message: "参数键已存在" },
} as const

/** 系统参数详情；不存在 → 404 */
async function fetchConfigDetail(id: string) {
  const config = await prisma.config.findUnique({ where: { id } })
  if (!config) throw notFound("参数不存在")
  return config
}

type ConfigDetail = Awaited<ReturnType<typeof fetchConfigDetail>>

function toConfigDetail(config: ConfigDetail) {
  return {
    id: config.id,
    configKey: config.configKey,
    configValue: config.configValue,
    nameZh: config.nameZh,
    nameEn: config.nameEn,
    description: config.description,
    status: config.status,
    createdAt: config.createdAt,
  }
}

export function configRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/configs",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.configQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "系统参数分页列表", ...okBody(configPageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      // keyword contains 三方言决策同 roles：LIKE 通配符不转义，管理端模糊搜索接受此行为
      const where = keyword
        ? { OR: [{ configKey: { contains: keyword } }, { nameZh: { contains: keyword } }] }
        : {}
      const [list, total] = await Promise.all([
        prisma.config.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { id: "desc" },
        }),
        prisma.config.count({ where }),
      ])
      return c.json({ code: 0, data: { list: list.map(toConfigDetail), total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/configs",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.configCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: configCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(configDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "参数键已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { configKey, configValue, nameZh, nameEn, description, status } = c.req.valid("json")
      // configKey 统一小写存储（程序引用键，与大小写输入解耦）；exactOptionalPropertyTypes：undefined 不传
      const data: Prisma.ConfigCreateInput = { configKey: configKey.toLowerCase(), configValue, nameZh }
      if (nameEn !== undefined) data.nameEn = nameEn
      if (description !== undefined) data.description = description
      if (status !== undefined) data.status = status
      try {
        const config = await prisma.config.create({ data })
        return c.json({ code: 0, data: toConfigDetail(config), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, CONFIG_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/configs/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.configQuery)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "系统参数详情", ...okBody(configDetailSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "参数不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      return c.json({ code: 0, data: toConfigDetail(await fetchConfigDetail(id)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/configs/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.configUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: configUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(configDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "参数不存在", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "参数键已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      await fetchConfigDetail(id)
      const data: Prisma.ConfigUpdateInput = {}
      if (fields.configValue !== undefined) data.configValue = fields.configValue
      if (fields.nameZh !== undefined) data.nameZh = fields.nameZh
      if (fields.nameEn !== undefined) data.nameEn = fields.nameEn
      if (fields.description !== undefined) data.description = fields.description
      if (fields.status !== undefined) data.status = fields.status
      // configKey 统一小写存储（与创建一致，大小写变体同样命中唯一约束）
      if (fields.configKey !== undefined) data.configKey = fields.configKey.toLowerCase()
      try {
        const config = await prisma.config.update({ where: { id }, data })
        return c.json({ code: 0, data: toConfigDetail(config), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, CONFIG_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/configs/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.configDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "参数不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const target = await prisma.config.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("参数不存在")
      await prisma.config.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
