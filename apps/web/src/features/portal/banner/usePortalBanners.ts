import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type PortalBannerPageResult = components["schemas"]["PortalBannerPageResult"]
export type PortalBannerItem = components["schemas"]["PortalBannerItem"]

/** POST /api/portal/banners 请求体（openapi-typescript 生成类型，随契约自动同步） */
export type PortalBannerCreateInput = NonNullable<
  paths["/api/portal/banners"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/portal/banners/{id} 请求体 */
export type PortalBannerUpdateInput = NonNullable<
  paths["/api/portal/banners/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** Banner 查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页变体失效重取 */
export const PORTAL_BANNERS_QUERY_KEY = ["portal", "banners"] as const

/** Banner 分页列表（queryKey ["portal","banners",page,pageSize]） */
export function usePortalBannersQuery(page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  return useQuery({
    queryKey: [...PORTAL_BANNERS_QUERY_KEY, page, pageSize],
    queryFn: () => api<PortalBannerPageResult>(`/portal/banners?${params.toString()}`),
  })
}

/** 创建 Banner（POST /api/portal/banners） */
export function useCreatePortalBannerMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (input: PortalBannerCreateInput) =>
      api<PortalBannerItem>("/portal/banners", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_BANNERS_QUERY_KEY })
      toast.success(t("bannerCreateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新 Banner（PATCH /api/portal/banners/{id}） */
export function useUpdatePortalBannerMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (input: { id: string; body: PortalBannerUpdateInput }) =>
      api<PortalBannerItem>(`/portal/banners/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_BANNERS_QUERY_KEY })
      toast.success(t("bannerUpdateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除 Banner（DELETE /api/portal/banners/{id}） */
export function useDeletePortalBannerMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/portal/banners/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_BANNERS_QUERY_KEY })
      toast.success(t("bannerDeleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
