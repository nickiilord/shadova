import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { serve } from "@hono/node-server"
import { createApiClient } from "../src/client.js"
import type { ApiClient } from "../src/client.js"
import type { McpConfig } from "../src/config.js"
import { allTools } from "../src/tools/index.js"

/**
 * 真实链路测试：进程内起一个真实 API（连测试库，见 test/setup.ts），
 * 让 MCP 工具真的经 HTTP 调通后端——验证客户端登录与工具的参数拼装，而不只是类型正确。
 */
let server: ReturnType<typeof serve>
let baseUrl: string

function configFor(apiUrl: string, overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    apiUrl,
    username: "admin",
    password: "Admin@123",
    enableWriteTools: false,
    transport: "stdio",
    httpHost: "127.0.0.1",
    httpPort: 0,
    ...overrides,
  }
}

function toolByName(name: string) {
  const tool = allTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`工具不存在: ${name}`)
  return tool
}

async function adminClient(): Promise<ApiClient> {
  return createApiClient(configFor(baseUrl))
}

beforeAll(async () => {
  const { createApp } = await import("../../api/src/index.js")
  server = serve({ fetch: createApp().fetch, port: 0 })
  await new Promise<void>((resolve) => server.once("listening", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("无法取得测试服务端口")
  baseUrl = `http://127.0.0.1:${String(address.port)}`
}, 60_000)

afterAll(() => {
  server.close()
})

describe("MCP → 真实 API 链路", () => {
  it("登录成功并取得账号权限码（admin 应持有全部权限）", async () => {
    const client = await adminClient()
    expect(client.username).toBe("admin")
    expect(client.hasPermission("system:user:query")).toBe(true)
    expect(client.hasPermission("portal:message:query")).toBe(true)
    // 不存在的权限码不误判为有权限
    expect(client.hasPermission("not:a:permission")).toBe(false)
  })

  it("凭据错误时抛出可读错误", async () => {
    await expect(createApiClient(configFor(baseUrl, { password: "wrong-password" }))).rejects.toThrow()
  })

  it("list_users 返回分页结果（含种子的 admin）", async () => {
    const client = await adminClient()
    const result = (await toolByName("list_users").run({ page: 1, pageSize: 5 }, client)) as {
      list: { username: string }[]
      total: number
    }
    expect(result.total).toBeGreaterThan(0)
    expect(result.list.map((item) => item.username)).toContain("admin")
  })

  it("get_menu_tree 返回菜单树（验证无参数工具的路径拼装）", async () => {
    const client = await adminClient()
    const tree = (await toolByName("get_menu_tree").run({}, client)) as { nameZh: string }[]
    expect(Array.isArray(tree)).toBe(true)
    expect(tree.length).toBeGreaterThan(0)
  })

  it("get_dict_options 按类型编码取启用项", async () => {
    const client = await adminClient()
    const options = (await toolByName("get_dict_options").run({ typeCode: "user_status" }, client)) as unknown[]
    expect(Array.isArray(options)).toBe(true)
    expect(options.length).toBeGreaterThan(0)
  })

  it("后端返回错误时抛出可读错误（工具层会转成 isError 结果交给 LLM 自我纠正）", async () => {
    const client = await adminClient()
    await expect(toolByName("get_user").run({ id: "not-exists-id" }, client)).rejects.toThrow()
  })
})
