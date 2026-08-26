import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"

import { ShieldIcon } from "lucide-react"
import { PERMISSIONS } from "@repo/shared"

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
import { roleDisplayName } from "@/localization/menuName"
import { usePagination } from "@/hooks/usePagination"
import { MenuGrantDialog } from "./MenuGrantDialog"
import { RoleFormDialog } from "./RoleFormDialog"
import { useDeleteRoleMutation, useRolesQuery } from "./useRoles"
import type { RoleListItem } from "./useRoles"

const PAGE_SIZE = 10

/**
 * 角色管理页（Task 21）：分页列表 + 关键词搜索 + 新增/编辑 Dialog + 删除 AlertDialog +
 * 分配权限 Dialog（树形勾选授权）；所有操作按钮由 <Permission> 按按钮级权限码门控。
 */
export default function RolePage(): JSX.Element {
  const { t } = useTranslation("roles")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [keywordInput, setKeywordInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleListItem | null>(null)
  const [grantRole, setGrantRole] = useState<RoleListItem | null>(null)
  const [deleteRole, setDeleteRole] = useState<RoleListItem | null>(null)
  const deleteMutation = useDeleteRoleMutation()

  const { data, isLoading, isError, error } = useRolesQuery(page, pageSize, keyword)
  const roles = data?.list ?? []

  // 数据就绪后同步 totalPages（usePagination 内部在 totalPages 变小时自动钳制 page）。
  // 仅 data 存在时写入：切页瞬间新 query 处于 pending（data=undefined），若此时把 totalPages
  // 打成 1 会触发钳制把 page 拽回首页（Task 20 修复过的真实竞态）
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
    if (!deleteRole) return
    deleteMutation.mutate(deleteRole.id, { onSuccess: () => { setDeleteRole(null); } })
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
        <Permission code={PERMISSIONS.roleCreate}>
          <Button
            type="button"
            onClick={() => {
              setEditingRole(null)
              setFormOpen(true)
            }}
            className="h-9"
          >
            {t("addRole")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && roles.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <ShieldIcon />
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
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("code")}</TableHead>
              <TableHead>{t("sort")}</TableHead>
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
              : roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>{roleDisplayName(role)}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{role.code}</code>
                    </TableCell>
                    <TableCell>{role.sort}</TableCell>
                    <TableCell>
                      <Badge variant={role.status ? "default" : "destructive"}>
                        {role.status ? t("enabled") : t("disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>{role.description ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Permission code={PERMISSIONS.roleAssign}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setGrantRole(role)
                            }}
                          >
                            {t("assignPermission")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.roleUpdate}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingRole(role)
                              setFormOpen(true)
                            }}
                          >
                            {t("edit")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.roleDelete}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteRole(role)
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
        <RoleFormDialog
          role={editingRole}
          onClose={() => {
            setFormOpen(false)
            setEditingRole(null)
          }}
        />
      )}

      {grantRole && (
        <MenuGrantDialog
          role={grantRole}
          onClose={() => {
            setGrantRole(null)
          }}
        />
      )}

      {deleteRole && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteRole(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteRoleConfirm", { name: roleDisplayName(deleteRole) })}
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
