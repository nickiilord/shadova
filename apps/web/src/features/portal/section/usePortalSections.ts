import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type PortalSectionPageResult = components["schemas"]["PortalSectionPageResult"]
export type PortalSectionItem = components["schemas"]["PortalSectionItem"]

/** POST /api/portal/sections 请求体（openapi-typescript 生成类型，随契约自动同步） */
export type PortalSectionCreateInput = NonNullable<
  paths["/api/portal/sections"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/portal/sections/{id} 请求体 */
export type PortalSectionUpdateInput = NonNullable<
  paths["/api/portal/sections/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** 区块查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页变体失效重取 */
export const PORTAL_SECTIONS_QUERY_KEY = ["portal", "sections"] as const

/** 图文区块分页列表（queryKey ["portal","sections",page,pageSize]） */
export function usePortalSectionsQuery(page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  return useQuery({
    queryKey: [...PORTAL_SECTIONS_QUERY_KEY, page, pageSize],
    queryFn: () => api<PortalSectionPageResult>(`/portal/sections?${params.toString()}`),
  })
}

/** 创建图文区块（POST /api/portal/sections） */
export function useCreatePortalSectionMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (input: PortalSectionCreateInput) =>
      api<PortalSectionItem>("/portal/sections", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_SECTIONS_QUERY_KEY })
      toast.success(t("sectionCreateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新图文区块（PATCH /api/portal/sections/{id}） */
export function useUpdatePortalSectionMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (input: { id: string; body: PortalSectionUpdateInput }) =>
      api<PortalSectionItem>(`/portal/sections/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_SECTIONS_QUERY_KEY })
      toast.success(t("sectionUpdateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除图文区块（DELETE /api/portal/sections/{id}） */
export function useDeletePortalSectionMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/portal/sections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_SECTIONS_QUERY_KEY })
      toast.success(t("sectionDeleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
