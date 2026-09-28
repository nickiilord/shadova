import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

/** 站点配置 DTO（openapi-typescript 生成类型，随契约自动同步；页面表单直接复用它） */
export type PortalSite = components["schemas"]["PortalSite"]

/** PUT /api/portal/site 请求体（openapi-typescript 生成类型，随契约自动同步） */
export type PortalSiteUpdateInput = NonNullable<
  paths["/api/portal/site"]["put"]["requestBody"]
>["content"]["application/json"]

/** 站点配置查询 key（保存成功后 invalidate 即失效重取） */
export const PORTAL_SITE_QUERY_KEY = ["portal", "site"] as const

/** 站点配置查询：公开首页同源的读接口，管理端读取需 portal:site:query */
export function usePortalSiteQuery() {
  return useQuery({
    queryKey: PORTAL_SITE_QUERY_KEY,
    queryFn: () => api<PortalSite>("/portal/site"),
  })
}

/** 保存站点配置（PUT /api/portal/site：单行 upsert，未提交字段保持原值） */
export function useSavePortalSiteMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("portal")
  return useMutation({
    mutationFn: (input: PortalSiteUpdateInput) =>
      api<PortalSite>("/portal/site", { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_SITE_QUERY_KEY })
      toast.success(t("siteSaveSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
