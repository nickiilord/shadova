import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { MessageSquareIcon } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePagination } from "@/hooks/usePagination"
import { formatDateTime } from "@/lib/datetime"
import { MessageHandleDialog } from "./MessageHandleDialog"
import { useDeletePortalMessageMutation, usePortalMessagesQuery } from "./usePortalMessages"
import type { PortalMessageItem, PortalMessageStatusFilter } from "./usePortalMessages"

const PAGE_SIZE = 10

/**
 * 留言反馈页：访客留言的分页列表（按处理状态与关键词筛选）+ 处理 Dialog + 删除确认。
 * 留言由访客在门户首页提交（公开接口），管理端只做收单与状态流转，无新增入口。
 */
export default function PortalMessagePage(): JSX.Element {
  const { t } = useTranslation("portal")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [status, setStatus] = useState<PortalMessageStatusFilter>("")
  const [keywordInput, setKeywordInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [handlingMessage, setHandlingMessage] = useState<PortalMessageItem | null>(null)
  const [deleteMessage, setDeleteMessage] = useState<PortalMessageItem | null>(null)
  const deleteMutation = useDeletePortalMessageMutation()

  const { data, isLoading, isError, error } = usePortalMessagesQuery(page, pageSize, status, keyword)
  const messages = data?.list ?? []

  useEffect(() => {
    if (data) setTotalPages(Math.max(1, Math.ceil(data.total / pageSize)))
  }, [data, pageSize, setTotalPages])

  function applyKeyword(): void {
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  function changeStatus(value: string | null): void {
    // Base UI Select 的 value 可为 null（清空）；值域外的取值一律回落到「全部」
    setStatus(value === "PENDING" || value === "HANDLED" ? value : "")
    setPage(1)
  }

  function confirmDelete(): void {
    if (!deleteMessage) return
    deleteMutation.mutate(deleteMessage.id, {
      onSuccess: () => {
        setDeleteMessage(null)
      },
    })
  }

  const filtered = status !== "" || keyword !== ""

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("messageTitle")} description={t("messageDesc")} />

      {/* 工具栏：状态筛选 + 关键词搜索居左 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={changeStatus}>
          <SelectTrigger className="h-9 w-40">
            {/* Base UI 的 Select.Value 不会可靠地提取 item label（会回退显示 value），显式映射 */}
            <SelectValue>
              {(value) =>
                value === "PENDING"
                  ? t("messagePending")
                  : value === "HANDLED"
                    ? t("messageHandled")
                    : t("messageAll")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("messageAll")}</SelectItem>
            <SelectItem value="PENDING">{t("messagePending")}</SelectItem>
            <SelectItem value="HANDLED">{t("messageHandled")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={keywordInput}
          onChange={(event) => {
            setKeywordInput(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyKeyword()
          }}
          placeholder={t("messageSearchPlaceholder")}
          className="h-9 w-64"
        />
        <Button variant="outline" type="button" onClick={applyKeyword} className="h-9">
          {t("search")}
        </Button>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && messages.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <MessageSquareIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("messageEmptyTitle")}</EmptyTitle>
            <EmptyDescription>{filtered ? t("messageEmptyFiltered") : t("messageEmptyCreate")}</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">{t("messageName")}</TableHead>
              <TableHead className="w-48">{t("messageContact")}</TableHead>
              <TableHead>{t("messageContent")}</TableHead>
              <TableHead className="w-24">{t("messageStatus")}</TableHead>
              <TableHead className="w-44">{t("messageCreatedAt")}</TableHead>
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
              : messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-medium">{message.name}</TableCell>
                    <TableCell>{message.contact}</TableCell>
                    <TableCell>
                      <span className="block max-w-72 truncate" title={message.content}>
                        {message.content}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={message.status === "HANDLED" ? "default" : "secondary"}>
                        {message.status === "HANDLED" ? t("messageHandled") : t("messagePending")}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(message.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Permission code={PERMISSIONS.portalMessageUpdate}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setHandlingMessage(message)
                            }}
                          >
                            {t("handle")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.portalMessageDelete}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteMessage(message)
                            }}
                          >
                            {t("delete")}
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
                  if (page > 1) setPage(page - 1)
                }}
              />
            </PaginationItem>
            {totalPages > 7 ? (
              // 页数过多时截断为「首页 + 省略号 + 末页」（prev/next 仍可逐页翻），避免渲染上百个页码链接
              <>
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive={page === 1}
                    onClick={(event) => {
                      event.preventDefault()
                      setPage(1)
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
                      setPage(totalPages)
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
                      setPage(pageNumber)
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
                  if (page < totalPages) setPage(page + 1)
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {handlingMessage && (
        <MessageHandleDialog
          message={handlingMessage}
          onClose={() => {
            setHandlingMessage(null)
          }}
        />
      )}

      {deleteMessage && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteMessage(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("messageDeleteConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? t("deleting") : t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
