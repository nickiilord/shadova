import { createRoute, z } from "@hono/zod-openapi"
import type { OpenAPIHono } from "@hono/zod-openapi"
import type { Prisma } from "@repo/db"
import { PERMISSIONS } from "@repo/shared"
import { prisma } from "@repo/db"
import { HttpError, badRequest, notFound } from "../lib/http-error.js"
import type { AppConfig } from "../config.js"
import { bearerSecurity, createSubApp, okBody } from "../lib/openapi.js"
import { hashPassword } from "@repo/db"
import { p2002Conflict } from "../lib/prisma-error.js"
import { errorBodySchema, idParamSchema, importResultSchema, userDetailSchema, userPageResultSchema } from "../lib/schemas.js"
import { parseCsv, toCsv } from "../lib/csv.js"
import { authenticate, requirePermission } from "../middleware/auth.js"
import { getUserDetail, toUserDetail } from "../services/user-service.js"

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().optional(),
})

const userCreateSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(128),
  nickname: z.string().min(1).max(64),
  email: z.string().email().optional(),
  telephone: z.string().min(5).max(32).optional(),
  departmentId: z.string().nullable().optional(),
  roleIds: z.array(z.string()).optional(),
})

// 全部字段可选（改谁传谁）；status 仅更新时可用；email/telephone 显式传 null 表示清空（undefined 不修改）
const userUpdateSchema = userCreateSchema
  .partial()
  .extend({
    status: z.boolean().optional(),
    email: z.string().email().nullable().optional(),
    telephone: z.string().min(5).max(32).nullable().optional(),
  })

const roleIdsSchema = z.object({ roleIds: z.array(z.string()) })

// 个人资料更新（/users/me）：昵称/邮箱/手机号/头像；null 清空、undefined 不修改
// avatar 为上传接口返回的服务端文件名（uuid.ext），白名单校验防手写路径
const meUpdateSchema = z.object({
  nickname: z.string().min(1).max(64).optional(),
  email: z.string().email().nullable().optional(),
  telephone: z.string().min(5).max(32).nullable().optional(),
  avatar: z.string().regex(/^[a-zA-Z0-9-]+\.(jpg|png|webp|gif)$/).nullable().optional(),
})

/** P2002 字段 → 409 code+message 映射（create/PATCH 共用）；code 为 API 契约（前端 errors 命名空间映射） */
const USER_UNIQUE_FIELDS = {
  username: { code: "USERNAME_TAKEN", message: "用户名已存在" },
  email: { code: "EMAIL_TAKEN", message: "邮箱已被使用" },
  telephone: { code: "PHONE_TAKEN", message: "手机号已被使用" },
} as const

// CSV 导入导出（模板与导出文件同构，导出文件填上密码即可重新导入）：
// 列顺序固定，前 5 列为导入必读列（与 userCreateSchema 校验规则同步），多余列导入时忽略
const CSV_HEADERS = ["用户名", "密码", "昵称", "邮箱", "手机号", "状态", "角色"] as const
const CSV_REQUIRED_COLUMNS = CSV_HEADERS.slice(0, 5) as readonly string[]
const MAX_IMPORT_ROWS = 200
const MAX_IMPORT_FILE_SIZE = 1024 * 1024 // 1MB

/** 导入行校验（规则与 userCreateSchema 同步，文案中文化；返回错误信息或 null） */
function validateImportRow(username: string, password: string, nickname: string, email?: string, telephone?: string): string | null {
  if (!/^[a-zA-Z0-9_.-]{2,64}$/.test(username)) return "用户名需为 2-64 位字母/数字/下划线/点/连字符"
  if (password.length < 8 || password.length > 128) return "密码长度需为 8-128 位"
  if (nickname.length < 1 || nickname.length > 64) return "昵称需为 1-64 个字符"
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "邮箱格式不正确"
  if (telephone !== undefined && (telephone.length < 5 || telephone.length > 32)) return "手机号长度需为 5-32 位"
  return null
}

/**
 * 解析导入 CSV 文本并逐行创建用户（部分失败不中断，失败行收集明细）：
 * 表头校验（前 5 列必须与模板一致，多余列忽略）→ 空行跳过 → 每行独立校验/落库。
 * 返回成功条数与失败行列表（row 为 CSV 行号，1 为表头）。
 */
