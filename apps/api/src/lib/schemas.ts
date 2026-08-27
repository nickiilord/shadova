import { z } from "@hono/zod-openapi"
import type { User } from "@repo/db"
import type { MenuNode } from "@repo/shared"

/** OpenAPI 文档 info（index.ts app.doc 与 scripts/generate-openapi.ts 共用；version 与接口版本联动） */
export const API_INFO = { title: "Shadova API", version: "0.1.0" } as const

// 注：zod-to-openapi v7 的 refId 走位置参数 openapi("RefId")（v6 的 { refId } 对象形式已不再支持）
/** 公开用户信息（登录/me 等响应共用，Task 14 openapi-typescript 生成类型） */
export const publicUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    nickname: z.string(),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
    avatar: z.string().nullable(),
  })
  .openapi("UserPublic")

/** 双 token 对（登录/刷新响应共用） */
export const tokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .openapi("TokenPair")

/** 统一错误体（全部错误响应共享组件） */
export const errorBodySchema = z
  .object({
    code: z.string(),
    message: z.string(),
    // z.null() 默认序列化为 {nullable:true}（OAS 3.0 无 null 类型）→ openapi-typescript 生成 unknown；
    // enum:[null] 是 OAS 3.0 合法的 null 表达 → 生成精确的 null 类型（实证见 Task 14 实验）
    data: z.null().openapi({ enum: [null] }),
  })
  .openapi("ErrorBody")

/** 菜单类型校验收窄（Prisma Menu.type 为 string → MenuType；auth-info 与 menus 路由共用，禁止裸 as；脏数据抛 ZodError → onError 500） */
export const menuTypeSchema = z.enum(["DIR", "MENU", "BUTTON"])

/** {id} 路径参数（users/roles/menus 路由共用） */
export const idParamSchema = z.object({ id: z.string() })

/** 登录响应 data（tokenPair + user） */
export const loginResponseSchema = tokenPairSchema.extend({ user: publicUserSchema }).openapi("LoginResponse")

export type PublicUser = z.infer<typeof publicUserSchema>
export type TokenPair = z.infer<typeof tokenPairSchema>

/** 选 Prisma User 子集（字段均为非可选，避免 exactOptionalPropertyTypes 下 undefined 不可赋问题） */
export function toPublicUser(user: Pick<User, "id" | "username" | "nickname" | "email" | "telephone" | "avatar">): PublicUser {
  return { id: user.id, username: user.username, nickname: user.nickname, email: user.email, telephone: user.telephone, avatar: user.avatar }
}

/**
 * 递归 MenuNode schema（运行时校验 + 类型推断；schemas.test.ts 以真实 me 响应实测）。
 * 实证：zod-to-openapi v7（7.3.4）不支持 z.lazy —— 文档生成时抛 UnknownZodTypeError（typeName: ZodLazy）。
 * openapi.json 中的 MenuNode 组件由 index.ts 手工注册（见 createApp），me 响应用 menuNodeRefSchema 以 $ref 引用。
 */
export const menuNodeSchema: z.ZodType<MenuNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    parentId: z.string().nullable(),
    nameZh: z.string(),
    nameEn: z.string().nullable(),
    type: z.enum(["DIR", "MENU", "BUTTON"]),
    path: z.string().nullable(),
    component: z.string().nullable(),
    icon: z.string().nullable(),
    permission: z.string().nullable(),
    sort: z.number(),
    status: z.boolean(),
    children: z.array(menuNodeSchema),
  }),
)

/**
 * MenuNode 引用 schema（类型保持 MenuNode；文档中渲染为 $ref → 手工注册的 MenuNode 组件）。
 * 不能用 refId（z.any().openapi("MenuNode")）：v7 的 generateComponents 会把 schemaRefs 合并覆盖同名组件（实证：MenuNode 被污染为 {"nullable":true}）。
 * metadata.$ref 无 refId 不进 schemaRefs；类型层面 zod-openapi 的 metadata 类型不含 $ref 键，故 as never 绕过（运行时仅附加 $ref 键）。
 * 响应使用方：me navTree、menus 路由（tree/详情/create/update 复用同一组件）。
 */
export const menuNodeRefSchema: z.ZodType<MenuNode> = z.any().openapi({ $ref: "#/components/schemas/MenuNode" } as never)

