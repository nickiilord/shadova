import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useCreatePortalBannerMutation, useUpdatePortalBannerMutation } from "./usePortalBanners"
import type { PortalBannerCreateInput, PortalBannerItem, PortalBannerUpdateInput } from "./usePortalBanners"

/**
 * 新增/编辑 Banner Dialog（页面按条件挂载，每次打开全新初始化）：
 * - 新增：POST /api/portal/banners
 * - 编辑：PATCH /api/portal/banners/{id}（跳转链接留空显式传 null 清空）
 * 图片为外链地址，不经服务端存储（门户公开访问，不引入公开文件链路）。
 */
export function BannerFormDialog({
  banner,
  onClose,
}: {
  banner?: PortalBannerItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("portal")
  const isEdit = Boolean(banner)
  const createMutation = useCreatePortalBannerMutation()
  const updateMutation = useUpdatePortalBannerMutation()

  const [title, setTitle] = useState(banner?.title ?? "")
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "")
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "")
  const [sort, setSort] = useState(String(banner?.sort ?? 0))
  const [status, setStatus] = useState(banner?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!title.trim()) {
      setError(t("bannerTitleRequired"))
      return
    }
    if (!imageUrl.trim()) {
      setError(t("bannerImageRequired"))
      return
    }
    setError(null)
    const sortValue = Number.isFinite(Number(sort)) ? Number(sort) : 0
    if (isEdit && banner) {
      const body: PortalBannerUpdateInput = {
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        linkUrl: linkUrl.trim() === "" ? null : linkUrl.trim(),
        sort: sortValue,
        status,
      }
      updateMutation.mutate({ id: banner.id, body }, { onSuccess: () => { onClose() } })
    } else {
      const body: PortalBannerCreateInput = {
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        sort: sortValue,
        status,
      }
      if (linkUrl.trim()) body.linkUrl = linkUrl.trim()
      createMutation.mutate(body, { onSuccess: () => { onClose() } })
    }
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("bannerEditTitle") : t("bannerCreateTitle")}</DialogTitle>
          <DialogDescription>{isEdit ? t("bannerEditDesc") : t("bannerCreateDesc")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="-mx-4 max-h-[50vh] overflow-y-auto px-4 no-scrollbar">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {mutationError && (
              <p role="alert" className="text-sm text-destructive">
                {mutationError.message}
              </p>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="portal-banner-title">{t("bannerTitleLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="portal-banner-title"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value)
                    }}
                    placeholder={t("bannerTitlePlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-banner-image">{t("bannerImageLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="portal-banner-image"
                    value={imageUrl}
                    onChange={(event) => {
                      setImageUrl(event.target.value)
                    }}
                    placeholder={t("bannerImagePlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-banner-link">{t("bannerLinkLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="portal-banner-link"
                    value={linkUrl}
                    onChange={(event) => {
                      setLinkUrl(event.target.value)
                    }}
                    placeholder={t("bannerLinkPlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-banner-sort">{t("bannerSortLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="portal-banner-sort"
                    type="number"
                    min={0}
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value)
                    }}
                  />
                  <FieldDescription>{t("sectionSortHint")}</FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal" className="gap-2">
                <Switch id="portal-banner-status" checked={status} onCheckedChange={setStatus} />
                <FieldLabel htmlFor="portal-banner-status">{t("bannerStatusLabel")}</FieldLabel>
              </Field>
            </FieldGroup>
          </div>
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
  )
}
