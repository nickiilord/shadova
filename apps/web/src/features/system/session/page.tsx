import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { MonitorIcon } from "lucide-react"

import { apiErrorMessage } from "@/api/client"
import { PageHeader } from "@/components/business/PageHeader"
import { Permission } from "@/components/business/Permission"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
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
import i18n from "@/localization/i18n"
import { useRevokeSessionMutation, useSessionsQuery, type SessionItem } from "./useSessions"

const PAGE_SIZE = 10

/** 后端返回 ISO 时间字符串；非法值原样展示（兜底，正常不会走到） */
function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(i18n.language === "zh" ? "zh-CN" : "en-US", { hour12: false })
}

/**
 * 会话管理页：分页表格展示在线会话（未吊销且未过期 refresh token）+ 关键词搜索 +
 * 强制下线（AlertDialog 确认 → DELETE 吊销该会话）；操作按钮由 <Permission> 按 system:session:revoke 门控。
 */
export default function SessionPage(): JSX.Element {
  const { t } = useTranslation("sessions")
  const { page, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [keywordInput, setKeywordInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [revokeSession, setRevokeSession] = useState<SessionItem | null>(null)
  const revokeMutation = useRevokeSessionMutation()

  const { data, isLoading, isError, error } = useSessionsQuery(page, PAGE_SIZE, keyword)
  const sessions = data?.list ?? []

  // 数据就绪后同步 totalPages（usePagination 内部在 totalPages 变小时自动钳制 page）。
  // 仅 data 存在时写入：切页瞬间新 query 处于 pending（data=undefined），若此时把 totalPages
  // 打成 1 会触发钳制把 page 拽回首页（真实竞态，测试曾复现）
  useEffect(() => {
    if (data) setTotalPages(Math.max(1, Math.ceil(data.total / PAGE_SIZE)))
  }, [data, setTotalPages])

  function applyKeyword(): void {
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  function gotoPage(pageNumber: number): void {
    setPage(pageNumber)
  }

  function confirmRevoke(): void {
    if (!revokeSession) return
    revokeMutation.mutate(revokeSession.id, { onSuccess: () => { setRevokeSession(null) } })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("desc")} />

      {/* 工具栏：用户名关键词搜索 */}
      <div className="flex items-center gap-2">
        <Input
          value={keywordInput}
          onChange={(event) => {
            setKeywordInput(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyKeyword()
          }}
          placeholder={t("searchPlaceholder")}
          className="h-9 w-64"
        />
        <Button variant="outline" type="button" onClick={applyKeyword} className="h-9">
          {t("search")}
        </Button>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error)}
        </p>
      ) : !isLoading && sessions.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <MonitorIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("noData")}</EmptyTitle>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_th]:text-muted-foreground [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("username")}</TableHead>
              <TableHead>{t("ip")}</TableHead>
              <TableHead>{t("browser")}</TableHead>
              <TableHead>{t("createdAt")}</TableHead>
              <TableHead>{t("expiresAt")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }, (_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 6 }, (_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{session.username}</TableCell>
                    <TableCell>{session.ip ?? "-"}</TableCell>
                    <TableCell>
                      {session.userAgent ? (
                        <span className="block max-w-56 truncate" title={session.userAgent}>
                          {session.userAgent}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(session.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(session.expiresAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Permission code={PERMISSIONS.sessionRevoke}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRevokeSession(session)
                            }}
                          >
                            {t("forceSignout")}
                          </Button>
                        </Permission>
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

      {revokeSession && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setRevokeSession(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("forceSignout")}</AlertDialogTitle>
              <AlertDialogDescription>{t("forceSignoutConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={confirmRevoke}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? t("revoking") : t("forceSignout")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
