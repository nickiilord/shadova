import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { ImageIcon } from "lucide-react"

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePagination } from "@/hooks/usePagination"
import { BannerFormDialog } from "./BannerFormDialog"
import { useDeletePortalBannerMutation, usePortalBannersQuery } from "./usePortalBanners"
import type { PortalBannerItem } from "./usePortalBanners"

const PAGE_SIZE = 10

/** Banner 管理页：门户首页轮播图的分页列表 + 新增/编辑 Dialog + 删除确认 */
export default function PortalBannerPage(): JSX.Element {
  const { t } = useTranslation("portal")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [formOpen, setFormOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState<PortalBannerItem | null>(null)
  const [deleteBanner, setDeleteBanner] = useState<PortalBannerItem | null>(null)
  const deleteMutation = useDeletePortalBannerMutation()

  const { data, isLoading, isError, error } = usePortalBannersQuery(page, pageSize)
  const banners = data?.list ?? []

  useEffect(() => {
    if (data) setTotalPages(Math.max(1, Math.ceil(data.total / pageSize)))
  }, [data, pageSize, setTotalPages])

  function confirmDelete(): void {
    if (!deleteBanner) return
    deleteMutation.mutate(deleteBanner.id, {
      onSuccess: () => {
        setDeleteBanner(null)
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("bannerTitle")} description={t("bannerDesc")} />

      <div className="flex items-center justify-end">
        <Permission code={PERMISSIONS.portalBannerCreate}>
          <Button
            type="button"
            className="h-9"
            onClick={() => {
              setEditingBanner(null)
              setFormOpen(true)
            }}
          >
            {t("bannerAdd")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && banners.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <ImageIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("bannerEmptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("bannerEmptyCreate")}</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t("bannerImage")}</TableHead>
              <TableHead>{t("bannerName")}</TableHead>
              <TableHead>{t("bannerLink")}</TableHead>
              <TableHead className="w-20">{t("sort")}</TableHead>
              <TableHead className="w-24">{t("status")}</TableHead>
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
              : banners.map((banner) => (
                  <TableRow key={banner.id}>
                    <TableCell>
                      <img
                        src={banner.imageUrl}
                        alt={banner.title}
                        className="h-10 w-20 rounded object-cover"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{banner.title}</TableCell>
                    <TableCell>
                      {banner.linkUrl ? (
                        <span className="block max-w-64 truncate" title={banner.linkUrl}>
                          {banner.linkUrl}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{banner.sort}</TableCell>
                    <TableCell>
                      <Badge variant={banner.status ? "default" : "destructive"}>
                        {banner.status ? t("enabled") : t("disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Permission code={PERMISSIONS.portalBannerUpdate}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingBanner(banner)
                              setFormOpen(true)
                            }}
                          >
                            {t("edit")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.portalBannerDelete}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteBanner(banner)
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

      {formOpen && (
        <BannerFormDialog
          banner={editingBanner}
          onClose={() => {
            setFormOpen(false)
            setEditingBanner(null)
          }}
        />
      )}

      {deleteBanner && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteBanner(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("bannerDeleteConfirm", { name: deleteBanner.title })}
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
