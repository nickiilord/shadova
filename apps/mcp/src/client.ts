import type { components } from "./api/schema.js"
import type { McpConfig } from "./config.js"

type MeResponse = components["schemas"]["MeResponse"]

/** 后端统一响应包装（与 apps/api 契约体一致：成功 code=0，失败 code 为字符串错误码） */
interface ApiEnvelope<T> {
  code: number | string
  data: T
  message: string
}

/**
 * 业务错误：携带 HTTP 状态与后端错误码。
 * 工具层把它转成 `isError: true` 的调用结果（而非抛协议级错误），使 LLM 能看到失败原因并自我纠正。
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  constructor(status: number, message: string, code: string | null) {
    super(message)
    this.status = status
    this.code = code
  }
}

export interface ApiClient {
  /** 当前账号用户名（经 /auth/me 得到） */
  readonly username: string
  /**
   * 权限码集合查询：仅用于决定哪些工具**注册**给 LLM。
   * 这不是安全边界——后端 `requirePermission` 仍是最终裁决，此处只是让 AI 不看到注定 403 的工具。
   */
  hasPermission(code: string): boolean
  /** 调用后端并解包 data；凭据登录模式下 401 会自动刷新并重试一次 */
  request<T>(path: string, init?: RequestInit): Promise<T>
}

/** 凭据来源：凭据登录可自动续期（双 token 轮换）；静态 token（HTTP 透传）不可续期 */
type TokenSource =
  | { kind: "credentials"; username: string; password: string }
  | { kind: "static"; token: string }

interface TokenPair {
  accessToken: string
  refreshToken: string
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!res.ok || body?.code !== 0) {
    throw new ApiError(
      res.status,
      body?.message ?? `请求失败(${String(res.status)})`,
      typeof body?.code === "string" ? body.code : null,
    )
  }
  return body.data
}

async function login(apiUrl: string, source: { username: string; password: string }): Promise<TokenPair> {
  const res = await postJson(`${apiUrl}/api/auth/login`, { username: source.username, password: source.password })
  return readEnvelope<TokenPair>(res)
}

/**
 * 创建 API 客户端。
 * @param staticToken HTTP 模式下由客户端透传的 access token；提供时不再使用账号凭据登录
 */
export async function createApiClient(config: McpConfig, staticToken?: string): Promise<ApiClient> {
  let source: TokenSource
  if (staticToken !== undefined) {
    source = { kind: "static", token: staticToken }
  } else if (config.username !== null && config.password !== null) {
    source = { kind: "credentials", username: config.username, password: config.password }
  } else {
    throw new Error(
      "缺少凭据：请设置 SHADOVA_USERNAME / SHADOVA_PASSWORD（stdio），或在 HTTP 模式下透传 Bearer token",
    )
  }

  let accessToken = source.kind === "static" ? source.token : ""
  let refreshToken: string | null = null
  if (source.kind === "credentials") {
    const pair = await login(config.apiUrl, source)
    accessToken = pair.accessToken
    refreshToken = pair.refreshToken
  }

  // refresh 单飞：并发 401 只发一次轮换（与 apps/web/src/api/session.ts 同语义；
  // 后端 refresh token 单活轮换，并发刷新会把彼此踢下线）
  let refreshPromise: Promise<void> | null = null

  async function refresh(): Promise<void> {
    if (refreshToken === null) {
      throw new ApiError(401, "会话已过期：静态 token 无法自动续期，请更新后重连", "UNAUTHORIZED")
    }
    refreshPromise ??= (async () => {
      const res = await postJson(`${config.apiUrl}/api/auth/refresh`, { refreshToken })
      const pair = await readEnvelope<TokenPair>(res)
      accessToken = pair.accessToken
      refreshToken = pair.refreshToken
    })().finally(() => {
      refreshPromise = null
    })
    return refreshPromise
  }

  async function send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set("authorization", `Bearer ${accessToken}`)
    if (init.body !== undefined) headers.set("content-type", "application/json")
    return fetch(`${config.apiUrl}${path}`, { ...init, headers })
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res = await send(path, init)
    // 401 只刷新重试一次；静态 token 模式不重试，直接抛出可读错误
    if (res.status === 401 && source.kind === "credentials") {
      await refresh()
      res = await send(path, init)
    }
    return readEnvelope<T>(res)
  }

  // 启动即自检：拿到当前账号的权限码与用户名（工具可见性过滤的依据）
  const me = await request<MeResponse>("/api/auth/me")
  const permissionCodes = new Set(me.permissionCodes)

  return {
    username: me.user.username,
    hasPermission: (code) => permissionCodes.has(code),
    request,
  }
}
