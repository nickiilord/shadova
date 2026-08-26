import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { MegaphoneIcon } from "lucide-react"

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
import { AnnouncementFormDialog } from "./AnnouncementFormDialog"
import { useAnnouncementsQuery, useDeleteAnnouncementMutation } from "./useAnnouncements"
import type { AnnouncementItem } from "./useAnnouncements"

const PAGE_SIZE = 10

/**
 * 公告管理页：公告分页列表 + 新增/编辑 Dialog + 删除 AlertDialog。
 * 已发布（status=true）的公告在 Dashboard 顶部横幅展示（latest 接口，全员可见）。
 */
export default function AnnouncementPage(): JSX.Element {
  const { t } = useTranslation("announcement")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [formOpen, setFormOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementItem | null>(null)
  const [deleteAnnouncement, setDeleteAnnouncement] = useState<AnnouncementItem | null>(null)
  const deleteMutation = useDeleteAnnouncementMutation()

  const { data, isLoading, isError, error } = useAnnouncementsQuery(page, pageSize)
  const announcements = data?.list ?? []

  // 数据就绪后同步 totalPages（usePagination 内部在 totalPages 变小时自动钳制 page）
  useEffect(() => {
    if (data) setTotalPages(Math.max(1, Math.ceil(data.total / pageSize)))
  }, [data, pageSize, setTotalPages])

  function gotoPage(pageNumber: number): void {
    setPage(pageNumber)
  }

  function confirmDelete(): void {
    if (!deleteAnnouncement) return
    deleteMutation.mutate(deleteAnnouncement.id, { onSuccess: () => { setDeleteAnnouncement(null); } })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("desc")} />

      {/* 工具栏：操作按钮居右 */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Permission code={PERMISSIONS.announcementCreate}>
          <Button
            type="button"
            onClick={() => {
              setEditingAnnouncement(null)
              setFormOpen(true)
            }}
            className="h-9"
          >
            {t("addAnnouncement")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && announcements.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <MegaphoneIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyCreate")}</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_th]:text-muted-foreground [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("titleCol")}</TableHead>
              <TableHead>{t("contentCol")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("updatedAt")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
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
              : announcements.map((announcement) => (
                  <TableRow key={announcement.id}>
                    <TableCell>
                      <span className="block max-w-48 truncate font-medium" title={announcement.title}>
                        {announcement.title}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="block max-w-80 truncate text-muted-foreground"
                        title={announcement.content}
                      >
                        {announcement.content}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={announcement.status ? "default" : "secondary"}>
                        {announcement.status ? t("published") : t("unpublished")}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(announcement.updatedAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                <Permission code={PERMISSIONS.announcementUpdate}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingAnnouncement(announcement)
                              setFormOpen(true)
                            }}
                          >
                            {t("edit")}
                          </Button>
                        </Permission>
                <Permission code={PERMISSIONS.announcementDelete}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteAnnouncement(announcement)
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
                  if (page > 1) gotoPage(page - 1)
                }}
              />
            </PaginationItem>
            {totalPages > 7 ? (
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

      {formOpen && (
        <AnnouncementFormDialog
          announcement={editingAnnouncement}
          onClose={() => {
            setFormOpen(false)
            setEditingAnnouncement(null)
          }}
        />
      )}

      {deleteAnnouncement && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteAnnouncement(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteConfirm", { name: deleteAnnouncement.title })}
              </AlertDialogDescription>
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
