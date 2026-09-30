import { z } from "zod"

/** 分页默认值（与后端 zod 默认一致） */
const DEFAULT_PAGE_SIZE = 10

/** 分页字段的 zod shape 片段：各列表工具展开复用，保证参数名与描述一致 */
export const pageShape = {
  page: z.number().int().min(1).optional().describe("页码，默认 1"),
  pageSize: z.number().int().min(1).max(100).optional().describe("每页条数，默认 10（上限 100）"),
}

/**
 * 组装分页查询串；keyword 仅在非空时附加（后端对空串不做筛选，传空串等价于不传）。
 * 参数显式允许 undefined：exactOptionalPropertyTypes 下 `{ page: number | undefined }` 不能传给 `{ page?: number }`。
 */
export function pageQuery(input: {
  page?: number | undefined
  pageSize?: number | undefined
  keyword?: string | undefined
}): string {
  const params = new URLSearchParams()
  params.set("page", String(input.page ?? 1))
  params.set("pageSize", String(input.pageSize ?? DEFAULT_PAGE_SIZE))
  if (input.keyword !== undefined && input.keyword !== "") params.set("keyword", input.keyword)
  return params.toString()
}
