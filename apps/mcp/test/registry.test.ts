import { describe, expect, it } from "vitest"
import { PERMISSIONS } from "@repo/shared"
import { allTools } from "../src/tools/index.js"
import { selectTools } from "../src/tools/registry.js"
import type { ToolDefinition } from "../src/tools/registry.js"

/** 写入工具替身：只用于验证写入开关与权限的叠加过滤 */
const stubWriteTool: ToolDefinition = {
  name: "stub_write",
  title: "写入替身",
  description: "仅用于验证写入开关，不对应任何真实能力",
  permission: PERMISSIONS.userQuery,
  kind: "write",
  inputSchema: {},
  run: () => Promise.resolve(null),
}

const readTools = allTools.filter((tool) => tool.kind === "read")

describe("selectTools（工具可见性过滤）", () => {
  it("权限齐备且未开启写入时，注册的恰好是全部只读工具", () => {
    const selected = selectTools(allTools, { hasPermission: () => true, enableWriteTools: false })
    expect(selected.map((tool) => tool.name)).toEqual(readTools.map((tool) => tool.name))
  })

  it("开启写入且权限齐备时，注册全部工具", () => {
    const selected = selectTools(allTools, { hasPermission: () => true, enableWriteTools: true })
    expect(selected).toHaveLength(allTools.length)
  })

  it("缺某个权限码时，依赖它的工具（可能多个）都不注册", () => {
    // 权限码是多对一的：例如 system:user:query 同时管 list_users 与 get_user
    const shared = PERMISSIONS.userQuery
    const selected = selectTools(allTools, {
      hasPermission: (code) => code !== shared,
      enableWriteTools: true,
    })
    const expected = allTools.filter((tool) => tool.permission !== shared)
    expect(selected.map((tool) => tool.name)).toEqual(expected.map((tool) => tool.name))
    expect(selected.length).toBeLessThan(allTools.length)
  })

  it("一个权限都没有时注册结果为空", () => {
    expect(selectTools(allTools, { hasPermission: () => false, enableWriteTools: true })).toEqual([])
  })

  it("写入工具默认不注册，开关打开且权限齐备才注册", () => {
    expect(selectTools([stubWriteTool], { hasPermission: () => true, enableWriteTools: false })).toEqual([])
    const enabled = selectTools([stubWriteTool], { hasPermission: () => true, enableWriteTools: true })
    expect(enabled.map((tool) => tool.name)).toEqual(["stub_write"])
  })

  it("写入工具即使开关打开，无权限仍不注册", () => {
    expect(selectTools([stubWriteTool], { hasPermission: () => false, enableWriteTools: true })).toEqual([])
  })
})

describe("工具清单", () => {
  it("与方案一致：只读 15 + 写入 8 = 23，名称唯一", () => {
    expect(readTools).toHaveLength(15)
    expect(allTools.filter((tool) => tool.kind === "write")).toHaveLength(8)
    expect(allTools).toHaveLength(23)
    expect(new Set(allTools.map((tool) => tool.name)).size).toBe(allTools.length)
  })

  it("每个工具都声明了权限码、标题、描述与可调用实现", () => {
    for (const tool of allTools) {
      // 权限码规范：模块:资源:操作
      expect(tool.permission.split(":"), tool.name).toHaveLength(3)
      expect(tool.title.length, tool.name).toBeGreaterThan(0)
      expect(tool.description.length, tool.name).toBeGreaterThan(10)
      expect(typeof tool.run, tool.name).toBe("function")
    }
  })

  it("不暴露任何删除类能力（只做增量更新的设计约定）", () => {
    expect(allTools.filter((tool) => tool.name.startsWith("delete_"))).toEqual([])
  })
})
