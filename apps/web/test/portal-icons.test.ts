import { describe, expect, it } from "vitest"
import { PORTAL_ICON_NAMES } from "@repo/shared"

import { ICON_CHOICES, PORTAL_ICON_CHOICES, iconByName } from "../src/lib/icons"

/**
 * 门户图标白名单一致性守护：PORTAL_ICON_NAMES（@repo/shared，管理端选择器 / API 校验 / portal 渲染
 * 三端唯一清单）必须是本应用 ICON_CHOICES 的子集——否则运营能选到 portal 侧渲染不出的图标，
 * 运行时只能静默降级为「无图标」，属于不报错的沉默故障。
 */
describe("portal 图标白名单", () => {
  it("PORTAL_ICON_NAMES 全部已在本应用图标表中注册", () => {
    const registered = new Set(ICON_CHOICES.map((choice) => choice.name))
    expect(PORTAL_ICON_NAMES.filter((name) => !registered.has(name))).toEqual([])
  })

  it("PORTAL_ICON_CHOICES 与清单同序等长，且每个都能解析出组件", () => {
    expect(PORTAL_ICON_CHOICES.map((choice) => choice.name)).toEqual([...PORTAL_ICON_NAMES])
    for (const name of PORTAL_ICON_NAMES) expect(iconByName(name)).not.toBeNull()
  })
})
