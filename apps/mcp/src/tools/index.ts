import { dictTools } from "./dicts.js"
import { menuTools } from "./menus.js"
import { portalTools } from "./portal.js"
import type { ToolDefinition } from "./registry.js"
import { roleTools } from "./roles.js"
import { systemTools } from "./system.js"
import { userTools } from "./users.js"
import { writeTools } from "./writes.js"

/**
 * 全部工具（只读 15 + 写入 8）。注册顺序即 LLM 看到的顺序：先认识对象、再查运行数据、最后变更。
 * 写入工具是否真正注册由 SHADOVA_ENABLE_WRITE_TOOLS 决定（见 registry.ts 的 selectTools）。
 */
export const allTools: readonly ToolDefinition[] = [
  ...userTools,
  ...roleTools,
  ...menuTools,
  ...dictTools,
  ...systemTools,
  ...portalTools,
  ...writeTools,
]
