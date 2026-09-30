import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ApiClient } from "./client.js"
import { allTools } from "./tools/index.js"
import { selectTools } from "./tools/registry.js"

/** 出现在 MCP client 的 server 列表里 */
const SERVER_INFO = { name: "shadova", version: "0.1.0" }

/**
 * 把工具结果转成 MCP 调用结果。
 *
 * 失败必须用 `isError: true` 返回，而不是抛协议级错误——SDK 文档明确：抛错时 LLM 看不到失败原因，
 * 也就无法自我纠正（例如参数写错后重试）。
 */
function toResult(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
}

function toErrorResult(error: unknown): { content: { type: "text"; text: string }[]; isError: true } {
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: "text", text: `调用失败：${message}` }], isError: true }
}

export interface McpServerBundle {
  server: McpServer
  /** 本次实际注册的工具名（用于启动日志与测试断言） */
  registered: string[]
}

/**
 * 按当前账号的权限与写入开关装配 MCP server。
 * HTTP 模式下每个请求都会用它新建一个实例（无会话状态，天然支持多用户）。
 */
export function createMcpServer(client: ApiClient, options: { enableWriteTools: boolean }): McpServerBundle {
  const server = new McpServer(SERVER_INFO)
  const selected = selectTools(allTools, {
    hasPermission: (code) => client.hasPermission(code),
    enableWriteTools: options.enableWriteTools,
  })

  for (const tool of selected) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.kind === "read",
          // 本项目的写工具只做增量更新（删除类操作不暴露），显式声明避免 client 按默认值当作破坏性操作
          destructiveHint: false,
        },
      },
      async (args) => {
        try {
          return toResult(await tool.run(args, client))
        } catch (error) {
          return toErrorResult(error)
        }
      },
    )
  }

  return { server, registered: selected.map((tool) => tool.name) }
}
