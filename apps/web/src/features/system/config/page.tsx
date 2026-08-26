import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { Settings2Icon } from "lucide-react"

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
import { ConfigFormDialog } from "./ConfigFormDialog"
import { useConfigsQuery, useDeleteConfigMutation } from "./useConfigs"
import type { ConfigListItem } from "./useConfigs"

const PAGE_SIZE = 10

/**
 * 参数配置页：系统参数分页列表 + 关键词搜索 + 新增/编辑 Dialog + 删除 AlertDialog；
 * 所有操作按钮由 <Permission> 按按钮级权限码门控。
 */
export default function ConfigPage(): JSX.Element {
  const { t } = useTranslation("config")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [keywordInput, setKeywordInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ConfigListItem | null>(null)
  const [deleteConfig, setDeleteConfig] = useState<ConfigListItem | null>(null)
  const deleteMutation = useDeleteConfigMutation()

  const { data, isLoading, isError, error } = useConfigsQuery(page, pageSize, keyword)
  const configs = data?.list ?? []

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

  function confirmDelete(): void {
    if (!deleteConfig) return
    deleteMutation.mutate(deleteConfig.id, { onSuccess: () => { setDeleteConfig(null); } })
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
        <Permission code={PERMISSIONS.configCreate}>
          <Button
            type="button"
            onClick={() => {
              setEditingConfig(null)
              setFormOpen(true)
            }}
            className="h-9"
          >
            {t("addConfig")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && configs.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <Settings2Icon />
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
              <TableHead>{t("configKey")}</TableHead>
              <TableHead>{t("configValue")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("description")}</TableHead>
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
              : configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{config.configKey}</code>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-40 truncate" title={config.configValue}>
                        {config.configValue}
                      </span>
                    </TableCell>
                    <TableCell>{config.nameZh}</TableCell>
                    <TableCell>
                      <Badge variant={config.status ? "default" : "destructive"}>
                        {config.status ? t("enabled") : t("disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {config.description ? (
                        <span className="block max-w-48 truncate" title={config.description}>
                          {config.description}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Permission code={PERMISSIONS.configUpdate}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingConfig(config)
                              setFormOpen(true)
                            }}
                          >
                            {t("edit")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.configDelete}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteConfig(config)
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
        <ConfigFormDialog
          config={editingConfig}
          onClose={() => {
            setFormOpen(false)
            setEditingConfig(null)
          }}
        />
      )}

      {deleteConfig && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteConfig(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteConfigConfirm", { name: deleteConfig.nameZh })}
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
