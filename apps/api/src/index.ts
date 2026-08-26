import { pathToFileURL } from "node:url"
import { OpenAPIHono } from "@hono/zod-openapi"
import { swaggerUI } from "@hono/swagger-ui"
import { prisma } from "@repo/db"
import type { Context, Env } from "hono"
import { HTTPException } from "hono/http-exception"
import { loadConfig, type AppConfig } from "./config.js"
import { HttpError } from "./lib/http-error.js"
import { API_INFO, menuNodeOpenApiSchema, type PublicUser } from "./lib/schemas.js"
import { validationHook } from "./lib/validation-hook.js"
import { requestIp, requestUserAgent } from "./lib/request-log.js"
import { redactJson } from "./lib/redact.js"
import { announcementRoutes } from "./routes/announcements.js"
import { authRoutes } from "./routes/auth.js"
import { configRoutes } from "./routes/configs.js"
import { departmentRoutes } from "./routes/departments.js"
import { dictRoutes } from "./routes/dicts.js"
import { fileRoutes } from "./routes/files.js"
import { logRoutes } from "./routes/logs.js"
import { meRoutes } from "./routes/me.js"
import { menuRoutes } from "./routes/menus.js"
import { notificationRoutes } from "./routes/notifications.js"
import { otpRoutes } from "./routes/otp.js"
import { roleRoutes } from "./routes/roles.js"
import { sessionRoutes } from "./routes/sessions.js"
import { userRoutes } from "./routes/users.js"

export function createApp(cfg: AppConfig = loadConfig()): OpenAPIHono {
  const app = new OpenAPIHono<Env>({
    // zod 校验失败统一 400 契约体（校验失败不 throw，onError 捕获不到）
    defaultHook: validationHook,
  })

  app.doc("/api/openapi.json", {
    openapi: "3.0.0",
    info: API_INFO,
  })
  app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  })
  app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }))

  app.get("/api/health", (c) =>
    c.json({ code: 0, data: { ok: true }, message: "ok" }),
  )

  // 操作日志：非 GET /api 写操作审计（fire-and-forget，不阻塞响应）。
  // 跳过登录/OTP/文档/健康检查等路径；GET 属读操作不记录。未匹配路由的写请求（404）也记录。
  // 敏感路径（登录/OTP/改密/系统参数——configValue 可能存第三方凭据）不记录请求体快照；
  // application/json 请求体先按键名脱敏（password/token/secret/code）再截断 180 字符落库。
  const SENSITIVE_PATHS = ["/api/auth/login", "/api/auth/change-password", "/api/auth/otp/", "/api/configs"]
  app.use("*", async (c: Context, next) => {
    const method = c.req.method
    const path = c.req.path
    if (
      method === "GET" ||
      !path.startsWith("/api/") ||
      path === "/api/auth/login" ||
      path.startsWith("/api/auth/otp/") ||
      path === "/api/auth/refresh" ||
      path === "/api/docs" ||
      path === "/api/openapi.json" ||
      path === "/api/health"
    ) {
      return next()
    }

    // 请求体快照：application/json 写操作（Hono c.req.text() 有缓存，多次读取安全）；
    // multipart（文件上传）与敏感路径跳过
    const contentType = c.req.header("content-type") ?? ""
    const sensitive = SENSITIVE_PATHS.some((prefix) => path === prefix || path.startsWith(prefix))
    const requestBody = !sensitive && contentType.includes("application/json") ? (await c.req.text()) : undefined

    const start = Date.now()
    await next()
    const statusCode = c.res.status
    // 认证中间件已跑时 authUser 直接可用；未挂 authenticate 但存在 userId 的场景廉价回查
    // （ContextVariableMap 声明为非可选，运行时未挂 authenticate 时为 undefined，显式断言）
    const userId = c.get("userId") as string | undefined
    let username: string | null = null
    const authUser = c.get("authUser") as PublicUser | undefined
    if (authUser !== undefined) {
      username = authUser.username
    } else if (userId !== undefined) {
      const found = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
      username = found?.username ?? null
    }
    // Hono compose 在调 onError 前已把抛出的错误写入 c.error，此处取其 message（HttpError.message 即响应 message）
    const errorMessage = statusCode >= 400 && c.error !== undefined ? c.error.message : null
    void prisma.operationLog
      .create({
        data: {
          userId: userId ?? null,
          username,
          method,
          path,
          statusCode,
          durationMs: Date.now() - start,
          ip: requestIp(c),
          userAgent: requestUserAgent(c),
          errorMessage,
          // 快照：先脱敏敏感字段（password/token/code → ***），再截断 180 字符
          // （详情展示 + 兼容 MySQL 默认 VARCHAR(191)，超长写入会 data too long）
          requestBody:
            requestBody === undefined
              ? null
              : redactJson(requestBody).slice(0, 180),
        },
      })
      .catch(() => undefined)
  })

  // MenuNode 递归组件手工注册（实证：zod-to-openapi v7 不支持 z.lazy，schemas.ts menuNodeSchema 仅运行时用）
  app.openAPIRegistry.registerComponent("schemas", "MenuNode", menuNodeOpenApiSchema)

  app.route("/", announcementRoutes(cfg))
  app.route("/", authRoutes(cfg))
  app.route("/", otpRoutes(cfg))
  app.route("/", meRoutes(cfg))
  app.route("/", roleRoutes(cfg))
  app.route("/", menuRoutes(cfg))
  app.route("/", userRoutes(cfg))
  app.route("/", logRoutes(cfg))
  app.route("/", sessionRoutes(cfg))
  app.route("/", dictRoutes(cfg))
  app.route("/", configRoutes(cfg))
  app.route("/", departmentRoutes(cfg))
  app.route("/", notificationRoutes(cfg))
  app.route("/", fileRoutes(cfg))

  app.notFound((c) =>
    c.json({ code: "NOT_FOUND", message: "接口不存在", data: null }, 404),
  )

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ code: err.code, message: err.message, data: null }, err.status)
    }
    if (err instanceof HTTPException) {
      return c.json({ code: "HTTP_ERROR", message: err.message, data: null }, err.status)
    }
    // 兜底：Prisma P2002（唯一约束冲突）走统一 409 契约体；路由层仍做字段级转换
    if (typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return c.json({ code: "CONFLICT", message: "数据冲突", data: null }, 409)
    }
    console.error("[api] unhandled error:", err)
    return c.json({ code: "INTERNAL", message: "服务器内部错误", data: null }, 500)
  })

  return app
}

// 仅直接运行时监听（测试用 createApp().request()）
// Windows 下 argv[1] 是反斜杠路径，需经 pathToFileURL 归一化后再与 import.meta.url 比较
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const { serve } = await import("@hono/node-server")
  const cfg = loadConfig()
  serve({ fetch: createApp(cfg).fetch, port: cfg.port }, (info) => {
    console.log(`api listening on http://localhost:${String(info.port)}`)
  })
  // 定时清理任务随服务启动（测试环境走 createApp 不触发）
  const { startCleanupScheduler } = await import("./lib/scheduler.js")
  startCleanupScheduler()
}