async function importUsersFromCsv(text: string): Promise<{ successCount: number; failedRows: { row: number; message: string }[] }> {
  const rows = parseCsv(text)
  if (rows.length === 0) throw badRequest("CSV 内容为空")
  const header = rows[0]?.map((cell) => cell.trim()) ?? []
  const requiredHeader = header.slice(0, 5)
  if (requiredHeader.length !== 5 || requiredHeader.some((h, i) => h !== CSV_REQUIRED_COLUMNS[i])) {
    throw badRequest(`CSV 表头必须为：${CSV_REQUIRED_COLUMNS.join(",")}`)
  }
  const dataRows = rows.slice(1)
  if (dataRows.length === 0) throw badRequest("CSV 没有数据行")
  if (dataRows.length > MAX_IMPORT_ROWS) throw badRequest(`单次最多导入 ${String(MAX_IMPORT_ROWS)} 行`)

  const failedRows: { row: number; message: string }[] = []
  let successCount = 0
  for (const [index, raw] of dataRows.entries()) {
    const rowNumber = index + 2 // 表头占第 1 行
    if (raw.every((cell) => cell.trim() === "")) continue // 空行跳过
    const [usernameRaw, passwordRaw, nicknameRaw, emailRaw, telephoneRaw] = raw
    const username = (usernameRaw ?? "").trim()
    const password = passwordRaw ?? ""
    const nickname = (nicknameRaw ?? "").trim()
    const email = (emailRaw ?? "").trim()
    const telephone = (telephoneRaw ?? "").trim()
    const message = validateImportRow(username, password, nickname, email || undefined, telephone || undefined)
    if (message !== null) {
      failedRows.push({ row: rowNumber, message })
      continue
    }
    try {
      const passwordHash = await hashPassword(password)
      const data: Prisma.UserCreateInput = { username: username.toLowerCase(), passwordHash, nickname }
      if (email !== "") data.email = email.toLowerCase()
      if (telephone !== "") data.telephone = telephone
      await prisma.user.create({ data })
      successCount += 1
    } catch (err) {
      const hit = p2002Conflict(err, USER_UNIQUE_FIELDS)
      failedRows.push({ row: rowNumber, message: hit !== null ? hit.message : "创建失败" })
    }
  }
  return { successCount, failedRows }
}

/** 角色存在性校验 + 去重（不存在 → 400）；事务内调用，保证校验与写入原子（须在 $transaction 回调中使用 tx） */
async function resolveRoleIds(tx: Prisma.TransactionClient, roleIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(roleIds))
  if (unique.length === 0) return unique
  const count = await tx.role.count({ where: { id: { in: unique } } })
  if (count !== unique.length) throw badRequest("角色不存在")
  return unique
}

/** 用户详情（含已挂角色与部门名）；不存在 → 404 */

