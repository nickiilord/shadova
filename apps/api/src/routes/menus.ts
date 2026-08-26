import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Menu, Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import type { MenuNode, MenuType } from "@repo/shared"
import { buildTree } from "@repo/shared"
import { HttpError, badRequest, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { p2002Conflict } from "../lib/prisma-error.js"
import { errorBodySchema, idParamSchema, menuNodeRefSchema, menuTypeSchema } from "../lib/schemas.js"
import { authenticate, requirePermission } from "../middleware/auth.js"

// 字段级限制：path/component/icon/permission 可显式传 null（清空/无值）；min(1) 拒绝空串（"" 会与真实值撞 permission 唯一索引）
const menuFieldShape = {
  nameZh: z.string().min(1).max(64),
  nameEn: z.string().max(64).nullable().optional(),
  type: z.enum(["DIR", "MENU", "BUTTON"]),
  parentId: z.string().nullable().optional(),
  path: z.string().min(1).nullable().optional(),
  component: z.string().min(1).nullable().optional(),
  icon: z.string().min(1).nullable().optional(),
  permission: z.string().min(1).nullable().optional(),
  sort: z.number().int(),
  status: z.boolean().optional(),
}
const menuCreateSchema = z
  .object({ ...menuFieldShape, sort: z.number().int().default(0) })
  .superRefine((value, ctx) => {
    // type 条件校验放 schema（400 自动）：MENU 必填 path/component；BUTTON 不允许 path/component
    const message = validateMenuState({
      type: value.type,
      path: value.path ?? null,
      component: value.component ?? null,
    })
    if (message !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["type"] })
  })

// 全部字段可选（改谁传谁）；parentId/path/component/icon/permission 显式传 null 表示清空（undefined 不修改）
const menuUpdateSchema = z.object(menuFieldShape).partial()

/** P2002 字段 → 409 code+message 映射（create/PATCH 共用；permission 可空 unique，null 不冲突） */
const MENU_UNIQUE_FIELDS = {
  permission: { code: "MENU_PERMISSION_TAKEN", message: "权限码已存在" },
} as const

/**
 * MENU 必填 path/component、BUTTON 禁止 path/component。
 * 入参为合并后的有效状态（create 直接取 body；PATCH 为请求字段与现有记录的合并），null 视为无值。
 */
function validateMenuState(state: { type: MenuType; path: string | null; component: string | null }): string | null {
  if (state.type === "MENU") {
    if (state.path === null || state.component === null) return "MENU 类型必须填写 path 和 component"
  }
  if (state.type === "BUTTON") {
    if (state.path !== null || state.component !== null) return "BUTTON 类型不允许填写 path 和 component"
  }
  return null
}

/**
 * 父子类型约束（设计文档 §4）：DIR → DIR/MENU；MENU → BUTTON；BUTTON → 无子级。
 * 根（parent 为 null）可为 DIR/MENU（Dashboard 是 MENU 根）；BUTTON 不能是根。
 */
function canAttachTo(parent: { type: string } | null, type: MenuType): boolean {
  if (parent === null) return type !== "BUTTON"
  if (parent.type === "DIR") return type === "DIR" || type === "MENU"
  if (parent.type === "MENU") return type === "BUTTON"
  return false
}

/** 收集节点全部子孙 id（内存 DFS：单次全量取回 id/parentId 后遍历；菜单数据量小，不用递归 CTE——设计文档 §11） */
async function collectSubtreeIds(id: string): Promise<Set<string>> {
  const all = await prisma.menu.findMany({ select: { id: true, parentId: true } })
  const childrenByParent = new Map<string, string[]>()
  for (const menu of all) {
    if (menu.parentId !== null) {
      const siblings = childrenByParent.get(menu.parentId)
      if (siblings !== undefined) siblings.push(menu.id)
      else childrenByParent.set(menu.parentId, [menu.id])
    }
  }
  const ids = new Set<string>()
  let current: string | undefined = id
  const stack: string[] = []
  while (current !== undefined) {
    for (const child of childrenByParent.get(current) ?? []) {
      // visited 守卫：节点已入集合即跳过（防脏数据环导致死循环）
      if (ids.has(child)) continue
      ids.add(child)
      stack.push(child)
    }
    current = stack.pop()
  }
  return ids
}

/** Prisma Menu → MenuNode（children 置空，buildTree 组装） */
function toMenuNode(menu: Menu): MenuNode {
  return {
    id: menu.id,
    parentId: menu.parentId,
    nameZh: menu.nameZh,
    nameEn: menu.nameEn,
    type: menuTypeSchema.parse(menu.type),
    path: menu.path,
    component: menu.component,
    icon: menu.icon,
    permission: menu.permission,
    sort: menu.sort,
    status: menu.status,
    children: [],
  }
}

/** 菜单详情；不存在 → 404 */
async function fetchMenuDetail(id: string) {
  const menu = await prisma.menu.findUnique({ where: { id } })
  if (!menu) throw notFound("菜单不存在")
  return menu
}

