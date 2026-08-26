import { useState } from "react"
import type { JSX, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import { Permission } from "@/components/business/Permission"
import { menuDisplayName } from "@/localization/menuName"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableBody, TableCell, TableRow } from "@/components/ui/table"
import type { MenuNode } from "./useMenus"

/** 类型 Badge 配色（与 TreeCheckbox 一致）：目录/菜单/按钮一屏可辨 */
function badgeVariant(type: MenuNode["type"]): "default" | "outline" | "secondary" {
  if (type === "BUTTON") return "default"
  if (type === "MENU") return "outline"
  return "secondary"
}

/** 递归收集全部 DIR 节点 id（默认展开集）。约束下 DIR 仅能挂 DIR 下，故等于"所有 DIR 行可见" */
function collectDirIds(nodes: MenuNode[]): Set<string> {
  const ids = new Set<string>()
  for (const node of nodes) {
    if (node.type === "DIR") ids.add(node.id)
    for (const id of collectDirIds(node.children)) ids.add(id)
  }
  return ids
}

/**
 * 菜单折叠树表格（Task 22，Menu 页专用——暂无其他复用方，放 feature 内；若后续出现
 * 通用树表格需求再上移 components/business/）。仅渲染 TableBody 行，Table/表头/加载骨架
 * 由页面持有（与角色页同构，加载/空态分支不进入本组件）。
 *
 * 折叠语义（设计文档 §7/§8："外层列表不显示 button"）：默认只展开 DIR 行（全部层级——
 * DIR 仅能挂 DIR 下），MENU 默认收起 → BUTTON 行默认不可见，展开其所属 MENU 后可见。
 * 展开状态 useState<Set<string>>，行首 Chevron 按钮切换；无子节点行留位对齐。
 * 注意：默认展开集仅挂载时按 nodes 初始化，mutation refetch 后新增节点默认收起（可点开）。
 * 行操作（编辑/删除）由父组件注入回调，按钮由 <Permission> 按按钮级权限码门控。
 */
export function MenuTreeTable({
  nodes,
  onEdit,
  onDelete,
}: {
  nodes: MenuNode[]
  onEdit: (node: MenuNode) => void
  onDelete: (node: MenuNode) => void
}): JSX.Element {
  const { t } = useTranslation("menus")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectDirIds(nodes))

  function toggleExpand(id: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderRows(list: MenuNode[], depth: number): ReactNode[] {
    const rows: ReactNode[] = []
    for (const node of list) {
      const hasChildren = node.children.length > 0
      const expanded = expandedIds.has(node.id)
      rows.push(
        <TableRow key={node.id}>
          <TableCell>
            {/* 缩进 + 展开按钮（无子节点行留位对齐），Chevron 方向随展开态旋转 */}
            <div
              className="flex items-center gap-1"
              style={{ paddingLeft: `${String(depth * 24)}px` }}
            >
              {hasChildren ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={
                    expanded
                      ? t("collapseNode", { name: menuDisplayName(node) })
                      : t("expandNode", { name: menuDisplayName(node) })
                  }
                  aria-expanded={expanded}
                  onClick={() => { toggleExpand(node.id) }}
                >
                  {expanded ? (
                    <ChevronDownIcon className="size-4" />
                  ) : (
                    <ChevronRightIcon className="size-4" />
                  )}
                </Button>
              ) : (
                <span className="inline-block size-6" aria-hidden="true" />
              )}
              <span className="text-sm">{menuDisplayName(node)}</span>
              <Badge variant={badgeVariant(node.type)}>{node.type}</Badge>
            </div>
          </TableCell>
          <TableCell>{node.path ?? "-"}</TableCell>
          <TableCell>{node.component ?? "-"}</TableCell>
          <TableCell>{node.permission ?? "-"}</TableCell>
          <TableCell>{node.sort}</TableCell>
          <TableCell>
            <Badge variant={node.status ? "default" : "destructive"}>
              {node.status ? t("enabled") : t("disabled")}
            </Badge>
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1">
              <Permission code={PERMISSIONS.menuUpdate}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { onEdit(node) }}
                >
                  {t("edit")}
                </Button>
              </Permission>
              <Permission code={PERMISSIONS.menuDelete}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { onDelete(node) }}
                >
                  {t("delete")}
                </Button>
              </Permission>
            </div>
          </TableCell>
        </TableRow>,
      )
      if (expanded) rows.push(...renderRows(node.children, depth + 1))
    }
    return rows
  }

  return <TableBody>{renderRows(nodes, 0)}</TableBody>
}
