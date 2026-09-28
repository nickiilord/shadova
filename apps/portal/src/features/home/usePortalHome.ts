import { useMutation, useQuery } from "@tanstack/react-query"

import { api } from "@/api/client"
import type { components, paths } from "@/api/schema"

type PortalHome = components["schemas"]["PortalHome"]
type PortalMessageReceipt = components["schemas"]["PortalMessageReceipt"]

/** POST /api/portal/messages 请求体（openapi-typescript 生成类型，随契约自动同步） */
export type PortalMessageCreateInput = NonNullable<
  paths["/api/portal/messages"]["post"]["requestBody"]
>["content"]["application/json"]

/** 门户首页聚合数据（站点配置 + 启用区块 + 启用 Banner；公开接口，单次请求取齐首屏） */
export function usePortalHomeQuery() {
  return useQuery({
    queryKey: ["portal", "home"],
    queryFn: () => api<PortalHome>("/portal/home"),
  })
}

/** 访客留言提交（公开写接口，后端按来源 IP 限流：60 秒 1 条 + 每小时 10 条） */
export function useSubmitPortalMessageMutation() {
  return useMutation({
    mutationFn: (input: PortalMessageCreateInput) =>
      api<PortalMessageReceipt>("/portal/messages", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  })
}
