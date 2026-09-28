import type { z } from "zod"
import type { PermissionCode } from "@repo/shared"
import type { ApiClient } from "../client.js"

/**
 * 工具定义的统一形态。
 *
 * `inputSchema` 与 `run` 的参数类型由 `defineTool` 的泛型绑定，此处只做类型擦除——
 * 擦除点唯一在本文件，所有调用处（各 tools/*.ts）保持强类型。
 */
export interface ToolDefinition {
  readonly name: string
  readonly title: string
  readonly description: string
  /** 调用所需权限码（统一引用 @repo/shared 的 PERMISSIONS，禁止裸字符串） */
  readonly permission: PermissionCode
  /** 只读工具默认注册；写入工具需 SHADOVA_ENABLE_WRITE_TOOLS 显式开启 */
  readonly kind: "read" | "write"
  readonly inputSchema: z.ZodRawShape
  /** 入参已由 MCP SDK 按 inputSchema 校验；client 用于发起后端请求 */
  readonly run: (args: Record<string, unknown>, client: ApiClient) => Promise<unknown>
}

/** 定义工具：把 inputSchema 与 run 的参数类型绑定后再擦除为 ToolDefinition */
export function defineTool<Shape extends z.ZodRawShape>(def: {
  name: string
  title: string
  description: string
  permission: PermissionCode
  kind: "read" | "write"
  inputSchema: Shape
  run: (args: z.infer<z.ZodObject<Shape>>, client: ApiClient) => Promise<unknown>
}): ToolDefinition {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    permission: def.permission,
    kind: def.kind,
    inputSchema: def.inputSchema,
    run: (args, client) => def.run(args as z.infer<z.ZodObject<Shape>>, client),
  }
}

/**
 * 按权限与开关筛选要注册的工具：
 * - 只读工具：默认注册
 * - 写入工具：仅当 enableWriteTools 为真时注册
 * - 两者都要求当前账号持有对应权限码（决定"AI 能看到什么"，最终裁决仍在后端）
 */
export function selectTools(
  tools: readonly ToolDefinition[],
  options: { hasPermission: (code: PermissionCode) => boolean; enableWriteTools: boolean },
): ToolDefinition[] {
  return tools.filter((tool) => {
    if (tool.kind === "write" && !options.enableWriteTools) return false
    return options.hasPermission(tool.permission)
  })
}
