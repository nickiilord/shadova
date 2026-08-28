import { useState } from "react"
import type { ChangeEvent, JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { UploadIcon, UserRoundIcon } from "lucide-react"

import { api, apiErrorMessage, apiFormData } from "@/api/client"
import type { components, paths } from "@/api/schema"
import { avatarUrl } from "@/lib/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ME_QUERY_KEY } from "@/router/guards"

/** PATCH /api/users/me 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
type MeUpdateInput = NonNullable<
  paths["/api/users/me"]["patch"]["requestBody"]
>["content"]["application/json"]

/**
 * 用户设置弹窗：登录人修改自己的个人资料（昵称/邮箱/手机号）。
 * - 邮箱/手机号留空 = 清空（后端 null 语义）；唯一冲突 409 直接展示
 * - 保存成功后失效 me 缓存（侧边栏昵称/用户菜单信息同步刷新）
 */
export function ProfileDialog({
  user,
  onClose,
}: {
  user: components["schemas"]["UserPublic"]
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("users")
  const queryClient = useQueryClient()
  const [nickname, setNickname] = useState(user.nickname)
  const [email, setEmail] = useState(user.email ?? "")
  const [telephone, setTelephone] = useState(user.telephone ?? "")
  // 新头像：选中文件后立即上传得服务端文件名 + 本地预览 URL；removeAvatar 标记移除旧头像
  const [avatarFile, setAvatarFile] = useState<{ filename: string; preview: string } | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  /** 选择头像文件：立即上传（POST /api/files）→ 暂存文件名供保存时提交 */
  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = "" // 允许重复选择同一文件
    if (!file) return
    setUploadingAvatar(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const detail = await apiFormData<{ filename: string; size: number; mimeType: string }>(
        "/files",
        formData,
      )
      setAvatarFile({ filename: detail.filename, preview: URL.createObjectURL(file) })
      setRemoveAvatar(false)
    } catch (err: unknown) {
      setError(apiErrorMessage(err))
    } finally {
      setUploadingAvatar(false)
    }
  }

  /** 当前头像展示：新选文件本地预览 > 移除标记时为空 > 已保存头像 URL */
  const currentAvatarSrc =
    avatarFile?.preview ?? (removeAvatar ? null : avatarUrl(user.avatar))

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!nickname.trim()) {
      setError(t("nicknameRequired"))
      return
    }
    setError(null)
    setPending(true)
    const body: MeUpdateInput = {
      nickname: nickname.trim(),
      email: email.trim() === "" ? null : email.trim(),
      telephone: telephone.trim() === "" ? null : telephone.trim(),
    }
    // 头像变更：移除 → null；新上传 → 文件名；未操作 → 不传（undefined 不修改）
    if (removeAvatar) body.avatar = null
    else if (avatarFile) body.avatar = avatarFile.filename
    try {
      await api<unknown>("/users/me", { method: "PATCH", body: JSON.stringify(body) })
      toast.success(t("profileUpdated"))
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      onClose()
    } catch (err: unknown) {
      setError(apiErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("userSettings")}</DialogTitle>
          <DialogDescription>{t("profileDesc")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => { void handleSubmit(event) }}>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* 头像区：预览 + 上传/移除（上传即时完成，保存时随个人资料提交） */}
          <div className="flex items-center gap-4">
            {currentAvatarSrc ? (
              <img
                src={currentAvatarSrc}
                alt={t("avatar")}
                className="size-14 rounded-full border object-cover"
              />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                <UserRoundIcon className="size-6" />
              </div>
            )}
            <div className="flex gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent">
                <UploadIcon className="size-4" />
                {uploadingAvatar ? t("avatarUploading") : t("avatarUpload")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={(event) => { void handleAvatarChange(event) }}
                />
              </label>
              {(avatarFile ?? user.avatar) && !removeAvatar && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={uploadingAvatar}
                  onClick={() => {
                    setRemoveAvatar(true)
                    setAvatarFile(null)
                  }}
                >
                  {t("avatarRemove")}
                </Button>
              )}
            </div>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-nickname">{t("nickname")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-nickname"
                  value={nickname}
                  onChange={(event) => {
                    setNickname(event.target.value)
                  }}
                  placeholder={t("nicknamePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">{t("email")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                  placeholder="name@example.com"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-telephone">{t("telephone")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-telephone"
                  value={telephone}
                  onChange={(event) => {
                    setTelephone(event.target.value)
                  }}
                  placeholder="13800138000"
                />
              </FieldContent>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
              className="h-9"
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="h-9">
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}
