import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { LayersIcon } from "lucide-react"

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
import { iconByName } from "@/lib/icons"
import { SectionFormDialog } from "./SectionFormDialog"
import { useDeletePortalSectionMutation, usePortalSectionsQuery } from "./usePortalSections"
import type { PortalSectionItem } from "./usePortalSections"

const PAGE_SIZE = 10

/** 图文区块页：门户首页价值主张卡片的分页列表 + 新增/编辑 Dialog + 删除确认 */
export default function PortalSectionPage(): JSX.Element {
  const { t } = useTranslation("portal")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [formOpen, setFormOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<PortalSectionItem | null>(null)
  const [deleteSection, setDeleteSection] = useState<PortalSectionItem | null>(null)
  const deleteMutation = useDeletePortalSectionMutation()

  const { data, isLoading, isError, error } = usePortalSectionsQuery(page, pageSize)
  const sections = data?.list ?? []

  useEffect(() => {
    if (data) setTotalPages(Math.max(1, Math.ceil(data.total / pageSize)))
  }, [data, pageSize, setTotalPages])

  function confirmDelete(): void {
    if (!deleteSection) return
    deleteMutation.mutate(deleteSection.id, {
      onSuccess: () => {
        setDeleteSection(null)
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("sectionTitle")} description={t("sectionDesc")} />

      <div className="flex items-center justify-end">
        <Permission code={PERMISSIONS.portalSectionCreate}>
          <Button
            type="button"
            className="h-9"
            onClick={() => {
              setEditingSection(null)
              setFormOpen(true)
            }}
          >
            {t("sectionAdd")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && sections.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <LayersIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("sectionEmptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("sectionEmptyCreate")}</EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("sectionIcon")}</TableHead>
              <TableHead>{t("sectionName")}</TableHead>
              <TableHead>{t("sectionDescription")}</TableHead>
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
              : sections.map((section) => {
                  const Icon = iconByName(section.icon)
                  return (
                    <TableRow key={section.id}>
                      <TableCell>
                        {Icon ? (
                          <Icon className="size-4 text-muted-foreground" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{section.title}</TableCell>
                      <TableCell>
                        {section.description ? (
                          <span className="block max-w-72 truncate" title={section.description}>
                            {section.description}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{section.sort}</TableCell>
                      <TableCell>
                        <Badge variant={section.status ? "default" : "destructive"}>
                          {section.status ? t("enabled") : t("disabled")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Permission code={PERMISSIONS.portalSectionUpdate}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingSection(section)
                                setFormOpen(true)
                              }}
                            >
                              {t("edit")}
                            </Button>
                          </Permission>
                          <Permission code={PERMISSIONS.portalSectionDelete}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteSection(section)
                              }}
                            >
                              {t("delete")}
                            </Button>
                          </Permission>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
        <SectionFormDialog
          section={editingSection}
          onClose={() => {
            setFormOpen(false)
            setEditingSection(null)
          }}
        />
      )}

      {deleteSection && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteSection(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("sectionDeleteConfirm", { name: deleteSection.title })}
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