/** zod-openapi 当前无法从 z.lazy 生成递归组件，统一维护唯一的 OAS 组件定义。 */
export const menuNodeOpenApiSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const },
    parentId: { type: "string" as const, nullable: true as const },
    nameZh: { type: "string" as const },
    nameEn: { type: "string" as const, nullable: true as const },
    type: { type: "string" as const, enum: ["DIR", "MENU", "BUTTON"] },
    path: { type: "string" as const, nullable: true as const },
    component: { type: "string" as const, nullable: true as const },
    icon: { type: "string" as const, nullable: true as const },
    permission: { type: "string" as const, nullable: true as const },
    sort: { type: "number" as const },
    status: { type: "boolean" as const },
    children: { type: "array" as const, items: { $ref: "#/components/schemas/MenuNode" } },
  },
  required: ["id", "parentId", "nameZh", "nameEn", "type", "path", "component", "icon", "permission", "sort", "status", "children"],
}

/** me 响应：user + roles + 交集 navTree + permissionCodes */
export const meResponseSchema = z
  .object({
    user: publicUserSchema,
    roles: z.array(z.object({ id: z.string(), nameZh: z.string(), nameEn: z.string().nullable(), code: z.string() })),
    navTree: z.array(menuNodeRefSchema),
    permissionCodes: z.array(z.string()),
  })
  .openapi("MeResponse")

/** 用户-角色简要信息（用户列表/详情响应共用） */
export const userRoleSchema = z
  .object({ id: z.string(), nameZh: z.string(), nameEn: z.string().nullable(), code: z.string() })
  .openapi("UserRole")

/** 用户列表项（分页列表 data.list 元素） */
export const userListItemSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    nickname: z.string(),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
    avatar: z.string().nullable(),
    /** 所属部门（双名，前端按语言选择展示；null=未分配） */
    department: z
      .object({ id: z.string(), nameZh: z.string(), nameEn: z.string().nullable() })
      .nullable(),
    status: z.boolean(),
    createdAt: z.string(),
    roles: z.array(userRoleSchema),
  })
  .openapi("UserListItem")

/** 用户详情（含已挂角色；结构同列表项） */
// v7 下对同一 schema 重复 .openapi 会覆盖 refId 元数据 → extend({}) 派生新实例再命名，保留 UserListItem/UserDetail 两个组件
export const userDetailSchema = userListItemSchema.extend({}).openapi("UserDetail")

/** 用户分页结果 */
export const userPageResultSchema = z
  .object({ list: z.array(userListItemSchema), total: z.number() })
  .openapi("UserPageResult")

