import { useEffect, useRef, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { PlusIcon, Trash2Icon } from "lucide-react"

import { apiErrorMessage } from "@/api/client"
import { Permission } from "@/components/business/Permission"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePermissionCodes } from "@/hooks/usePermissionCodes"
import { useDictTypeQuery, useSaveDictItemsMutation } from "./useDictTypes"
import type { DictTypeListItem } from "./useDictTypes"

/** 编辑中字典项行（与后端 PUT 输入对应；labelEn 空串在保存时转 null） */
interface ItemRow {
  labelZh: string
  labelEn: string
  value: string
  sort: number
  status: boolean
}

/**
 * 字典类型详情 Dialog：类型信息摘要（只读，可跳转编辑类型字段）+ 字典项全量编辑器。
 * - 加载后从详情初始化编辑行；编辑期间不随查询刷新覆盖（initializedRef 守卫）
 * - 保存 PUT /api/dicts/types/{id}/items 全量替换（校验：标签/值非空、值不重复）
 * - 无 system:dict:update 权限时渲染只读项表格
 */
export function DictDetailDialog({
  type,
  onEditType,
  onClose,
}: {
  type: DictTypeListItem
  onEditType: () => void
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("dict")
  const canUpdate = usePermissionCodes().has(PERMISSIONS.dictUpdate)
  const { data, isLoading, isError, error } = useDictTypeQuery(type.id)
  const saveMutation = useSaveDictItemsMutation()

  const [rows, setRows] = useState<ItemRow[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (data && !initializedRef.current) {
      initializedRef.current = true
      setRows(
        data.items.map((item) => ({
          labelZh: item.labelZh,
          labelEn: item.labelEn ?? "",
          value: item.value,
          sort: item.sort,
          status: item.status,
        })),
      )
    }
  }, [data])

  function updateRow(index: number, patch: Partial<ItemRow>): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow(): void {
    setRows((prev) => [...prev, { labelZh: "", labelEn: "", value: "", sort: 0, status: true }])
  }

  function removeRow(index: number): void {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function validate(): string | null {
    for (const row of rows) {
      if (!row.labelZh.trim()) return t("itemLabelZhRequired")
      if (!row.value.trim()) return t("itemValueRequired")
    }
    const values = rows.map((row) => row.value.trim())
    if (new Set(values).size !== values.length) return t("itemValueDuplicate")
    return null
  }

  function handleSave(): void {
    const message = validate()
    if (message) {
      setErrorMessage(message)
      return
    }
    setErrorMessage(null)
    saveMutation.mutate(
      {
        id: type.id,
        body: {
          items: rows.map((row) => ({
            labelZh: row.labelZh.trim(),
            // 留空显式传 null（en 语言回落中文标签）
            labelEn: row.labelEn.trim() === "" ? null : row.labelEn.trim(),
            value: row.value.trim(),
            sort: row.sort,
            status: row.status,
          })),
        },
      },
      { onSuccess: () => { initializedRef.current = false } },
    )
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("detailTitle")}</DialogTitle>
          <DialogDescription>{t("detailDesc", { name: type.nameZh })}</DialogDescription>
        </DialogHeader>

        {/* 类型信息摘要 */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm md:grid-cols-3">
            <div>
              <span className="text-muted-foreground">{t("typeCodeLabel")}: </span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{type.typeCode}</code>
            </div>
            <div>
              <span className="text-muted-foreground">{t("nameZh")}: </span>
              {type.nameZh}
            </div>
            <div>
              <span className="text-muted-foreground">{t("nameEn")}: </span>
              {type.nameEn ?? "-"}
            </div>
            <div>
              <span className="text-muted-foreground">{t("sort")}: </span>
              {type.sort}
            </div>
            <div>
              <span className="text-muted-foreground">{t("status")}: </span>
              <Badge variant={type.status ? "default" : "destructive"}>
                {type.status ? t("enabled") : t("disabled")}
              </Badge>
            </div>
            {type.description && (
              <div className="col-span-2">
                <span className="text-muted-foreground">{t("description")}: </span>
                {type.description}
              </div>
            )}
          </div>
          <Permission code={PERMISSIONS.dictUpdate}>
            <Button type="button" variant="outline" size="sm" onClick={onEditType} className="h-8">
              {t("editTypeInfo")}
            </Button>
          </Permission>
        </div>

        {/* 字典项编辑器 */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(error)}
          </p>
        ) : rows.length === 0 && !canUpdate ? (
          <p className="text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <Table className="[&_th]:h-10 [&_th]:px-2 [&_th]:text-muted-foreground [&_tr]:h-12 [&_td]:px-2">
            <TableHeader>
              <TableRow>
                <TableHead>{t("itemLabelZh")}</TableHead>
                <TableHead>{t("itemLabelEn")}</TableHead>
                <TableHead>{t("itemValue")}</TableHead>
                <TableHead className="w-20">{t("itemSort")}</TableHead>
                <TableHead className="w-20">{t("itemStatus")}</TableHead>
                {canUpdate && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    {canUpdate ? (
                      <Input
                        value={row.labelZh}
                        onChange={(event) => {
                          updateRow(index, { labelZh: event.target.value })
                        }}
                        className="h-8"
                      />
                    ) : (
                      row.labelZh
                    )}
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <Input
                        value={row.labelEn}
                        onChange={(event) => {
                          updateRow(index, { labelEn: event.target.value })
                        }}
                        className="h-8"
                      />
                    ) : (
                      row.labelEn || "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <Input
                        value={row.value}
                        onChange={(event) => {
                          updateRow(index, { value: event.target.value })
                        }}
                        className="h-8"
                      />
                    ) : (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.value}</code>
                    )}
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <Input
                        type="number"
                        value={row.sort}
                        onChange={(event) => {
                          updateRow(index, { sort: event.target.value === "" ? 0 : Number(event.target.value) })
                        }}
                        className="h-8"
                      />
                    ) : (
                      row.sort
                    )}
                  </TableCell>
                  <TableCell>
                    {canUpdate ? (
                      <Switch checked={row.status} onCheckedChange={(checked) => { updateRow(index, { status: checked }); }} />
                    ) : (
                      <Badge variant={row.status ? "default" : "destructive"}>
                        {row.status ? t("enabled") : t("disabled")}
                      </Badge>
                    )}
                  </TableCell>
                  {canUpdate && (
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          removeRow(index)
                        }}
                        aria-label={t("removeItem")}
                      >
                        <Trash2Icon className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canUpdate ? 6 : 5} className="text-center text-sm text-muted-foreground">
                    {t("noItems")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {canUpdate && (
          <DialogFooter className="items-center gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow} className="h-9">
                <PlusIcon className="h-4 w-4" />
                {t("addItem")}
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="h-9">
                {saveMutation.isPending ? t("savingItems") : t("saveItems")}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
