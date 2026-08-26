import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { HttpError, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { p2002Conflict } from "../lib/prisma-error.js"
import {
  dictOptionSchema,
  dictTypeDetailSchema,
  dictTypeListItemSchema,
  dictTypePageResultSchema,
  errorBodySchema,
  idParamSchema,
} from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"
import { replaceDictItems } from "../services/dict-service.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

/** {typeCode} 路径参数（options 接口用；typeCode 是程序引用键，与 {id} 语义区分） */
const typeCodeParamSchema = z.object({ typeCode: z.string() })

const dictTypeCreateSchema = z.object({
  typeCode: z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/),
  nameZh: z.string().min(1).max(64),
  nameEn: z.string().max(64).nullable().optional(),
  description: z.string().max(255).nullable().optional(),
  sort: z.number().int().default(0),
  status: z.boolean().optional(),
})

// 全部字段可选（改谁传谁）；description 显式传 null 表示清空（undefined 不修改）
const dictTypeUpdateSchema = dictTypeCreateSchema.partial()

/** 字典项编辑输入（PUT 全量替换；value 非空与全量去重由路由层校验） */
const dictItemInputSchema = z.object({
  labelZh: z.string().min(1).max(64),
  labelEn: z.string().max(64).nullable().optional(),
  value: z.string().min(1).max(64),
  sort: z.number().int().default(0),
  status: z.boolean().optional(),
})

// 全量替换 items；上限 500 防超大 payload（正常字典项规模远小于此）
const dictItemsPutSchema = z.object({ items: z.array(dictItemInputSchema).max(500) })

/** P2002 字段 → 409 code+message 映射（create/PATCH 共用；大小写变体同样命中唯一约束） */
const DICT_UNIQUE_FIELDS = {
  typeCode: { code: "DICT_CODE_TAKEN", message: "字典类型编码已存在" },
} as const

/** 字典类型存在性检查（只需主键）；不存在 → 404 */
async function fetchDictTypeExists(id: string) {
  const type = await prisma.dictType.findUnique({ where: { id }, select: { id: true } })
  if (!type) throw notFound("字典类型不存在")
}
/** 字典类型详情；不存在 → 404（含字典项，按 sort 升序） */
async function fetchDictTypeDetail(id: string) {
  const type = await prisma.dictType.findUnique({
    where: { id },
    include: { items: { orderBy: { sort: "asc" } } },
  })
  if (!type) throw notFound("字典类型不存在")
  return type
}

type DictTypeDetailRow = Awaited<ReturnType<typeof fetchDictTypeDetail>>

/** 字典类型列表项（itemCount 由调用方传入：列表接口为 count 聚合，创建接口恒 0） */
function toDictTypeListItem(
  type: {
    id: string
    typeCode: string
    nameZh: string
    nameEn: string | null
    description: string | null
    status: boolean
    sort: number
  },
  itemCount: number,
) {
  return {
    id: type.id,
    typeCode: type.typeCode,
    nameZh: type.nameZh,
    nameEn: type.nameEn,
    description: type.description,
    status: type.status,
    sort: type.sort,
    itemCount,
  }
}

function toDictItem(item: {
  id: string
  labelZh: string
  labelEn: string | null
  value: string
  sort: number
  status: boolean
}) {
  return { id: item.id, labelZh: item.labelZh, labelEn: item.labelEn, value: item.value, sort: item.sort, status: item.status }
}

function toDictTypeDetail(type: DictTypeDetailRow) {
  return {
    id: type.id,
    typeCode: type.typeCode,
    nameZh: type.nameZh,
    nameEn: type.nameEn,
    description: type.description,
    status: type.status,
    sort: type.sort,
    items: type.items.map(toDictItem),
  }
}

