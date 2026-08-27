import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { App } from "../src/main"

/**
 * 根路由表集成测试：main.tsx 的路由结构（/login 直接渲染、其他路径走 RequireAuth 守卫）。
 * 回归场景：曾经缺失顶层 * catch-all，访问 / 时 React Router 无匹配 → 白屏
 * （jsdom 组件测试测不到——这是真实浏览器白屏 bug 的防线）。
 */
describe("app routing", () => {
  beforeEach(() => {
    // 无会话：/auth/me 401 + refresh 无 token 失败 → RequireAuth 重定向 /login
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 401, message: "未登录", data: null }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ))
    localStorage.clear()
  })

  afterEach(() => {
    // 未开启 vitest globals——@testing-library 不自动卸载，必须显式 cleanup 防渲染污染
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("访问 /（未登录）→ 守卫重定向，最终渲染登录页", async () => {
    window.history.pushState({}, "", "/")
    render(<App />)
    expect(await screen.findByText(/欢迎回来/)).toBeInTheDocument()
  })

  it("访问 /login 直接渲染登录页（不经守卫）", async () => {
    window.history.pushState({}, "", "/login")
    render(<App />)
    expect(await screen.findByText(/欢迎回来/)).toBeInTheDocument()
  })

  it("访问未知路径（未登录）→ 守卫重定向登录页", async () => {
    window.history.pushState({}, "", "/no/such/page")
    render(<App />)
    expect(await screen.findByText(/欢迎回来/)).toBeInTheDocument()
  })

  it("已登录访问 / → 渲染 AppLayout（侧边栏）与 Dashboard", async () => {
    window.history.pushState({}, "", "/")
    // 会话有效：/auth/me 返回完整 MeResponse（user + roles + navTree + permissionCodes）
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : input.href
      if (url.includes("/auth/me")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              user: { id: "u1", username: "admin", nickname: "系统管理员", email: "admin@example.com", telephone: null },
              roles: [{ id: "r1", nameZh: "管理员", nameEn: "Administrator", code: "ADMIN" }],
              navTree: [
                {
                  id: "dash", parentId: null, nameZh: "Dashboard", nameEn: "Dashboard", type: "MENU",
                  path: "/", component: "dashboard", icon: null, permission: null,
                  sort: 0, status: true, children: [],
                },
                {
                  id: "sys", parentId: null, nameZh: "系统管理", nameEn: "System", type: "DIR",
                  path: null, component: null, icon: null, permission: null,
                  sort: 100, status: true,
                  children: [
                    {
                      id: "m1", parentId: "sys", nameZh: "用户管理", nameEn: "Users", type: "MENU",
                      path: "/system/user", component: "system/user", icon: null,
                      permission: "system:user:query", sort: 1, status: true, children: [],
                    },
                  ],
                },
              ],
              permissionCodes: ["system:user:query"],
            },
            message: "ok",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }
      return new Response(JSON.stringify({ code: 404, message: "not found", data: null }), { status: 404 })
    }))
    render(<App />)
    // 侧边栏标题（AppLayout 渲染标志）
    expect(await screen.findByText("Shadova")).toBeInTheDocument()
    // Dashboard 页面（动态路由 component=dashboard → features/dashboard/page.tsx）
    expect(await screen.findByText(/欢迎回来/)).toBeInTheDocument()
  })
})
