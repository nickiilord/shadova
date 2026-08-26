import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { HttpError, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { p2002Conflict } from "../lib/prisma-error.js"
import { errorBodySchema, idParamSchema, roleDetailSchema, roleListItemSchema, rolePageResultSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"
import { replaceRoleMenus } from "../services/role-service.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

const roleCreateSchema = z.object({
  nameZh: z.string().min(1).max(64),
  nameEn: z.string().max(64).nullable().optional(),
  code: z.string().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().max(255).optional(),
  sort: z.number().int().default(0),
  status: z.boolean().optional(),
})

// 全部字段可选（改谁传谁）；description 显式传 null 表示清空（undefined 不修改），与 users email 清空语义对称
const roleUpdateSchema = roleCreateSchema.partial().extend({
  description: z.string().max(255).nullable().optional(),
})

// 授权全量提交的菜单 id 数组；上限 500 防超大 payload（菜单树规模远小于此）
const menuIdsSchema = z.object({ menuIds: z.array(z.string()).max(500) })

/** P2002 字段 → 409 code+message 映射（create/PATCH 共用；code 统一大写存储，大小写变体同样命中唯一约束） */
const ROLE_UNIQUE_FIELDS = {
  code: { code: "ROLE_CODE_TAKEN", message: "角色编码已存在" },
} as const

/** 角色详情；不存在 → 404 */
async function fetchRoleDetail(id: string) {
  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) throw notFound("角色不存在")
  return role
}

type RoleDetail = Awaited<ReturnType<typeof fetchRoleDetail>>

function toRoleDetail(role: RoleDetail) {
  return {
    id: role.id,
    nameZh: role.nameZh,
    nameEn: role.nameEn,
    code: role.code,
    description: role.description,
    sort: role.sort,
    status: role.status,
    createdAt: role.createdAt,
  }
}

export function roleRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "角色分页列表", ...okBody(rolePageResultSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { page, pageSize, keyword } = c.req.valid("query")
      // keyword contains 三方言决策：SQLite/MySQL 转 LIKE（ASCII 大小写不敏感），PG 下大小写敏感
      // （Prisma mode:insensitive 仅 PG 可用）；LIKE 通配符 %/_ 不转义——管理端模糊搜索接受此行为，不做额外归一
      const where = keyword
        ? {
            OR: [
              { nameZh: { contains: keyword } },
              { code: { contains: keyword } },
            ],
          }
        : {}
      const [list, total] = await Promise.all([
        prisma.role.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { sort: "asc" },
        }),
        prisma.role.count({ where }),
      ])
      return c.json({ code: 0, data: { list: list.map(toRoleDetail), total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles/list",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleQuery)],
      security: bearerSecurity,
      responses: {
        200: { description: "角色全量列表（下拉/分配用，无分页）", ...okBody(z.array(roleListItemSchema)) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const list = await prisma.role.findMany({ orderBy: { sort: "asc" } })
      return c.json({ code: 0, data: list.map(toRoleDetail), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/roles",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: roleCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(roleDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "角色编码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { nameZh, nameEn, code, description, sort, status } = c.req.valid("json")
      // code 统一大写存储（程序判断用编码，与大小写输入解耦）；exactOptionalPropertyTypes：undefined 不传
      const data: Prisma.RoleCreateInput = { nameZh, code: code.toUpperCase(), sort }
      if (nameEn !== undefined) data.nameEn = nameEn
      if (description !== undefined) data.description = description
      if (status !== undefined) data.status = status
      try {
        const role = await prisma.role.create({ data })
        return c.json({ code: 0, data: toRoleDetail(role), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, ROLE_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleQuery)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "角色详情", ...okBody(roleDetailSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      return c.json({ code: 0, data: toRoleDetail(await fetchRoleDetail(id)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/roles/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: roleUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(roleDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "角色编码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      await fetchRoleDetail(id)
      const data: Prisma.RoleUpdateInput = {}
      if (fields.nameZh !== undefined) data.nameZh = fields.nameZh
      if (fields.nameEn !== undefined) data.nameEn = fields.nameEn
      if (fields.code !== undefined) data.code = fields.code.toUpperCase()
      if (fields.description !== undefined) data.description = fields.description
      if (fields.sort !== undefined) data.sort = fields.sort
      if (fields.status !== undefined) data.status = fields.status
      try {
        const role = await prisma.role.update({ where: { id }, data })
        return c.json({ code: 0, data: toRoleDetail(role), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, ROLE_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/roles/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      // 存在性检查只需主键（select id）；UserRole/RoleMenu 由 Prisma 级联清理
      const target = await prisma.role.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("角色不存在")
      await prisma.role.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/roles/{id}/menus",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleQuery)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "已授权菜单 id 数组（树形勾选回显，含按钮节点）", ...okBody(menuIdsSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const role = await prisma.role.findUnique({ where: { id }, select: { id: true } })
      if (!role) throw notFound("角色不存在")
      // orderBy menuId 保证回显顺序确定（树形勾选回显需要稳定顺序）
      const rows = await prisma.roleMenu.findMany({
        where: { roleId: id },
        select: { menuId: true },
        orderBy: { menuId: "asc" },
      })
      return c.json({ code: 0, data: { menuIds: rows.map((r) => r.menuId) }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/roles/{id}/menus",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.roleAssign)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: menuIdsSchema } } } },
      responses: {
        200: { description: "授权成功（全量替换，允许含按钮节点）", ...okBody(z.null()) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "角色不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const { menuIds } = c.req.valid("json")
      await fetchRoleDetail(id)
      // 统一交互式事务风格：校验（tx.menu.count，resolveMenuIds 模式）+ 全量替换同一事务内
      await replaceRoleMenus(id, menuIds)
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