export function dictRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/dicts/types",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.dictQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "字典类型分页列表", ...okBody(dictTypePageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      // keyword contains 三方言决策同 roles：LIKE 通配符不转义，管理端模糊搜索接受此行为
      const where = keyword
        ? { OR: [{ typeCode: { contains: keyword } }, { nameZh: { contains: keyword } }] }
        : {}
      const [rows, total] = await Promise.all([
        prisma.dictType.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { sort: "asc" },
          include: { _count: { select: { items: true } } },
        }),
        prisma.dictType.count({ where }),
      ])
      const list = rows.map((row) => toDictTypeListItem(row, row._count.items))
      return c.json({ code: 0, data: { list, total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/dicts/types",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.dictCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: dictTypeCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回列表项，itemCount 恒 0）", ...okBody(dictTypeListItemSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "类型编码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { typeCode, nameZh, nameEn, description, sort, status } = c.req.valid("json")
      // typeCode 统一小写存储（程序引用键，与大小写输入解耦）；exactOptionalPropertyTypes：undefined 不传
      const data: Prisma.DictTypeCreateInput = { typeCode: typeCode.toLowerCase(), nameZh, sort }
      if (nameEn !== undefined) data.nameEn = nameEn
      if (description !== undefined) data.description = description
      if (status !== undefined) data.status = status
      try {
        const type = await prisma.dictType.create({ data })
        return c.json({ code: 0, data: toDictTypeListItem(type, 0), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, DICT_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/dicts/types/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.dictQuery)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "字典类型详情（含字典项）", ...okBody(dictTypeDetailSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "字典类型不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      return c.json({ code: 0, data: toDictTypeDetail(await fetchDictTypeDetail(id)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/dicts/types/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.dictUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: dictTypeUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(dictTypeDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "字典类型不存在", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "类型编码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      await fetchDictTypeExists(id)
      const data: Prisma.DictTypeUpdateInput = {}
      if (fields.nameZh !== undefined) data.nameZh = fields.nameZh
      if (fields.nameEn !== undefined) data.nameEn = fields.nameEn
      if (fields.description !== undefined) data.description = fields.description
      if (fields.sort !== undefined) data.sort = fields.sort
      if (fields.status !== undefined) data.status = fields.status
      // typeCode 统一小写存储（与创建一致，大小写变体同样命中唯一约束）
      if (fields.typeCode !== undefined) data.typeCode = fields.typeCode.toLowerCase()
      try {
        await prisma.dictType.update({ where: { id }, data })
      } catch (err) {
        const hit = p2002Conflict(err, DICT_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
      return c.json({ code: 0, data: toDictTypeDetail(await fetchDictTypeDetail(id)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/dicts/types/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.dictDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功（字典项级联删除）", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "字典类型不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      // 存在性检查只需主键；DictItem 由 Prisma 级联清理
      const target = await prisma.dictType.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("字典类型不存在")
      await prisma.dictType.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/dicts/types/{id}/items",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.dictUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: dictItemsPutSchema } } } },
      responses: {
        200: { description: "保存成功（全量替换字典项）", ...okBody(z.null()) },
        400: { description: "参数错误（含空值/重复值）", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "字典类型不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const { items } = c.req.valid("json")
      await replaceDictItems(id, items)
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/dicts/types/{typeCode}/options",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.dictQuery)],
      security: bearerSecurity,
      request: { params: typeCodeParamSchema },
      responses: {
        200: { description: "字典选项列表（仅启用项，按 sort 升序；供下拉/程序引用）", ...okBody(z.array(dictOptionSchema)) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "字典类型不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { typeCode } = c.req.valid("param")
      const type = await prisma.dictType.findUnique({ where: { typeCode }, select: { id: true } })
      if (!type) throw notFound("字典类型不存在")
      const items = await prisma.dictItem.findMany({
        where: { typeId: type.id, status: true },
        orderBy: { sort: "asc" },
      })
      const data = items.map((item) => ({ value: item.value, labelZh: item.labelZh, labelEn: item.labelEn, sort: item.sort }))
      return c.json({ code: 0, data, message: "ok" }, 200)
    },
  )

  return app
}