export function menuRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/menus/tree",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.menuQuery)],
      security: bearerSecurity,
      responses: {
        200: { description: "全量菜单树（含按钮，管理页用）", ...okBody(z.array(menuNodeRefSchema)) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const menus = await prisma.menu.findMany({ orderBy: { sort: "asc" } })
      return c.json({ code: 0, data: buildTree(menus.map(toMenuNode)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/menus",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.menuCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: menuCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(menuNodeRefSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "权限码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { nameZh, nameEn, type, parentId, path, component, icon, permission, sort, status } = c.req.valid("json")
      // 挂载校验：无父（null/未传）→ 根约束；有父 → 存在性 + 类型约束
      const parent =
        parentId !== undefined && parentId !== null
          ? await prisma.menu.findUnique({ where: { id: parentId }, select: { type: true } })
          : null
      if (parentId !== undefined && parentId !== null && parent === null) throw badRequest("父菜单不存在")
      if (!canAttachTo(parent, type)) throw new HttpError(400, "MENU_TYPE_INVALID", "菜单类型与父节点不匹配")
      const data: Prisma.MenuUncheckedCreateInput = { nameZh, type, sort }
      // exactOptionalPropertyTypes：undefined 不传；null 显式存 NULL（根/清空）
      if (nameEn !== undefined) data.nameEn = nameEn
      if (parentId !== undefined) data.parentId = parentId
      if (path !== undefined) data.path = path
      if (component !== undefined) data.component = component
      if (icon !== undefined) data.icon = icon
      if (permission !== undefined) data.permission = permission
      if (status !== undefined) data.status = status
      try {
        const menu = await prisma.menu.create({ data })
        return c.json({ code: 0, data: toMenuNode(menu), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, MENU_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/menus/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.menuQuery)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "菜单详情", ...okBody(menuNodeRefSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "菜单不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      return c.json({ code: 0, data: toMenuNode(await fetchMenuDetail(id)), message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/menus/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.menuUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: menuUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(menuNodeRefSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "菜单不存在", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "权限码已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const fields = c.req.valid("json")
      const current = await fetchMenuDetail(id)
      // 有效状态 = 合并请求字段（undefined 沿用当前值、null 显式清空），整体过条件校验
      const effectiveType = menuTypeSchema.parse(fields.type ?? current.type)
      const stateError = validateMenuState({
        type: effectiveType,
        path: fields.path !== undefined ? fields.path : current.path,
        component: fields.component !== undefined ? fields.component : current.component,
      })
      if (stateError !== null) throw badRequest(stateError)
      // 父节点变化或类型变化时重新校验挂载关系（都不变则沿用既有合法状态）
      const parentChanged = fields.parentId !== undefined && fields.parentId !== current.parentId
      const typeChanged = fields.type !== undefined && fields.type !== current.type
      if (parentChanged || typeChanged) {
        const newParentId = fields.parentId !== undefined ? fields.parentId : current.parentId
        const parent =
          newParentId !== null ? await prisma.menu.findUnique({ where: { id: newParentId }, select: { type: true } }) : null
        if (newParentId !== null && parent === null) throw badRequest("父菜单不存在")
        if (!canAttachTo(parent, effectiveType)) throw new HttpError(400, "MENU_TYPE_INVALID", "菜单类型与父节点不匹配")
        // type 变化时校验直接子节点与新 type 兼容（矩阵不变式：改 type 不得破坏既有子树的挂载规则，否则要求先调整子节点）
        if (typeChanged) {
          const children = await prisma.menu.findMany({ where: { parentId: id }, select: { type: true } })
          for (const child of children) {
            if (!canAttachTo({ type: effectiveType }, menuTypeSchema.parse(child.type))) {
              throw new HttpError(400, "MENU_TYPE_INVALID", "菜单类型与子节点不兼容，请先调整子节点")
            }
          }
        }
        // 防自挂：不能挂到自己或自己的子孙（祖先链上沿 parentId 可达的集合）
        if (parentChanged) {
          if (newParentId === id) throw new HttpError(400, "MENU_TYPE_INVALID", "不能挂到自身")
          if (newParentId !== null && (await collectSubtreeIds(id)).has(newParentId)) {
            throw new HttpError(400, "MENU_TYPE_INVALID", "不能挂到自己的子节点")
          }
        }
      }
      const data: Prisma.MenuUncheckedUpdateInput = {}
      if (fields.nameZh !== undefined) data.nameZh = fields.nameZh
      if (fields.nameEn !== undefined) data.nameEn = fields.nameEn
      if (fields.type !== undefined) data.type = fields.type
      if (fields.parentId !== undefined) data.parentId = fields.parentId
      if (fields.path !== undefined) data.path = fields.path
      if (fields.component !== undefined) data.component = fields.component
      if (fields.icon !== undefined) data.icon = fields.icon
      if (fields.permission !== undefined) data.permission = fields.permission
      if (fields.sort !== undefined) data.sort = fields.sort
      if (fields.status !== undefined) data.status = fields.status
      try {
        const menu = await prisma.menu.update({ where: { id }, data })
        return c.json({ code: 0, data: toMenuNode(menu), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, MENU_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/menus/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.menuDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功（级联删除子树）", ...okBody(z.null()) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "菜单不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      // 存在性检查只需主键
      const target = await prisma.menu.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("菜单不存在")
      // 级联删除子树 + 清理 RoleMenu 关联（同一事务；Menu 自关联 onDelete Cascade 为 DB 层兜底）
      const subtreeIds = [...(await collectSubtreeIds(id)), id]
      await prisma.$transaction([
        prisma.menu.deleteMany({ where: { id: { in: subtreeIds } } }),
        prisma.roleMenu.deleteMany({ where: { menuId: { in: subtreeIds } } }),
      ])
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  return app
}
