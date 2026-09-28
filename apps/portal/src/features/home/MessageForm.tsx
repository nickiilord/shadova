import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useSubmitPortalMessageMutation } from "./usePortalHome"

/**
 * 访客留言表单：公开提交（无需登录），成功后清空并提示。
 * 字段上限与后端 zod 校验一致（姓名 64 / 联系方式 191 / 内容 1000）。
 */
export function MessageForm(): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [contact, setContact] = useState("")
  const [content, setContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const submitMutation = useSubmitPortalMessageMutation()
  const pending = submitMutation.isPending

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!name.trim()) {
      setError(t("messageNameRequired"))
      return
    }
    if (!contact.trim()) {
      setError(t("messageContactRequired"))
      return
    }
    if (!content.trim()) {
      setError(t("messageContentRequired"))
      return
    }
    setError(null)
    submitMutation.mutate(
      { name: name.trim(), contact: contact.trim(), content: content.trim() },
      {
        onSuccess: () => {
          setName("")
          setContact("")
          setContent("")
          toast.success(t("messageSuccess"))
        },
        onError: (mutationError) => {
          // 限流是公开写接口的预期结果，按错误码给出可读提示；其余透传后端文案
          toast.error(
            mutationError instanceof ApiError && mutationError.code === "RATE_LIMITED"
              ? t("messageRatelimited")
              : mutationError.message,
          )
        },
      },
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="portal-message-name">{t("messageName")}</FieldLabel>
          <FieldContent>
            <Input
              id="portal-message-name"
              value={name}
              maxLength={64}
              onChange={(event) => {
                setName(event.target.value)
              }}
              placeholder={t("messageNamePlaceholder")}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="portal-message-contact">{t("messageContact")}</FieldLabel>
          <FieldContent>
            <Input
              id="portal-message-contact"
              value={contact}
              maxLength={191}
              onChange={(event) => {
                setContact(event.target.value)
              }}
              placeholder={t("messageContactPlaceholder")}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="portal-message-content">{t("messageContent")}</FieldLabel>
          <FieldContent>
            <Textarea
              id="portal-message-content"
              value={content}
              maxLength={1000}
              rows={5}
              onChange={(event) => {
                setContent(event.target.value)
              }}
              placeholder={t("messageContentPlaceholder")}
            />
          </FieldContent>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t("messageSubmitting") : t("messageSubmit")}
      </Button>
    </form>
  )
}
