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
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/datetime"
import { useUpdatePortalMessageMutation } from "./usePortalMessages"
import type { PortalMessageItem } from "./usePortalMessages"

/**
 * 留言详情与处理 Dialog：只读展示访客留言，管理员更新处理状态与内部备注。
 * 状态流转（PENDING ↔ HANDLED）由后端同步维护 handledAt，前端不提交时间字段。
 */
export function MessageHandleDialog({
  message,
  onClose,
}: {
  message: PortalMessageItem
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("portal")
  const updateMutation = useUpdatePortalMessageMutation()
  const [status, setStatus] = useState<"PENDING" | "HANDLED">(
    message.status === "HANDLED" ? "HANDLED" : "PENDING",
  )
  const [remark, setRemark] = useState(message.remark ?? "")

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    updateMutation.mutate(
      {
        id: message.id,
        body: {
          status,
          // 留空显式传 null 清空（PATCH 语义，与其它表单一致）
          remark: remark.trim() === "" ? null : remark.trim(),
        },
      },
      { onSuccess: () => { onClose() } },
    )
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
          <DialogTitle>{t("detailTitle")}</DialogTitle>
          <DialogDescription>{t("detailDesc")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="-mx-4 max-h-[50vh] overflow-y-auto px-4 no-scrollbar">
            {updateMutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {updateMutation.error.message}
              </p>
            )}
            <dl className="mb-4 flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t("messageName")}</dt>
                <dd className="font-medium">{message.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t("messageContact")}</dt>
                <dd className="font-medium">{message.contact}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t("messageCreatedAt")}</dt>
                <dd>{formatDateTime(message.createdAt)}</dd>
              </div>
              {message.handledAt && (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">{t("detailHandledAt")}</dt>
                  <dd>{formatDateTime(message.handledAt)}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t("messageContent")}</dt>
                <dd className="whitespace-pre-wrap break-words">{message.content}</dd>
              </div>
            </dl>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="portal-message-status">{t("detailStatusLabel")}</FieldLabel>
                <FieldContent>
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      setStatus(value === "HANDLED" ? "HANDLED" : "PENDING")
                    }}
                  >
                    <SelectTrigger id="portal-message-status" className="w-full">
                      {/* Base UI 的 Select.Value 不会可靠地提取 item label（会回退显示 value），显式映射 */}
                      <SelectValue>
                        {(value) => (value === "HANDLED" ? t("messageHandled") : t("messagePending"))}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">{t("messagePending")}</SelectItem>
                      <SelectItem value="HANDLED">{t("messageHandled")}</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-message-remark">{t("detailRemarkLabel")}</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="portal-message-remark"
                    value={remark}
                    onChange={(event) => {
                      setRemark(event.target.value)
                    }}
                    placeholder={t("detailRemarkPlaceholder")}
                    rows={3}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="h-9"
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending} className="h-9">
              {updateMutation.isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
