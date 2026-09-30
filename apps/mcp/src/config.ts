/** MCP server 运行配置：全部来自环境变量，见 docs/mcp/README.md §3 */
export interface McpConfig {
  /** 后端 API 基址 */
  apiUrl: string
  /** stdio 模式的登录凭据；HTTP 模式下为 null 时要求客户端透传 Bearer */
  username: string | null
  password: string | null
  /** 是否注册写入类工具（默认关闭：见方案 §5.2 安全默认值） */
  enableWriteTools: boolean
  /** 传输方式 */
  transport: "stdio" | "http"
  /** HTTP 模式监听地址与端口（默认仅本机） */
  httpHost: string
  httpPort: number
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === "true" || value === "1"
}

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const transport = env.SHADOVA_TRANSPORT ?? "stdio"
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(`SHADOVA_TRANSPORT 仅支持 stdio/http，收到: ${transport}`)
  }
  const httpPort = Number(env.SHADOVA_HTTP_PORT ?? 3002)
  if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535) {
    throw new Error(`SHADOVA_HTTP_PORT 必须是 1-65535 的整数，收到: ${String(env.SHADOVA_HTTP_PORT ?? 3002)}`)
  }
  return {
    // 去掉尾部斜杠，避免拼接出 //api/...
    apiUrl: (env.SHADOVA_API_URL ?? "http://localhost:3001").replace(/\/+$/, ""),
    username: env.SHADOVA_USERNAME ?? null,
    password: env.SHADOVA_PASSWORD ?? null,
    enableWriteTools: parseBoolean(env.SHADOVA_ENABLE_WRITE_TOOLS, false),
    transport,
    httpHost: env.SHADOVA_HTTP_HOST ?? "127.0.0.1",
    httpPort,
  }
}
