import { useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { Building2Icon } from "lucide-react"

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
import { DepartmentFormDialog } from "./DepartmentFormDialog"
import { buildDepartmentTree, DepartmentTreeTable } from "./DepartmentTreeTable"
import type { DepartmentNode } from "./DepartmentTreeTable"
import { useDeleteDepartmentMutation, useDepartmentsQuery } from "./useDepartments"

/**
 * 部门管理页：组织架构树表格 + 新增/编辑 Dialog + 删除 AlertDialog（级联删子树）。
 * 树由扁平列表经 buildDepartmentTree 构建；操作按钮按按钮级权限码门控。
 */
export default function DepartmentPage(): JSX.Element {
  const { t } = useTranslation("department")
  const [formOpen, setFormOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<DepartmentNode | null>(null)
  const [deleteDept, setDeleteDept] = useState<DepartmentNode | null>(null)
  const deleteMutation = useDeleteDepartmentMutation()

  const { data, isLoading, isError, error } = useDepartmentsQuery()
  const tree = buildDepartmentTree(data ?? [])

  function confirmDelete(): void {
    if (!deleteDept) return
    deleteMutation.mutate(deleteDept.id, { onSuccess: () => { setDeleteDept(null); } })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("desc")} />

      {/* 工具栏：操作按钮居右（部门无搜索——树形全量展示） */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Permission code={PERMISSIONS.departmentCreate}>
          <Button
            type="button"
            onClick={() => {
              setEditingDept(null)
              setFormOpen(true)
            }}
            className="h-9"
          >
            {t("addDepartment")}
          </Button>
        </Permission>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : !isLoading && tree.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon">
            <Building2Icon />
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
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("memberCount")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <TableBody>
              {Array.from({ length: 5 }, (_, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          ) : (
            <DepartmentTreeTable
              nodes={tree}
              onEdit={(node) => {
                setEditingDept(node)
                setFormOpen(true)
              }}
              onDelete={(node) => {
                setDeleteDept(node)
              }}
            />
          )}
        </Table>
      )}

      {formOpen && (
        <DepartmentFormDialog
          department={editingDept}
          onClose={() => {
            setFormOpen(false)
            setEditingDept(null)
          }}
        />
      )}

      {deleteDept && (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setDeleteDept(null)
          }}
        >
          <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteConfirm", { name: deleteDept.nameZh })}
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