/** 角色列表项（分页列表 data.list 元素 / 全量列表共用） */
export const roleListItemSchema = z
  .object({
    id: z.string(),
    nameZh: z.string(),
    nameEn: z.string().nullable(),
    code: z.string(),
    description: z.string().nullable(),
    sort: z.number(),
    status: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("RoleListItem")

/** 角色详情（结构同列表项） */
export const roleDetailSchema = roleListItemSchema.extend({}).openapi("RoleDetail")

/** 角色分页结果 */
export const rolePageResultSchema = z
  .object({ list: z.array(roleListItemSchema), total: z.number() })
  .openapi("RolePageResult")

/** 登录日志列表项（分页列表 data.list 元素；不含 userId 等内部字段） */
export const loginLogItemSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    status: z.string(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    message: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("LoginLogItem")

/** 登录日志分页结果 */
export const loginLogPageResultSchema = z
  .object({ list: z.array(loginLogItemSchema), total: z.number() })
  .openapi("LoginLogPageResult")

/** 操作日志列表项（分页列表 data.list 元素；不含 userId/userAgent 等内部字段） */
export const operationLogItemSchema = z
  .object({
    id: z.string(),
    username: z.string().nullable(),
    method: z.string(),
    path: z.string(),
    statusCode: z.number(),
    durationMs: z.number(),
    ip: z.string().nullable(),
    requestBody: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("OperationLogItem")

/** 操作日志分页结果 */
export const operationLogPageResultSchema = z
  .object({ list: z.array(operationLogItemSchema), total: z.number() })
  .openapi("OperationLogPageResult")

/** 会话列表项（在线会话 = 未吊销且未过期 refresh token；id 为 RefreshToken.id） */
export const sessionItemSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.string(),
    expiresAt: z.string(),
  })
  .openapi("SessionItem")

/** 会话分页结果 */
export const sessionPageResultSchema = z
  .object({ list: z.array(sessionItemSchema), total: z.number() })
  .openapi("SessionPageResult")

/** 字典项（字典类型详情 items 数组元素） */
export const dictItemSchema = z
  .object({
    id: z.string(),
    labelZh: z.string(),
    labelEn: z.string().nullable(),
    value: z.string(),
    sort: z.number(),
    status: z.boolean(),
  })
  .openapi("DictItem")

/** 字典类型列表项（分页列表 data.list 元素；itemCount 为该类型字典项总数） */
export const dictTypeListItemSchema = z
  .object({
    id: z.string(),
    typeCode: z.string(),
    nameZh: z.string(),
    nameEn: z.string().nullable(),
    description: z.string().nullable(),
    status: z.boolean(),
    sort: z.number(),
    itemCount: z.number(),
  })
  .openapi("DictTypeListItem")

/** 字典类型详情（含字典项数组，按 sort 升序） */
export const dictTypeDetailSchema = dictTypeListItemSchema
  .omit({ itemCount: true })
  .extend({ items: z.array(dictItemSchema) })
  .openapi("DictTypeDetail")

/** 字典类型分页结果 */
export const dictTypePageResultSchema = z
  .object({ list: z.array(dictTypeListItemSchema), total: z.number() })
  .openapi("DictTypePageResult")

/** 字典选项（GET /api/dicts/types/{typeCode}/options 的 data 元素；仅启用项，供下拉/程序引用） */
export const dictOptionSchema = z
  .object({
    value: z.string(),
    labelZh: z.string(),
    labelEn: z.string().nullable(),
    sort: z.number(),
  })
  .openapi("DictOption")

/** 系统参数列表项（分页列表 data.list 元素） */
export const configListItemSchema = z
  .object({
    id: z.string(),
    configKey: z.string(),
    configValue: z.string(),
    nameZh: z.string(),
    nameEn: z.string().nullable(),
    description: z.string().nullable(),
    status: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("ConfigListItem")

/** 系统参数详情（结构同列表项） */
export const configDetailSchema = configListItemSchema.extend({}).openapi("ConfigDetail")

/** 系统参数分页结果 */
export const configPageResultSchema = z
  .object({ list: z.array(configListItemSchema), total: z.number() })
  .openapi("ConfigPageResult")

/** 通知列表项（分页列表 data.list 元素；站内通知，按接收用户隔离） */
export const notificationItemSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    content: z.string(),
    isRead: z.boolean(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("NotificationItem")

/** 通知分页结果 */
export const notificationPageResultSchema = z
  .object({ list: z.array(notificationItemSchema), total: z.number() })
  .openapi("NotificationPageResult")

/** 未读通知数（顶栏铃铛徽标） */
export const unreadCountSchema = z.object({ count: z.number() }).openapi("UnreadCount")

/** 批量导入结果（成功条数 + 失败行明细；row 为 CSV 行号，1 为表头） */
export const importResultSchema = z
  .object({
    successCount: z.number(),
    failedRows: z.array(z.object({ row: z.number(), message: z.string() })),
  })
  .openapi("ImportResult")

/** 上传文件详情（filename 为服务端生成名，访问路径 /api/files/{filename}） */
export const fileDetailSchema = z
  .object({
    filename: z.string(),
    size: z.number(),
    mimeType: z.string(),
  })
  .openapi("FileDetail")

/** 部门列表项（扁平列表返回，前端经 shared buildTree 建树；userCount 为部门直属用户数） */
export const departmentItemSchema = z
  .object({
    id: z.string(),
    parentId: z.string().nullable(),
    nameZh: z.string(),
    nameEn: z.string().nullable(),
    sort: z.number(),
    status: z.boolean(),
    userCount: z.number(),
    createdAt: z.string(),
  })
  .openapi("DepartmentItem")

/** 部门列表响应（扁平数组；前端建树展示） */
export const departmentListSchema = z.array(departmentItemSchema).openapi("DepartmentList")

/** 公告列表项（分页列表 data.list 元素；status=false 下架，首页不再展示） */
export const announcementItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    status: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("AnnouncementItem")

/** 公告分页结果 */
export const announcementPageResultSchema = z
  .object({ list: z.array(announcementItemSchema), total: z.number() })
  .openapi("AnnouncementPageResult")

/** 最新已发布公告（首页横幅；无公告时 data 为 null） */
export const latestAnnouncementSchema = announcementItemSchema
  .omit({ updatedAt: true })
  .nullable()
  .openapi("LatestAnnouncement")
