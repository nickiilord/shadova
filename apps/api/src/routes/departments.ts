import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { collectSubtreeIds } from "@repo/shared"
import { prisma } from "@repo/db"
import { badRequest, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { departmentItemSchema, departmentListSchema, errorBodySchema, idParamSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

const departmentCreateSchema = z.object({
  nameZh: z.string().min(1).max(64),
  nameEn: z.string().max(64).nullable().optional(),
  parentId: z.string().nullable().optional(),
  sort: z.number().int().optional(),
  status: z.boolean().optional(),
})

// 全部字段可选（改谁传谁）；parentId 显式传 null 表示移到根级（undefined 不修改）
const departmentUpdateSchema = departmentCreateSchema.partial().extend({
  parentId: z.string().nullable().optional(),
})

/** 收集 id 的全部后代 id（含自身；编辑时防循环挂载用） */
/** 部门详情（含用户数）；不存在 → 404 */
async function fetchDepartment(id: string) {
  const department = await prisma.department.findUnique({ where: { id } })
  if (!department) throw notFound("部门不存在")
  return department
}

type Department = Awaited<ReturnType<typeof fetchDepartment>>

/** 部门 → 列表项（userCount 由调用方按 id 映射注入） */
function toDepartmentItem(department: Department, userCounts: Map<string, number>) {
  return {
    id: department.id,
    parentId: department.parentId,
    nameZh: department.nameZh,
    nameEn: department.nameEn,
    sort: department.sort,
    status: department.status,
    userCount: userCounts.get(department.id) ?? 0,
    createdAt: department.createdAt.toISOString(),
  }
}

export function departmentRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/departments",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.departmentQuery)],
      security: bearerSecurity,
      responses: {
        200: { description: "部门全量列表（扁平，前端建树）", ...okBody(departmentListSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const [departments, userGroups] = await Promise.all([
        prisma.department.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
        prisma.user.groupBy({ by: ["departmentId"], _count: { _all: true } }),
      ])
      const userCounts = new Map<string, number>()
      for (const group of userGroups) {
        if (group.departmentId !== null) userCounts.set(group.departmentId, group._count._all)
      }
      return c.json({ code: 0, data: departments.map((d) => toDepartmentItem(d, userCounts)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/departments",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.departmentCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: departmentCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回列表项）", ...okBody(departmentItemSchema) },
        400: { description: "参数错误/上级部门不存在", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { nameZh, nameEn, parentId, sort, status } = c.req.valid("json")
      if (parentId !== null && parentId !== undefined) {
        const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { id: true } })
        if (!parent) throw badRequest("上级部门不存在")
      }
      const data: Prisma.DepartmentCreateInput = { nameZh }
      // exactOptionalPropertyTypes：undefined 不传；parent 为关系连接（parentId 属 Unchecked 变体）
      if (nameEn !== undefined) data.nameEn = nameEn
      if (parentId !== undefined && parentId !== null) data.parent = { connect: { id: parentId } }
      if (sort !== undefined) data.sort = sort
      if (status !== undefined) data.status = status
      const created = await prisma.department.create({ data })
      return c.json({ code: 0, data: toDepartmentItem(created, new Map()), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/departments/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.departmentUpdate)],
      security: bearerSecurity,
      request: {
        params: idParamSchema,
        body: { content: { "application/json": { schema: departmentUpdateSchema } } },
      },
      responses: {
        200: { description: "更新成功（返回列表项）", ...okBody(departmentItemSchema) },
        400: { description: "参数错误/上级部门不存在/挂到自身或后代", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "部门不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      await fetchDepartment(id)
      if (fields.parentId !== undefined && fields.parentId !== null) {
        const all = await prisma.department.findMany({ select: { id: true, parentId: true } })
        // 先查循环（挂到自身或后代），再查存在性——子树内 id 必然存在于 all，顺序不可颠倒
        if (collectSubtreeIds(all, id).has(fields.parentId)) throw badRequest("不能将部门挂到自身或后代")
        if (!all.some((d) => d.id === fields.parentId)) throw badRequest("上级部门不存在")
      }
      const data: Prisma.DepartmentUpdateInput = {}
      if (fields.nameZh !== undefined) data.nameZh = fields.nameZh
      if (fields.nameEn !== undefined) data.nameEn = fields.nameEn
      // parentId：undefined 不修改、null 断开连接（移到根级）、id 连接（DepartmentUpdateInput 关系型语法）
      if (fields.parentId !== undefined) {
        data.parent = fields.parentId === null ? { disconnect: true } : { connect: { id: fields.parentId } }
      }
      if (fields.sort !== undefined) data.sort = fields.sort
      if (fields.status !== undefined) data.status = fields.status
      const updated = await prisma.department.update({ where: { id }, data })
      return c.json({ code: 0, data: toDepartmentItem(updated, new Map()), message: "ok" }, 200)
    },
  )

  // 删除部门：级联删除子树（FK Cascade），部门内用户 departmentId 置空（FK SetNull，不删用户）
  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/departments/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.departmentDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功（含子树；部门内用户保留并置空部门）", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "部门不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const target = await prisma.department.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("部门不存在")
      await prisma.department.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
