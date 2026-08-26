import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { BellIcon, CheckCheckIcon, SendIcon } from "lucide-react"

import { PageHeader } from "@/components/business/PageHeader"
import { Permission } from "@/components/business/Permission"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePagination } from "@/hooks/usePagination"
import { cn } from "@/lib/utils"
import i18n from "@/localization/i18n"
import { SendNotificationDialog } from "./SendNotificationDialog"
import {
  useNotificationsQuery,
  useReadAllNotificationsMutation,
  useReadNotificationMutation,
} from "./useNotifications"

const PAGE_SIZE = 10

/** 时间展示跟随界面语言（zh-CN / en-US，24 小时制）；无效日期显示 "-" */
function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString(i18n.language === "zh" ? "zh-CN" : "en-US", { hour12: false })
}

/**
 * 通知中心页：我的站内通知分页列表 + 单条已读 / 全部已读 + 发送通知（管理员，权限码门控）。
 * 列表接口为个人数据（仅登录即可访问），无查询权限码；发送按钮由 system:notification:create 门控。
 */
export default function NotificationPage(): JSX.Element {
  const { t } = useTranslation("notifications")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [sendOpen, setSendOpen] = useState(false)
  const readMutation = useReadNotificationMutation()
  const readAllMutation = useReadAllNotificationsMutation()

  const { data, isLoading, isError, error } = useNotificationsQuery(page, pageSize)
  const notifications = data?.list ?? []

  // 数据就绪后同步 totalPages（usePagination 内部在 totalPages 变小时自动钳制 page）
  useEffect(() => {
    if (data) setTotalPages(Math.max(1, Math.ceil(data.total / pageSize)))
  }, [data, pageSize, setTotalPages])

  function gotoPage(pageNumber: number): void {
    setPage(pageNumber)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("desc")} />

      {/* 工具栏：全部已读 + 发送通知（权限码门控） */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            readAllMutation.mutate()
          }}
          disabled={readAllMutation.isPending || notifications.every((item) => item.isRead)}
          className="h-9"
        >
          <CheckCheckIcon />
          {t("markAllRead")}
        </Button>
        <Permission code={PERMISSIONS.notificationCreate}>
          <Button
            type="button"
            onClick={() => {
              setSendOpen(true)
            }}
            className="h-9"
          >
            <SendIcon />
            {t("sendNotification")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && notifications.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <BellIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDesc")}</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_th]:text-muted-foreground [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("titleCol")}</TableHead>
              <TableHead>{t("contentCol")}</TableHead>
              <TableHead>{t("statusCol")}</TableHead>
              <TableHead>{t("timeCol")}</TableHead>
              <TableHead className="text-right">{t("actionsCol")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }, (_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 5 }, (_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : notifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {/* 未读指示圆点：仅未读显示 */}
                        {!notification.isRead && (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                        <span
                          className={cn(
                            "block max-w-52 truncate",
                            !notification.isRead && "font-medium",
                          )}
                          title={notification.title}
                        >
                          {notification.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className="block max-w-72 truncate text-muted-foreground"
                        title={notification.content}
                      >
                        {notification.content}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={notification.isRead ? "secondary" : "default"}>
                        {notification.isRead ? t("read") : t("unread")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(notification.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {!notification.isRead && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              readMutation.mutate(notification.id)
                            }}
                          >
                            {t("markRead")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                text={t("previous")}
                aria-label={t("previous")}
                onClick={(event) => {
                  event.preventDefault()
                  if (page > 1) gotoPage(page - 1)
                }}
              />
            </PaginationItem>
            {totalPages > 7 ? (
              // 页数过多截断：首页 + 省略号 + 末页（简单实现，prev/next 仍可翻页）
              <>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive={page === 1}
                    onClick={(event) => {
                      event.preventDefault()
                      gotoPage(1)
                    }}
                  >
                    1
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive={page === totalPages}
                    onClick={(event) => {
                      event.preventDefault()
                      gotoPage(totalPages)
                    }}
                  >
                    {totalPages}
                  </PaginationLink>
                </PaginationItem>
              </>
            ) : (
              Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    href="#"
                    isActive={pageNumber === page}
                    onClick={(event) => {
                      event.preventDefault()
                      gotoPage(pageNumber)
                    }}
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ))
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                text={t("next")}
                aria-label={t("next")}
                onClick={(event) => {
                  event.preventDefault()
                  if (page < totalPages) gotoPage(page + 1)
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {sendOpen && (
        <SendNotificationDialog
          onClose={() => {
            setSendOpen(false)
          }}
        />
      )}
    </div>
  )
}
