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
import type { DepartmentItem } from "./useDepartments"

/** 部门树节点（扁平列表建树后的形态） */
export interface DepartmentNode extends DepartmentItem {
  children: DepartmentNode[]
}

/** 扁平部门列表 → 树（同层按 sort 升序） */
export function buildDepartmentTree(list: DepartmentItem[]): DepartmentNode[] {
  const nodes = new Map<string, DepartmentNode>(
    list.map((item) => [item.id, { ...item, children: [] }]),
  )
  const roots: DepartmentNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortNodes = (list: DepartmentNode[]): DepartmentNode[] =>
    [...list].sort((a, b) => a.sort - b.sort).map((node) => ({ ...node, children: sortNodes(node.children) }))
  return sortNodes(roots)
}

/**
 * 部门折叠树表格：默认全部展开；行操作（编辑/删除）由页面注入回调，
 * 按钮由 <Permission> 按按钮级权限码门控。仅渲染 TableBody 行。
 */
export function DepartmentTreeTable({
  nodes,
  onEdit,
  onDelete,
}: {
  nodes: DepartmentNode[]
  onEdit: (node: DepartmentNode) => void
  onDelete: (node: DepartmentNode) => void
}): JSX.Element {
  const { t } = useTranslation("department")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(nodes.map((n) => n.id)))

  function toggleExpand(id: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderRows(list: DepartmentNode[], depth: number): ReactNode[] {
    const rows: ReactNode[] = []
    for (const node of list) {
      const hasChildren = node.children.length > 0
      const expanded = expandedIds.has(node.id)
      rows.push(
        <TableRow key={node.id}>
          <TableCell>
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
              <span className="text-sm font-medium">{menuDisplayName(node)}</span>
            </div>
          </TableCell>
          <TableCell>{node.userCount}</TableCell>
          <TableCell>
            <Badge variant={node.status ? "default" : "destructive"}>
              {node.status ? t("enabled") : t("disabled")}
            </Badge>
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1">
              <Permission code={PERMISSIONS.departmentUpdate}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { onEdit(node) }}
                >
                  {t("edit")}
                </Button>
              </Permission>
              <Permission code={PERMISSIONS.departmentDelete}>
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
