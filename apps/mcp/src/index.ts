#!/usr/bin/env node
import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createApiClient } from "./client.js"
import type { ApiClient } from "./client.js"
import { loadMcpConfig } from "./config.js"
import type { McpConfig } from "./config.js"
import { createMcpServer } from "./server.js"

/**
 * 日志一律走 stderr：stdio 模式下 stdout 是 MCP 协议通道，
 * 向它写任何非协议内容都会破坏握手（这也是不在此处加载 .env 文件的原因——那会向 stdout 打印提示）。
 */
function log(message: string): void {
  console.error(`[shadova-mcp] ${message}`)
}

async function runStdio(config: McpConfig): Promise<void> {
  const client = await createApiClient(config)
  const { server, registered } = createMcpServer(client, { enableWriteTools: config.enableWriteTools })
  log(`已登录为 ${client.username}，注册 ${String(registered.length)} 个工具`)
  if (config.enableWriteTools) log("写入工具已启用")
  await server.connect(new StdioServerTransport())
  log("stdio 传输已就绪")
}

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice("Bearer ".length).trim()
  return token === "" ? null : token
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString("utf8")
  return raw === "" ? undefined : (JSON.parse(raw) as unknown)
}

/**
 * HTTP 模式：Streamable HTTP + Bearer 直传。
 *
 * 无会话状态（sessionIdGenerator 为 undefined）：每次请求用客户端自带的 token 建立身份，
 * 天然支持多用户，server 端不保存任何会话——用哪个账号的 token 就继承该账号的权限。
 * 按 token 缓存 client，避免每个请求都重新调一次 /api/auth/me。
 */
async function runHttp(config: McpConfig): Promise<void> {
  const clients = new Map<string, Promise<ApiClient>>()

  const resolveClient = (token: string): Promise<ApiClient> => {
    let cached = clients.get(token)
    if (cached === undefined) {
      cached = createApiClient(config, token).catch((error: unknown) => {
        // 失败不缓存：token 可能只是暂时失效，避免永久钉住一个坏 client
        clients.delete(token)
        throw error
      })
      clients.set(token, cached)
    }
    return cached
  }

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    void (async () => {
      const token = readBearer(req)
      if (token === null) {
        res.writeHead(401, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: "缺少 Authorization: Bearer <access token>" }))
        return
      }
      try {
        const client = await resolveClient(token)
        const { server } = createMcpServer(client, { enableWriteTools: config.enableWriteTools })
        // 每个请求一对独立的 server / transport，响应结束即释放。
        // 不传 sessionIdGenerator 即无状态模式：身份完全由本请求的 Bearer token 决定。
        const transport = new StreamableHTTPServerTransport()
        res.on("close", () => {
          void transport.close()
          void server.close()
        })
        await server.connect(transport)
        await transport.handleRequest(req, res, await readJsonBody(req))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: message }))
      }
    })()
  }

  const httpServer = createServer(handle)
  // listen 后由 http server 持有事件循环句柄，进程保持存活
  await new Promise<void>((resolve) => {
    httpServer.listen(config.httpPort, config.httpHost, () => {
      log(`HTTP 传输已就绪：http://${config.httpHost}:${String(config.httpPort)}/mcp（需 Authorization: Bearer）`)
      if (config.enableWriteTools) log("写入工具已启用：按每次请求 token 所属账号的权限注册")
      resolve()
    })
  })
}

async function main(): Promise<void> {
  const config = loadMcpConfig()
  if (config.transport === "stdio") {
    await runStdio(config)
    return
  }
  await runHttp(config)
}

await main().catch((error: unknown) => {
  log(`启动失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
