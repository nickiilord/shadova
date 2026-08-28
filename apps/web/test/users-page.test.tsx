import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { components } from "../src/api/schema"
import { AuthProviderView } from "../src/auth/AuthProvider"
import type { AuthProvider } from "../src/auth/types"
import UserPage from "../src/features/system/user/page"
import { ME_QUERY_KEY } from "../src/router/guards"

const userList: components["schemas"]["UserListItem"][] = [
  {
    id: "u1",
    username: "admin",
    nickname: "系统管理员",
    email: "admin@example.com",
    telephone: "13800138000",
    avatar: null,
    department: null,
    status: true,
    createdAt: "2026-08-01T02:00:00.000Z",
    roles: [{ id: "r1", nameZh: "管理员", nameEn: "Administrator", code: "ADMIN" }],
  },
  {
    id: "u2",
    username: "zhangsan",
    nickname: "张三",
    email: null,
    telephone: null,
    avatar: null,
    department: null,
    status: false,
    createdAt: "2026-08-02T02:00:00.000Z",
    roles: [],
  },
]

const rolesList: components["schemas"]["RoleListItem"][] = [
  {
    id: "r1",
    nameZh: "管理员",
    nameEn: "Administrator",
    code: "ADMIN",
    description: null,
    sort: 0,
    status: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "r2",
    nameZh: "访客",
    nameEn: "Guest",
    code: "GUEST",
    description: null,
    sort: 1,
    status: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
]

const ALL_PERMISSIONS = [
  "system:user:query",
  "system:user:create",
  "system:user:update",
  "system:user:delete",
  "system:user:assign-role",
]

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

/** RequestInfo | URL → 字符串 URL（base-to-string 规则禁止 String(object)） */
function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * 路由式 fetch mock：GET /api/users 列表（total 随 DELETE 递减，模拟删末条后分页数回落）、
 * POST/PATCH/PUT/DELETE 均返回成功、/api/roles/list 全量；其余 URL 抛错防静默。
 */
function createFetchMock(options: { total?: number; users?: typeof userList } = {}) {
  const users = options.users ?? userList
  let total = options.total ?? userList.length
  return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrlString(input)
    const method = init?.method ?? "GET"
    if (method === "POST" && url === "/api/users") {
      return Promise.resolve(okResponse(users[0]))
    }
    if (method === "DELETE") {
      total = Math.max(0, total - 1)
      return Promise.resolve(okResponse(null))
    }
    if (method === "PATCH" && url.startsWith("/api/users/")) {
      return Promise.resolve(okResponse(users[0]))
    }
    if (method === "PUT" && url.endsWith("/roles")) {
      return Promise.resolve(okResponse(users[0]))
    }
    if (url.startsWith("/api/users")) {
      return Promise.resolve(okResponse({ list: users, total }))
    }
    if (url.startsWith("/api/roles/list")) {
      return Promise.resolve(okResponse(rolesList))
    }
    throw new Error(`unexpected fetch: ${method} ${url}`)
  })
}

function createMockProvider(): AuthProvider {
  return {
    login: vi.fn(),
    sendOtp: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    getSession: vi.fn(),
  }
}

/**
 * 预填充 me 缓存（Permission 组件依赖）：permissionCodes 决定按钮渲染；
 * staleTime: Infinity 阻止 useMeQuery 后台 refetch 覆盖缓存（fetch mock 不含 /auth/me）
 */
function renderUserPage(
  fetchMock: ReturnType<typeof createFetchMock>,
  permissionCodes: string[] = ALL_PERMISSIONS,
) {
  vi.stubGlobal("fetch", fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData<components["schemas"]["MeResponse"]>(ME_QUERY_KEY, {
    user: { id: "u1", username: "admin", nickname: "系统管理员", email: null, telephone: null, avatar: null },
    roles: [{ id: "r1", nameZh: "管理员", nameEn: "Administrator", code: "ADMIN" }],
    navTree: [],
    permissionCodes,
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProviderView provider={createMockProvider()}>
        <UserPage />
      </AuthProviderView>
    </QueryClientProvider>,
  )
}

/** 定位指定用户名所在行的操作按钮 */
function rowButton(username: string, name: string): HTMLElement {
  const row = screen.getByText(username).closest("tr")
  if (!row) throw new Error(`找不到用户行: ${username}`)
  return within(row).getByRole("button", { name })
}

/** 某 method 的所有请求体（已 JSON.parse） */
function fetchBodies(fetchMock: ReturnType<typeof createFetchMock>, method: string) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([, init]) => init?.body)
    .filter((body): body is string => typeof body === "string")
    .map((body) => JSON.parse(body) as Record<string, unknown>)
}

