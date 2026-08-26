import { describe, expect, it } from "vitest"
import { collectSubtreeIds } from "../src/tree.js"

describe("collectSubtreeIds", () => {
  it("包含根节点及全部后代，不包含其他分支", () => {
    const nodes = [
      { id: "root", parentId: null },
      { id: "a", parentId: "root" },
      { id: "b", parentId: "root" },
      { id: "a1", parentId: "a" },
      { id: "other", parentId: null },
    ]
    expect(collectSubtreeIds(nodes, "root")).toEqual(new Set(["root", "a", "b", "a1"]))
  })

  it("根节点不存在时返回以目标 id 为起点的集合", () => {
    expect(collectSubtreeIds([], "missing")).toEqual(new Set(["missing"]))
  })

  it("脏数据形成环时仍然终止并去重", () => {
    const nodes = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ]
    expect(collectSubtreeIds(nodes, "a")).toEqual(new Set(["a", "b"]))
  })
})
