/** 收集节点自身及全部后代，适用于部门、菜单等 parentId 树。 */
export function collectSubtreeIds(nodes: readonly { id: string; parentId: string | null }[], rootId: string): Set<string> {
  const byParent = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parentId === null) continue
    const children = byParent.get(node.parentId) ?? []
    children.push(node.id)
    byParent.set(node.parentId, children)
  }
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || result.has(current)) continue
    result.add(current)
    queue.push(...(byParent.get(current) ?? []))
  }
  return result
}
