/** API 基址：开发经 Vite 代理、生产经 nginx 反代，均为同源相对路径（后端未启用 CORS，不可跨端口直连） */
const API_BASE = "/api"

/** 业务错误：携带后端错误码（如 RATE_LIMITED），调用方按码分支展示 */
export class ApiError extends Error {
  readonly code: string | undefined
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

/**
 * 门户公开接口请求封装：门户面向访客，无登录态、无 token 与 401 刷新链
 * （对比 apps/web/src/api/client.ts——那边是带鉴权的管理端请求链，两者不共用）。
 * 响应体约定一致：{ code, data, message }，非 2xx 或 code !== 0 抛 ApiError。
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json")
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new Error("网络请求失败，请检查网络")
  }
  const body = (await res.json().catch(() => null)) as
    | { code: number | string; data: T; message: string }
    | null
  if (!res.ok || body?.code !== 0) {
    throw new ApiError(
      body?.message ?? `请求失败(${String(res.status)})`,
      typeof body?.code === "string" ? body.code : undefined,
    )
  }
  return body.data
}
