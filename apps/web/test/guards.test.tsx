import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthProviderView } from "../src/auth/AuthProvider"
import type { AuthProvider, AuthSession } from "../src/auth/types"
import { RequireAuth } from "../src/router/guards"

const session: AuthSession = {
  user: {
    id: "u1",
    username: "admin",
    nickname: "管理员",
    email: null,
    telephone: null,
  },
  accessToken: "at",
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function createMockProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    login: vi.fn<AuthProvider["login"]>(),
    sendOtp: vi.fn<AuthProvider["sendOtp"]>(),
    logout: vi.fn<AuthProvider["logout"]>(),
    refresh: vi.fn<AuthProvider["refresh"]>(),
    getSession: vi.fn<AuthProvider["getSession"]>(),
    ...overrides,
  }
}

function renderRequireAuth(provider: AuthProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProviderView provider={provider}>
        <MemoryRouter initialEntries={["/protected"]}>
          <Routes>
            <Route path="/login" element={<div>登录页</div>} />
            <Route path="*" element={<RequireAuth />} />
          </Routes>
        </MemoryRouter>
      </AuthProviderView>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  // vitest 未开 globals，RTL 不会自动注册 cleanup，需手动清理（否则上一用例的 DOM 会残留）
  cleanup()
  vi.unstubAllGlobals()
})

describe("RequireAuth", () => {
  it("无会话：重定向到 /login 且不渲染受保护内容", async () => {
    renderRequireAuth(
      createMockProvider({ getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(null) }),
    )

    await waitFor(() => {
      expect(screen.getByText("登录页")).toBeInTheDocument()
    })
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument()
  })

  it("无会话：会话判定只走 getSession，不请求 /auth/me", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderRequireAuth(
      createMockProvider({ getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(null) }),
    )

    await waitFor(() => {
      expect(screen.getByText("登录页")).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("有会话：渲染 AppLayout（守卫直接渲染布局，不再用 Outlet）", async () => {
    // getSession 成功后 queryFn 会继续请求 /auth/me 取 navTree——stub fetch 返回 me 响应
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ user: session.user, roles: [], navTree: [], permissionCodes: [] }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderRequireAuth(
      createMockProvider({ getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(session) }),
    )

    // AppLayout 侧边栏标题为渲染标志（navTree 空 → 内部路由 * → NotFoundPage）
    await waitFor(() => {
      expect(screen.getByText("Shadova")).toBeInTheDocument()
    })
    // me 守卫查询 + 顶栏铃铛两个查询（未读数 + 最近 5 条）
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("me 查询失败（网络错误）：重定向到 /login", async () => {
    // getSession 成功但 /auth/me 请求失败（瞬时网络错误）——retry:false 下立即按未登录处理
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"))
    vi.stubGlobal("fetch", fetchMock)
    renderRequireAuth(
      createMockProvider({ getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(session) }),
    )

    await waitFor(() => {
      expect(screen.getByText("登录页")).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument()
  })

  it("会话解析中：展示加载态", () => {
    renderRequireAuth(
      createMockProvider({
        // 永不 resolve：模拟会话解析中
        getSession: vi
          .fn<AuthProvider["getSession"]>()
          .mockImplementation(() => new Promise<AuthSession | null>(() => undefined)),
      }),
    )

    expect(screen.getByText("加载中…")).toBeInTheDocument()
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument()
  })
})
