import { useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { useQueryClient } from "@tanstack/react-query"

import { ListTreeIcon } from "lucide-react"

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
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MenuFormDialog } from "./MenuFormDialog"
import { MenuTreeTable } from "./MenuTreeTable"
import { MENUS_QUERY_KEY, useDeleteMenuMutation, useMenuTreeQuery } from "./useMenus"
import type { MenuNode } from "./useMenus"

/**
 * 菜单管理页（Task 22）：折叠树表格（默认展开 DIR、MENU 收起，BUTTON 仅在展开其所属
 * MENU 后可见——设计文档 §7/§8）+ 类型约束表单（DIR→DIR/MENU、MENU→BUTTON，后端 400
 * message 直接展示兜底）+ 级联删除 AlertDialog + 刷新（重取菜单树）。
 * MenuTreeTable 仅在有数据时挂载（展开集在挂载时按 DIR 节点初始化——加载骨架/空态
 * 分支不进入表格组件，保证默认展开态正确）。
 */
export default function MenuPage(): JSX.Element {
  const { t } = useTranslation("menus")
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useMenuTreeQuery()
  const deleteMutation = useDeleteMenuMutation()
  const [formOpen, setFormOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<MenuNode | null>(null)
  const [deleteMenu, setDeleteMenu] = useState<MenuNode | null>(null)

  const nodes = data ?? []

  /** 刷新 = 重取菜单树（mutation 成功后已自动 invalidate，此处为手动入口） */
  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: MENUS_QUERY_KEY })
  }

  function confirmDelete(): void {
    if (!deleteMenu) return
    deleteMutation.mutate(deleteMenu.id, { onSuccess: () => { setDeleteMenu(null); } })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("desc")} />

      {/* 工具栏：操作按钮居右（菜单树无搜索，与其余管理页保持同构） */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" type="button" onClick={refresh} className="h-9">
            {t("refresh")}
          </Button>
          <Permission code={PERMISSIONS.menuCreate}>
            <Button
              type="button"
              onClick={() => {
                setEditingMenu(null)
                setFormOpen(true)
              }}
              className="h-9"
            >
              {t("addMenu")}
            </Button>
          </Permission>
        </div>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && nodes.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <ListTreeIcon />
          </EmptyMedia>
          <EmptyContent>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("emptyCreate")}
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <Table className="[&_th]:h-11 [&_th]:px-4 [&_th]:text-muted-foreground [&_tr]:h-12 [&_td]:px-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("path")}</TableHead>
              <TableHead>{t("component")}</TableHead>
              <TableHead>{t("permission")}</TableHead>
              <TableHead>{t("sort")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <TableBody>
              {Array.from({ length: 5 }, (_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 7 }, (_, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          ) : (
            <MenuTreeTable
              nodes={nodes}
              onEdit={(node) => {
                setEditingMenu(node)
                setFormOpen(true)
              }}
              onDelete={(node) => {
                setDeleteMenu(node)
              }}
            />
          )}
        </Table>
      )}

      {formOpen && (
        <MenuFormDialog
          menu={editingMenu}
          onClose={() => {
            setFormOpen(false)
            setEditingMenu(null)
          }}
        />
      )}

      {deleteMenu && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteMenu(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteMenuConfirm", { name: deleteMenu.nameZh })}
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
