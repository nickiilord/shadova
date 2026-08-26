import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { BookOpenIcon } from "lucide-react"

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
import { DictDetailDialog } from "./DictDetailDialog"
import { TypeFormDialog } from "./TypeFormDialog"
import { useDeleteDictTypeMutation, useDictTypesQuery } from "./useDictTypes"
import type { DictTypeListItem } from "./useDictTypes"

const PAGE_SIZE = 10

/**
 * 数据字典页：字典类型分页列表 + 关键词搜索 + 新增/编辑类型 Dialog + 删除 AlertDialog +
 * 详情 Dialog（字典项全量编辑器）；行点击或「编辑」打开详情，所有操作按钮由 <Permission> 按按钮级权限码门控。
 */
export default function DictPage(): JSX.Element {
  const { t } = useTranslation("dict")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [keywordInput, setKeywordInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingType, setEditingType] = useState<DictTypeListItem | null>(null)
  const [detailType, setDetailType] = useState<DictTypeListItem | null>(null)
  const [deleteType, setDeleteType] = useState<DictTypeListItem | null>(null)
  const deleteMutation = useDeleteDictTypeMutation()

  const { data, isLoading, isError, error } = useDictTypesQuery(page, pageSize, keyword)
  const types = data?.list ?? []

  // 数据就绪后同步 totalPages（usePagination 内部在 totalPages 变小时自动钳制 page）
  useEffect(() => {
    if (data) setTotalPages(Math.max(1, Math.ceil(data.total / pageSize)))
  }, [data, pageSize, setTotalPages])

  function applyKeyword(): void {
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  function gotoPage(pageNumber: number): void {
    setPage(pageNumber)
  }

  function openCreate(): void {
    setEditingType(null)
    setFormOpen(true)
  }

  /** 详情内「编辑类型信息」→ 关闭详情、打开类型字段编辑表单 */
  function openEditFromDetail(): void {
    const type = detailType
    if (!type) return
    setDetailType(null)
    setEditingType(type)
    setFormOpen(true)
  }

  function confirmDelete(): void {
    if (!deleteType) return
    deleteMutation.mutate(deleteType.id, { onSuccess: () => { setDeleteType(null); } })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("desc")} />

      {/* 工具栏：搜索居左、操作按钮居右 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <Permission code={PERMISSIONS.dictCreate}>
          <Button type="button" onClick={openCreate} className="h-9">
            {t("addType")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && types.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <BookOpenIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>
              {keyword ? t("emptyKeyword") : t("emptyCreate")}
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_th]:text-muted-foreground [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("typeCode")}</TableHead>
              <TableHead>{t("nameZh")}</TableHead>
              <TableHead>{t("nameEn")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("itemCount")}</TableHead>
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
              : types.map((type) => (
                  <TableRow
                    key={type.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setDetailType(type)
                    }}
                  >
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{type.typeCode}</code>
                    </TableCell>
                    <TableCell>{type.nameZh}</TableCell>
                    <TableCell>{type.nameEn ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={type.status ? "default" : "destructive"}>
                        {type.status ? t("enabled") : t("disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>{type.itemCount}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1" onClick={(event) => { event.stopPropagation(); }}>
                        <Permission code={PERMISSIONS.dictUpdate}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDetailType(type)
                            }}
                          >
                            {t("edit")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.dictDelete}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteType(type)
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

      {formOpen && (
        <TypeFormDialog
          type={editingType}
          onClose={() => {
            setFormOpen(false)
            setEditingType(null)
          }}
        />
      )}

      {detailType && (
        <DictDetailDialog
          type={detailType}
          onEditType={openEditFromDetail}
          onClose={() => {
            setDetailType(null)
          }}
        />
      )}

      {deleteType && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteType(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteTypeConfirm", { name: deleteType.nameZh })}
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
