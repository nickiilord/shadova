import i18n from "@/localization/i18n"
import { API_BASE, doRefresh, getAccessToken, getTokenRefresher, setAccessToken } from "./session"
import type { ApiEnvelope } from "./session"

/** 业务错误：携带后端错误码（errors 命名空间按码映射多语言文案），未知码回退 message */
export class ApiError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

/**
 * 统一错误文案：ApiError 携带后端错误码时经 errors 命名空间映射为当前语言文案
 * （未知码 defaultValue 回退后端 message）；其余 Error 直接用 message；非 Error 兜底通用文案
 */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code) {
    const key = `errors:${err.code}`
    return i18n.t(key, { defaultValue: err.message })
  }
  return err instanceof Error ? err.message : "请求失败"
}

/** fetch 网络异常（TypeError，非 HTTP 错误）统一包装为业务 Error——api() 一律抛 Error 的契约 */
async function safeFetch(path: string, init: RequestInit, headers: Headers): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new Error("网络请求失败，请检查网络")
  }
}

/**
 * 401 恢复（api / apiDownload / apiFormData 共用）：
 * Clerk 模式经注册的刷新器重取 session token；JWT 模式走 doRefresh 单飞轮换双 token。
 * 返回新 token；刷新器返回 null 或 JWT 无 refresh token 时返回 null（调用方放弃重试）。
 * doRefresh 失败会清空 tokens 并抛错（与 api() 语义一致，守卫按未登录处理）。
 */
async function recoverFrom401(): Promise<string | null> {
  const refresher = getTokenRefresher()
  if (refresher) return refresher()
  await doRefresh()
  return getAccessToken()
}

async function fetchWithAuth(path: string, init: RequestInit, headers: Headers): Promise<Response> {
  const response = await safeFetch(path, init, headers)
  if (response.status !== 401) return response
  const freshToken = await recoverFrom401()
  if (!freshToken) return response
  setAccessToken(freshToken)
  headers.set("authorization", `Bearer ${freshToken}`)
  return safeFetch(path, init, headers)
}

/**
 * 统一 fetch 封装：
 * - 自动加 content-type: application/json + Bearer access token
 * - 401 → 刷新 token 重试一次（不递归，防死循环）；刷新失败/无 token 时透传原 401 错误
 * - 响应体 { code, data, message }：非 2xx 或 code !== 0 抛 Error(message)
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json")
  const token = getAccessToken()
  if (token) headers.set("authorization", `Bearer ${token}`)
  const res = await fetchWithAuth(path, init, headers)
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!res.ok || body?.code !== 0) {
    const message = body?.message ?? `请求失败(${String(res.status)})`
    throw new ApiError(message, typeof body?.code === "string" ? body.code : undefined)
  }
  return body.data
}

/**
 * 下载类响应（text/csv 等）：带 Bearer 请求并返回 Blob。
 * 401 同样走 recoverFrom401 刷新重试一次；非 2xx 复用 JSON 错误体解析。
 */
export async function apiDownload(path: string): Promise<Blob> {
  const headers = new Headers()
  const token = getAccessToken()
  if (token) headers.set("authorization", `Bearer ${token}`)
  const res = await fetchWithAuth(path, {}, headers)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null
    throw new ApiError(
      body?.message ?? `请求失败(${String(res.status)})`,
      typeof body?.code === "string" ? body.code : undefined,
    )
  }
  return res.blob()
}

/**
 * multipart 上传（FormData）：带 Bearer；content-type 由浏览器自动附加 boundary（不可设 JSON）。
 * 401 同样走 recoverFrom401 刷新重试一次。
 */
export async function apiFormData<T>(path: string, formData: FormData): Promise<T> {
  const headers = new Headers()
  const token = getAccessToken()
  if (token) headers.set("authorization", `Bearer ${token}`)
  const res = await fetchWithAuth(path, { method: "POST", body: formData }, headers)
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!res.ok || body?.code !== 0) {
    const message = body?.message ?? `请求失败(${String(res.status)})`
    throw new ApiError(message, typeof body?.code === "string" ? body.code : undefined)
  }
  return body.data
}
