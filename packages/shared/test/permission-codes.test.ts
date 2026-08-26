import { describe, expect, it } from "vitest"
import { PERMISSIONS } from "../src/permission-codes.js"

describe("PERMISSIONS", () => {
  it("所有权限码唯一且符合模块:资源:操作格式", () => {
    const codes = Object.values(PERMISSIONS)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[a-z-]+:[a-z-]+:[a-z-]+$/)
  })
})
