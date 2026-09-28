import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type PortalMessagePageResult = components["schemas"]["PortalMessagePageResult"]
export type PortalMessageItem = components["schemas"]["PortalMessageItem"]

/** PATCH /api/portal/messages/{id} 请求体（openapi-typescript 生成类型，随契约自动同步） */
export type PortalMessageUpdateInput = NonNullable<
  paths["/api/portal/messages/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** 处理状态筛选项：空串表示不筛选 */
export type PortalMessageStatusFilter = "PENDING" | "HANDLED" | ""

/** 留言查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页/筛选变体失效重取 */
export const PORTAL_MESSAGES_QUERY_KEY = ["portal", "messages"] as const

/** 留言分页列表（可按处理状态与关键词筛选；queryKey ["portal","messages",page,pageSize,status,keyword]） */
export function usePortalMessagesQuery(
  page: number,
  pageSize: number,
  status: PortalMessageStatusFilter,
  keyword: string,
) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) params.set("status", status)
  if (keyword) params.set("keyword", keyword)
  return useQuery({
    queryKey: [...PORTAL_MESSAGES_QUERY_KEY, page, pageSize, status, keyword],
    queryFn: () => api<PortalMessagePageResult>(`/portal/messages?${params.toString()}`),
  })
}

/** 更新留言处理状态与内部备注（PATCH /api/portal/messages/{id}） */
export function useUpdatePortalMessageMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (input: { id: string; body: PortalMessageUpdateInput }) =>
      api<PortalMessageItem>(`/portal/messages/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_MESSAGES_QUERY_KEY })
      toast.success(t("messageUpdateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除留言（DELETE /api/portal/messages/{id}） */
export function useDeletePortalMessageMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/portal/messages/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_MESSAGES_QUERY_KEY })
      toast.success(t("messageDeleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
