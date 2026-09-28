import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { PORTAL_ICON_NAMES, type PortalIconName } from "@repo/shared"

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PORTAL_ICON_CHOICES, portalIconByName } from "@/lib/icons"
import { useCreatePortalSectionMutation, useUpdatePortalSectionMutation } from "./usePortalSections"
import type { PortalSectionCreateInput, PortalSectionItem, PortalSectionUpdateInput } from "./usePortalSections"

/**
 * 新增/编辑图文区块 Dialog（页面按条件挂载，每次打开全新初始化）：
 * - 新增：POST /api/portal/sections
 * - 编辑：PATCH /api/portal/sections/{id}（描述留空显式传 null 清空）
 * 图标选项来自 PORTAL_ICON_CHOICES（@repo/shared 的 PORTAL_ICON_NAMES ∩ 本应用已注册图标），
 * 空字符串表示不显示图标。
 */
export function SectionFormDialog({
  section,
  onClose,
}: {
  section?: PortalSectionItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("portal")
  const isEdit = Boolean(section)
  const createMutation = useCreatePortalSectionMutation()
  const updateMutation = useUpdatePortalSectionMutation()

  const [title, setTitle] = useState(section?.title ?? "")
  const [description, setDescription] = useState(section?.description ?? "")
  // 接口返回的 icon 是普通字符串：经清单筛选收窄为 PortalIconName（值域外的一律视为未设置）
  const [icon, setIcon] = useState<PortalIconName | null>(
    PORTAL_ICON_NAMES.find((name) => name === section?.icon) ?? null,
  )
  const [sort, setSort] = useState(String(section?.sort ?? 0))
  const [status, setStatus] = useState(section?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!title.trim()) {
      setError(t("sectionNameRequired"))
      return
    }
    setError(null)
    const sortValue = Number.isFinite(Number(sort)) ? Number(sort) : 0
    if (isEdit && section) {
      const body: PortalSectionUpdateInput = {
        title: title.trim(),
        description: description.trim() === "" ? null : description.trim(),
        icon,
        sort: sortValue,
        status,
      }
      updateMutation.mutate({ id: section.id, body }, { onSuccess: () => { onClose() } })
    } else {
      const body: PortalSectionCreateInput = { title: title.trim(), sort: sortValue, status }
      if (description.trim()) body.description = description.trim()
      if (icon !== null) body.icon = icon
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
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{isEdit ? t("editDesc") : t("createDesc")}</DialogDescription>
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
                <FieldLabel htmlFor="portal-section-title">{t("sectionNameLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="portal-section-title"
                    maxLength={64}
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value)
                    }}
                    placeholder={t("sectionNamePlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-section-description">{t("sectionDescLabel")}</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="portal-section-description"
                    maxLength={1000}
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value)
                    }}
                    placeholder={t("sectionDescPlaceholder")}
                    rows={3}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-section-icon">{t("sectionIcon")}</FieldLabel>
                <FieldContent>
                  <Select
                    value={icon ?? ""}
                    onValueChange={(value) => {
                      setIcon(PORTAL_ICON_NAMES.find((name) => name === value) ?? null)
                    }}
                  >
                    <SelectTrigger id="portal-section-icon" className="w-full">
                      {/* Base UI 的 Select.Value 不会可靠地提取 item label（会回退显示 value），显式映射 */}
                      <SelectValue>
                        {(value) => {
                          const name = typeof value === "string" && value !== "" ? value : null
                          const Icon = portalIconByName(name)
                          return (
                            <span className="flex items-center gap-2">
                              {Icon !== null && <Icon className="size-4" />}
                              {name ?? t("sectionIconNone")}
                            </span>
                          )
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("sectionIconNone")}</SelectItem>
                      {PORTAL_ICON_CHOICES.map(({ name, icon: Icon }) => (
                        <SelectItem key={name} value={name}>
                          <span className="flex items-center gap-2">
                            <Icon className="size-4" />
                            {name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>{t("sectionIconHint", { count: PORTAL_ICON_NAMES.length })}</FieldDescription>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-section-sort">{t("sectionSortLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="portal-section-sort"
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
                <Switch id="portal-section-status" checked={status} onCheckedChange={setStatus} />
                <FieldLabel htmlFor="portal-section-status">{t("sectionStatusLabel")}</FieldLabel>
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
