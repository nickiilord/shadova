import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiDownload, apiErrorMessage, apiFormData } from "@/api/client"
import type { components, paths } from "@/api/schema"
import { downloadBlob } from "@/lib/download"

type UserPageResult = components["schemas"]["UserPageResult"]
export type UserListItem = components["schemas"]["UserListItem"]
type UserDetail = components["schemas"]["UserDetail"]
export type UserCreateInput = NonNullable<
  paths["/api/users"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/users/{id} 请求体 */
export type UserUpdateInput = NonNullable<
  paths["/api/users/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** users 查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页/搜索变体失效重取 */
export const USERS_QUERY_KEY = ["users"] as const

/** 用户分页列表查询（queryKey ["users", page, pageSize, keyword]） */
export function useUsersQuery(page: number, pageSize: number, keyword: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (keyword) params.set("keyword", keyword)
  return useQuery({
    queryKey: [...USERS_QUERY_KEY, page, pageSize, keyword],
    queryFn: () => api<UserPageResult>(`/users?${params.toString()}`),
  })
}

/** 创建用户（POST /api/users） */
export function useCreateUserMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("users")
  return useMutation({
    mutationFn: (input: UserCreateInput) =>
      api<UserDetail>("/users", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success(t("createSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新用户（PATCH /api/users/{id}） */
export function useUpdateUserMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("users")
  return useMutation({
    mutationFn: (input: { id: string; body: UserUpdateInput }) =>
      api<UserDetail>(`/users/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success(t("updateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除用户（DELETE /api/users/{id}） */
export function useDeleteUserMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("users")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success(t("deleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

export function useResetPasswordMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("users")
  return useMutation({
    mutationFn: (id: string) => api<unknown>(`/users/${id}/reset-password`, { method: "POST" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }); toast.success(t("resetPasswordSuccess")) },
    onError: (error) => { toast.error(apiErrorMessage(error)) },
  })
}

/** 分配角色（PUT /api/users/{id}/roles，全量替换） */
export function useAssignRolesMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("users")
  return useMutation({
    mutationFn: (input: { id: string; roleIds: string[] }) =>
      api<UserDetail>(`/users/${input.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds: input.roleIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success(t("assignRolesSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

type ImportResult = components["schemas"]["ImportResult"]

/** 用户 CSV 导出（keyword 与列表一致；下载 users.csv） */
export function useExportUsersMutation(keyword: string) {
  const { t } = useTranslation("users")
  return useMutation({
    mutationFn: async () => {
      const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : ""
      return apiDownload(`/users/export${query}`)
    },
    onSuccess: (blob) => {
      downloadBlob(blob, "users.csv")
      toast.success(t("exportSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 用户 CSV 导入（multipart；返回成功/失败明细，由弹窗展示） */
export function useImportUsersMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("users")
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      return apiFormData<ImportResult>("/users/import", formData)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success(t("importDone"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