export function userRoutes(cfg: AppConfig): OpenAPIHono {
  const app = createSubApp()

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/users",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userQuery)],
      security: bearerSecurity,
      request: { query: pageQuery },
      responses: {
        200: { description: "用户分页列表", ...okBody(userPageResultSchema) },
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
              { username: { contains: keyword } },
              { nickname: { contains: keyword } },
              { email: { contains: keyword } },
              { telephone: { contains: keyword } },
            ],
          }
        : {}
      const [list, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          include: { roles: { include: { role: true } }, department: { select: { id: true, nameZh: true, nameEn: true } } },
        }),
        prisma.user.count({ where }),
      ])
      return c.json({ code: 0, data: { list: list.map(toUserDetail), total }, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/users",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userCreate)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: userCreateSchema } } } },
      responses: {
        200: { description: "创建成功（返回详情）", ...okBody(userDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "用户名/邮箱/手机号已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { username, password, nickname, email, telephone, departmentId, roleIds } = c.req.valid("json")
      const passwordHash = await hashPassword(password)
      const data: Prisma.UserCreateInput = { username: username.toLowerCase(), passwordHash, nickname }
      // exactOptionalPropertyTypes：undefined 不传；username/email 统一小写存储
      if (email) data.email = email.toLowerCase()
      if (telephone) data.telephone = telephone
      if (departmentId !== undefined && departmentId !== null) {
        const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } })
        if (!dept) throw badRequest("部门不存在")
        // UserCreateInput 为关系型：外键 scalar（departmentId）在 Unchecked 变体，此处用嵌套连接
        data.department = { connect: { id: departmentId } }
      }
      try {
        const user = await prisma.$transaction(async (tx) => {
          const roles = roleIds ? await resolveRoleIds(tx, roleIds) : []
          const created = await tx.user.create({ data })
          if (roles.length > 0) {
            await tx.userRole.createMany({ data: roles.map((roleId) => ({ userId: created.id, roleId })) })
          }
          return created
        })
        return c.json({ code: 0, data: toUserDetail(await getUserDetail(user.id)), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, USER_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  // 用户 CSV 导出（keyword 过滤与列表一致；响应为 text/csv，非 JSON 契约体）。
  // 路径字面量 export 必须注册在 /users/{id} 之前（Hono 顺序匹配，否则被 {id} 捕获 → 404）
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/users/export",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userQuery)],
      security: bearerSecurity,
      request: { query: z.object({ keyword: z.string().optional() }) },
      responses: {
        200: {
          description: "用户 CSV（UTF-8 BOM；与导入模板同构，密码列为空）",
          content: { "text/csv; charset=utf-8": { schema: z.string() } },
        },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { keyword } = c.req.valid("query")
      const where = keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { nickname: { contains: keyword } },
              { email: { contains: keyword } },
              { telephone: { contains: keyword } },
            ],
          }
        : {}
      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { roles: { include: { role: true } } },
      })
      const rows = [
        [...CSV_HEADERS],
        ...users.map((user) => [
          user.username,
          "",
          user.nickname,
          user.email ?? "",
          user.telephone ?? "",
          user.status ? "启用" : "禁用",
          user.roles.map((r) => r.role.nameZh).join(";"),
        ]),
      ]
      // UTF-8 BOM：Excel 打开中文不乱码（\uFEFF 显式转义，字面 BOM 字符会被编译器剥离）
      return c.body(`\uFEFF${toCsv(rows)}`, 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="users.csv"',
      })
    },
  )

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/users/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userQuery)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "用户详情（含已挂角色）", ...okBody(userDetailSchema) },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      return c.json({ code: 0, data: toUserDetail(await getUserDetail(id)), message: "ok" }, 200)
    },
  )

  // 个人资料（自己改自己）：仅 nickname/email/telephone——username/status/角色等由管理员管理。
  // 路径字面量 me 必须注册在 /users/{id} 之前（Hono 顺序匹配）
  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/users/me",
      middleware: [authenticate(cfg)],
      security: bearerSecurity,
      request: { body: { content: { "application/json": { schema: meUpdateSchema } } } },
      responses: {
        200: { description: "更新成功", ...okBody(userDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "邮箱/手机号已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const userId = c.get("userId")
      const { nickname, email, telephone, avatar } = c.req.valid("json")
      const data: Prisma.UserUpdateInput = {}
      if (nickname !== undefined) data.nickname = nickname
      // exactOptionalPropertyTypes 分派：undefined 不修改、null 显式清空、string 小写写入
      if (email !== undefined) data.email = email === null ? null : email.toLowerCase()
      if (telephone !== undefined) data.telephone = telephone
      if (avatar !== undefined) data.avatar = avatar
      try {
        await prisma.user.update({ where: { id: userId }, data })
        return c.json({ code: 0, data: toUserDetail(await getUserDetail(userId)), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, USER_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/users/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userUpdate)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: userUpdateSchema } } } },
      responses: {
        200: { description: "更新成功（返回详情）", ...okBody(userDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
        409: { description: "用户名/邮箱/手机号已存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const { roleIds, password, ...fields } = c.req.valid("json")
      await getUserDetail(id)
      const data: Prisma.UserUpdateInput = {}
      if (fields.username !== undefined) data.username = fields.username.toLowerCase()
      if (fields.nickname !== undefined) data.nickname = fields.nickname
      // exactOptionalPropertyTypes 分派：undefined 不修改、null 显式清空、string 小写写入
      if (fields.email !== undefined) data.email = fields.email === null ? null : fields.email.toLowerCase()
      if (fields.telephone !== undefined) data.telephone = fields.telephone
      if (fields.status !== undefined) data.status = fields.status
      // 部门：undefined 不修改、null 断开连接、id 校验存在后连接（UserUpdateInput 关系型语法）
      if (fields.departmentId !== undefined) {
        if (fields.departmentId !== null) {
          const dept = await prisma.department.findUnique({ where: { id: fields.departmentId }, select: { id: true } })
          if (!dept) throw badRequest("部门不存在")
          data.department = { connect: { id: fields.departmentId } }
        } else {
          data.department = { disconnect: true }
        }
      }
      if (password !== undefined) data.passwordHash = await hashPassword(password)
      try {
        if (roleIds !== undefined) {
          await prisma.$transaction(async (tx) => {
            const roles = await resolveRoleIds(tx, roleIds)
            await tx.user.update({ where: { id }, data })
            await tx.userRole.deleteMany({ where: { userId: id } })
            if (roles.length > 0) {
              await tx.userRole.createMany({ data: roles.map((roleId) => ({ userId: id, roleId })) })
            }
          })
        } else {
          await prisma.user.update({ where: { id }, data })
        }
        return c.json({ code: 0, data: toUserDetail(await getUserDetail(id)), message: "ok" }, 200)
      } catch (err) {
        const hit = p2002Conflict(err, USER_UNIQUE_FIELDS)
        if (hit !== null) throw new HttpError(409, hit.code, hit.message)
        throw err
      }
    },
  )

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/users/{id}",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userDelete)],
      security: bearerSecurity,
      request: { params: idParamSchema },
      responses: {
        200: { description: "删除成功", ...okBody(z.null()) },
        400: { description: "不能删除自己", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      // 存在性检查只需主键（select id），不需要 roles include
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true } })
      if (!target) throw notFound("用户不存在")
      if (id === c.get("userId")) throw new HttpError(400, "SELF_DELETE", "不能删除自己")
      await prisma.user.delete({ where: { id } })
      return c.json({ code: 0, data: null, message: "ok" }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/users/{id}/roles",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userAssignRole)],
      security: bearerSecurity,
      request: { params: idParamSchema, body: { content: { "application/json": { schema: roleIdsSchema } } } },
      responses: {
        200: { description: "分配成功（返回详情）", ...okBody(userDetailSchema) },
        400: { description: "参数错误", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
        404: { description: "用户不存在", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param")
      const { roleIds } = c.req.valid("json")
      await getUserDetail(id)
      // 统一交互式事务风格：校验（tx.role.count）+ 全量替换同一事务内
      await prisma.$transaction(async (tx) => {
        const roles = await resolveRoleIds(tx, roleIds)
        await tx.userRole.deleteMany({ where: { userId: id } })
        if (roles.length > 0) {
          await tx.userRole.createMany({ data: roles.map((roleId) => ({ userId: id, roleId })) })
        }
      })
      return c.json({ code: 0, data: toUserDetail(await getUserDetail(id)), message: "ok" }, 200)
    },
  )

  // 用户 CSV 导入（multipart 文件上传；逐行创建，部分失败不中断，返回成功/失败明细）
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/users/import",
      middleware: [authenticate(cfg), requirePermission(PERMISSIONS.userCreate)],
      security: bearerSecurity,
      request: {
        body: {
          content: {
            "multipart/form-data": {
              schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }),
            },
          },
        },
      },
      responses: {
        200: { description: "导入完成（含失败行明细）", ...okBody(importResultSchema) },
        400: { description: "CSV 格式/表头/大小不合法", content: { "application/json": { schema: errorBodySchema } } },
        401: { description: "未登录", content: { "application/json": { schema: errorBodySchema } } },
        403: { description: "无权限", content: { "application/json": { schema: errorBodySchema } } },
      },
    }),
    async (c) => {
      const body = await c.req.parseBody()
      const file = body.file
      if (!(file instanceof File)) throw badRequest("请上传 CSV 文件")
      if (file.size > MAX_IMPORT_FILE_SIZE) throw badRequest("文件大小不能超过 1MB")
      const result = await importUsersFromCsv(await file.text())
      return c.json({ code: 0, data: result, message: "ok" }, 200)
    },
  )

  return app
}
