import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import type { UserListItem } from "./useUsers"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function UserDetailDialog({ user, onClose }: { user: UserListItem; onClose: () => void }): JSX.Element {
  const { t } = useTranslation("users")
  const rows = [
    [t("username"), user.username], [t("nickname"), user.nickname],
    [t("email"), user.email ?? "-"], [t("telephone"), user.telephone ?? "-"],
    [t("department"), user.department?.nameZh ?? "-"],
    [t("status"), user.status ? t("enabled") : t("disabled")],
    [t("roles"), user.roles.map((role) => role.nameZh).join(", ") || "-"],
    [t("createdAt"), new Date(user.createdAt).toLocaleString()],
  ]
  return <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}><DialogContent><DialogHeader><DialogTitle>{t("detail")}</DialogTitle><DialogDescription>{user.username}</DialogDescription></DialogHeader><dl className="grid gap-3 text-sm">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[110px_1fr] gap-3"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl></DialogContent></Dialog>
}
