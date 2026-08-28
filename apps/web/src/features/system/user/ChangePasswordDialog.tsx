import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/api/client"
import { useAuth } from "@/auth/AuthProvider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ChangePasswordDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation("users")
  const auth = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (newPassword.length < 8) { setError(t("passwordMinLength")); return }
    setError(null); setPending(true)
    try {
      await api<unknown>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) })
      await auth.logout(); toast.success(t("passwordChangedReLogin")); void navigate("/login")
    } catch (err: unknown) { setError(apiErrorMessage(err)); setPending(false) }
  }
  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("changePassword")}</DialogTitle><DialogDescription>{t("changePasswordDesc")}</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => { void handleSubmit(event) }}>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <FieldGroup>
            <Field><FieldLabel htmlFor="change-current-password">{t("currentPassword")}</FieldLabel><FieldContent><Input id="change-current-password" type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); }} autoComplete="current-password" /></FieldContent></Field>
            <Field><FieldLabel htmlFor="change-new-password">{t("newPassword")}</FieldLabel><FieldContent><Input id="change-new-password" type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); }} autoComplete="new-password" /></FieldContent></Field>
          </FieldGroup>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={pending}>{t("cancel")}</Button><Button type="submit" disabled={pending}>{pending ? t("saving") : t("save")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
