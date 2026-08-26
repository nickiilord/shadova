import { useEffect, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"

import { UsersIcon } from "lucide-react"
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
import { usePagination } from "@/hooks/usePagination"
import i18n from "@/localization/i18n"
import { menuDisplayName, roleDisplayName } from "@/localization/menuName"
import { RoleAssignDialog } from "./RoleAssignDialog"
import { UserFormDialog } from "./UserFormDialog"
import { ImportDialog } from "./ImportDialog"
import { useDeleteUserMutation, useExportUsersMutation, useUsersQuery } from "./useUsers"
import type { UserListItem } from "./useUsers"

const PAGE_SIZE = 10

/** 后端返回 ISO 时间字符串；非法值原样展示（兜底，正常不会走到） */
function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(i18n.language === "zh" ? "zh-CN" : "en-US", { hour12: false })
}

/**
 * 用户管理页（Task 20）：分页列表 + 关键词搜索 + 新增/编辑 Dialog + 删除 AlertDialog +
 * 分配角色 Dialog；所有操作按钮由 <Permission> 按按钮级权限码门控。
 */
export default function UserPage(): JSX.Element {
  const { t } = useTranslation("users")
  const { page, pageSize, totalPages, setPage, setTotalPages } = usePagination(1, PAGE_SIZE)
  const [keywordInput, setKeywordInput] = useState("")
  const [keyword, setKeyword] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null)
  const [assignUser, setAssignUser] = useState<UserListItem | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const deleteMutation = useDeleteUserMutation()
  const exportMutation = useExportUsersMutation(keyword)

  const { data, isLoading, isError, error } = useUsersQuery(page, pageSize, keyword)
  const users = data?.list ?? []

  // 数据就绪后同步 totalPages（usePagination 内部在 totalPages 变小时自动钳制 page）。
  // 仅 data 存在时写入：切页瞬间新 query 处于 pending（data=undefined），若此时把 totalPages
  // 打成 1 会触发钳制把 page 拽回首页（真实竞态，测试曾复现）
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
    if (!deleteUser) return
    deleteMutation.mutate(deleteUser.id, { onSuccess: () => { setDeleteUser(null); } })
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
        <div className="flex items-center gap-2">
          {/* 导出 CSV（下载当前 keyword 过滤结果；与导入模板同构） */}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              exportMutation.mutate()
            }}
            disabled={exportMutation.isPending}
            className="h-9"
          >
            {t("export")}
          </Button>
          <Permission code={PERMISSIONS.userCreate}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImportOpen(true)
              }}
              className="h-9"
            >
              {t("import")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditingUser(null)
                setFormOpen(true)
              }}
              className="h-9"
            >
              {t("addUser")}
            </Button>
          </Permission>
        </div>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && users.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <UsersIcon />
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
              <TableHead>{t("username")}</TableHead>
              <TableHead>{t("nickname")}</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("telephone")}</TableHead>
              <TableHead>{t("department")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("roles")}</TableHead>
              <TableHead>{t("createdAt")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }, (_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 9 }, (_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.nickname}</TableCell>
                    <TableCell>{user.email ?? "-"}</TableCell>
                    <TableCell>{user.telephone ?? "-"}</TableCell>
                    <TableCell>{user.department ? menuDisplayName(user.department) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={user.status ? "default" : "destructive"}>
                        {user.status ? t("enabled") : t("disabled")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role.id} variant="outline">
                              {roleDisplayName(role)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Permission code={PERMISSIONS.userUpdate}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingUser(user)
                              setFormOpen(true)
                            }}
                          >
                            {t("edit")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.userAssignRole}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAssignUser(user)
                            }}
                          >
                            {t("assignRoles")}
                          </Button>
                        </Permission>
                        <Permission code={PERMISSIONS.userDelete}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteUser(user)
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
        <UserFormDialog
          user={editingUser}
          onClose={() => {
            setFormOpen(false)
            setEditingUser(null)
          }}
        />
      )}

      {importOpen && (
        <ImportDialog
          onClose={() => {
            setImportOpen(false)
          }}
        />
      )}

      {assignUser && (
        <RoleAssignDialog
          user={assignUser}
          onClose={() => {
            setAssignUser(null)
          }}
        />
      )}

      {deleteUser && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteUser(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteUserConfirm", { name: deleteUser.username })}
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