/** 某 method 的所有请求 URL */
function fetchUrls(fetchMock: ReturnType<typeof createFetchMock>, method: string) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([input]) => toUrlString(input))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("UserPage", () => {
  it("渲染用户列表：用户名/状态/角色/权限门控操作按钮", async () => {
    renderUserPage(createFetchMock())

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
    expect(screen.getByText("系统管理员")).toBeInTheDocument()
    expect(screen.getByText("zhangsan")).toBeInTheDocument()
    // 状态 Badge 按行断言（行内状态切换按钮文本同名，全屏 getByText 会 multiple match）
    const adminRow = screen.getByText("admin").closest("tr")
    if (!adminRow) throw new Error("找不到 admin 行")
    expect(within(adminRow).getByText("启用")).toBeInTheDocument()
    const zhangsanRow = screen.getByText("zhangsan").closest("tr")
    if (!zhangsanRow) throw new Error("找不到 zhangsan 行")
    expect(within(zhangsanRow).getByText("禁用")).toBeInTheDocument()
    // 状态切换按钮随当前状态显示：启用行"禁用"、禁用行"启用"
    expect(screen.getAllByRole("button", { name:"禁用" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name:"启用" })).toHaveLength(1)
    // 角色列（管理员）；空邮箱/部门/角色渲染占位符（u1 部门空 + u2 三项空 = 4 处）
    expect(screen.getByText("管理员")).toBeInTheDocument()
    expect(screen.getAllByText("-")).toHaveLength(4)
    // Permission 全量授权：新增/编辑/禁用/分配角色/删除按钮均渲染
    expect(screen.getByRole("button", { name:"新增用户" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name:"编辑" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name:"分配角色" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name:"删除" })).toHaveLength(2)
  })

  it("无 system:user:create 权限：不渲染新增按钮（其余操作按钮不受影响）", async () => {
    renderUserPage(
      createFetchMock(),
      ALL_PERMISSIONS.filter((code) => code !== "system:user:create"),
    )

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name:"新增用户" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name:"编辑" })).toHaveLength(2)
  })

  it("新增用户：打开 Dialog 填表提交 → POST /api/users 携带表单数据", async () => {
    const fetchMock = createFetchMock()
    renderUserPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name:"新增用户" }))

    const usernameInput = await screen.findByLabelText("用户名")
    fireEvent.change(usernameInput, { target: { value: "alice" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Passw0rd!" } })
    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "爱丽丝" } })
    fireEvent.click(screen.getByRole("button", { name:"保存" }))

    await waitFor(() => {
      expect(fetchBodies(fetchMock, "POST")).toContainEqual({
        username: "alice",
        password: "Passw0rd!",
        nickname: "爱丽丝",
      })
    })
  })

  it("编辑用户：PATCH 携带修改字段（密码省略、空邮箱/手机号转 null）", async () => {
    const fetchMock = createFetchMock()
    renderUserPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("zhangsan")).toBeInTheDocument()
    })
    fireEvent.click(rowButton("zhangsan", "编辑"))

    const nicknameInput = await screen.findByLabelText("昵称")
    fireEvent.change(nicknameInput, { target: { value: "新昵称" } })
    fireEvent.click(screen.getByRole("button", { name:"保存" }))

    await waitFor(() => {
      // 部分更新契约：状态/角色/部门由独立入口提交（禁用按钮/分配角色/分配部门弹窗），编辑只带基础字段
      expect(fetchBodies(fetchMock, "PATCH")).toContainEqual({
        nickname: "新昵称",
        email: null,
        telephone: null,
      })
    })
  })

  it("删除用户：AlertDialog 确认后调用 DELETE /api/users/{id}", async () => {
    const fetchMock = createFetchMock()
    renderUserPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("zhangsan")).toBeInTheDocument()
    })
    fireEvent.click(rowButton("zhangsan", "删除"))

    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("确定删除用户「zhangsan」？")
    fireEvent.click(within(dialog).getByRole("button", { name:"删除" }))

    await waitFor(() => {
      expect(fetchUrls(fetchMock, "DELETE")).toContain("/api/users/u2")
    })
  })

  it("删除用户：AlertDialog 取消不调用 DELETE", async () => {
    const fetchMock = createFetchMock()
    renderUserPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("zhangsan")).toBeInTheDocument()
    })
    fireEvent.click(rowButton("zhangsan", "删除"))

    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name:"取消" }))

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false)
  })

  it("分配角色：勾选后保存 → PUT /api/users/{id}/roles 全量提交", async () => {
    const fetchMock = createFetchMock()
    renderUserPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
    fireEvent.click(rowButton("admin", "分配角色"))

    // 回显：管理员已勾选；勾选访客后保存
    // （Base UI Checkbox：id 落在隐藏 input 上、可见根为 role=checkbox——按 role+name 定位）
    expect(await screen.findByRole("checkbox", { name:"管理员" })).toBeChecked()
    fireEvent.click(screen.getByRole("checkbox", { name:"访客" }))
    fireEvent.click(screen.getByRole("button", { name:"保存" }))

    await waitFor(() => {
      expect(fetchUrls(fetchMock, "PUT")).toContain("/api/users/u1/roles")
      expect(fetchBodies(fetchMock, "PUT")).toContainEqual({ roleIds: ["r1", "r2"] })
    })
  })

  it("删除末页最后一条后页码回钳：totalPages 3 → 2 时 page 从 3 回落到 2 并重新查询", async () => {
    // 21 条 / pageSize 10 → 3 页；删 1 条 → 20 → totalPages 2，page=3 越界需回钳
    const fetchMock = createFetchMock({ total: 21, users: userList })
    renderUserPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
    // 翻到第 3 页（PaginationLink 渲染 <a role="button">）
    fireEvent.click(screen.getByRole("button", { name:"3" }))
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => toUrlString(input))
      expect(urls).toContain("/api/users?page=3&pageSize=10")
    })
    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })

    fireEvent.click(rowButton("admin", "删除"))
    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name:"删除" }))

    // total 21 → 20 → totalPages 3 → 2，page 回钳到 2 并重新查询
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => toUrlString(input))
      expect(urls).toContain("/api/users?page=2&pageSize=10")
    })
  })
})
