import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { serve } from "@hono/node-server"
import { createApiClient } from "../src/client.js"
import type { ApiClient } from "../src/client.js"
import type { McpConfig } from "../src/config.js"
import { createMcpServer } from "../src/server.js"

/**
 * 协议层测试：用 MCP 官方 Client 经内存传输连上真实 server（并连真实 API），
 * 验证握手、工具清单、注解与真实调用——这是"AI 客户端能不能用"的最近似验证。
 */
let httpServer: ReturnType<typeof serve>
let baseUrl: string
let apiClient: ApiClient

function configFor(apiUrl: string): McpConfig {
  return {
    apiUrl,
    username: "admin",
    password: "Admin@123",
    enableWriteTools: false,
    transport: "stdio",
    httpHost: "127.0.0.1",
    httpPort: 0,
  }
}

async function connectClient(enableWriteTools: boolean): Promise<Client> {
  const { server } = createMcpServer(apiClient, { enableWriteTools })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "shadova-test", version: "1.0.0" })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return client
}

/** callTool 的返回是联合类型（普通结果或 task 结果）；取第一段文本，缺 content 时返回空串 */
type CallToolOutcome = Awaited<ReturnType<Client["callTool"]>>

function firstText(result: CallToolOutcome): string {
  if (!("content" in result)) return ""
  const blocks = result.content as { type: string; text?: string }[]
  return blocks[0]?.text ?? ""
}

beforeAll(async () => {
  const { createApp } = await import("../../api/src/index.js")
  httpServer = serve({ fetch: createApp().fetch, port: 0 })
  await new Promise<void>((resolve) => httpServer.once("listening", resolve))
  const address = httpServer.address()
  if (address === null || typeof address === "string") throw new Error("无法取得测试服务端口")
  baseUrl = `http://127.0.0.1:${String(address.port)}`
  apiClient = await createApiClient(configFor(baseUrl))
}, 60_000)

afterAll(() => {
  httpServer.close()
})

describe("MCP 协议层（真实 Client ↔ Server）", () => {
  it("默认只暴露只读工具，且都带只读注解", async () => {
    const client = await connectClient(false)
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(15)
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    expect(tools.map((tool) => tool.name)).toContain("list_users")
    expect(tools.map((tool) => tool.name)).not.toContain("create_user")
    await client.close()
  })

  it("开启写入后暴露全部 23 个工具，写工具标记为非破坏性", async () => {
    const client = await connectClient(true)
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(23)
    const writeTool = tools.find((tool) => tool.name === "create_user")
    expect(writeTool?.annotations?.readOnlyHint).toBe(false)
    // 本项目的写工具只做增量更新，不应被客户端当作破坏性操作
    expect(writeTool?.annotations?.destructiveHint).toBe(false)
    await client.close()
  })

  it("真实调用 list_users：拿到契约数据而非错误", async () => {
    const client = await connectClient(false)
    const result = await client.callTool({ name: "list_users", arguments: { page: 1, pageSize: 5 } })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(firstText(result)) as { list: { username: string }[]; total: number }
    expect(parsed.total).toBeGreaterThan(0)
    expect(parsed.list.map((item) => item.username)).toContain("admin")
    await client.close()
  })

  it("工具失败时返回 isError 结果而非协议错误（LLM 才能看到原因并自我纠正）", async () => {
    const client = await connectClient(false)
    const result = await client.callTool({ name: "get_user", arguments: { id: "not-exists-id" } })
    expect(result.isError).toBe(true)
    expect(firstText(result)).toContain("调用失败")
    await client.close()
  })

  it("入参不合 schema 时被 SDK 拦下：返回可读 isError，不会打到后端", async () => {
    const client = await connectClient(false)
    const result = await client.callTool({ name: "list_users", arguments: { page: -1 } })
    // SDK 校验失败走 isError 而非协议错误，AI 才能看到"哪个参数不合法"并自行纠正
    expect(result.isError).toBe(true)
    expect(firstText(result)).toContain("Input validation error")
    await client.close()
  })
})
