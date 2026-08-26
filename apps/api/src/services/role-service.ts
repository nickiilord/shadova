import type { Prisma } from "@repo/db"
import { prisma } from "@repo/db"
import { badRequest, notFound } from "../lib/http-error.js"

export async function getRole(id: string) {
  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) throw notFound("角色不存在")
  return role
}

export async function resolveMenuIds(tx: Prisma.TransactionClient, menuIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(menuIds))
  if (unique.length === 0) return unique
  const count = await tx.menu.count({ where: { id: { in: unique } } })
  if (count !== unique.length) throw badRequest("菜单不存在")
  return unique
}

export async function replaceRoleMenus(roleId: string, menuIds: string[]): Promise<void> {
  await getRole(roleId)
  await prisma.$transaction(async (tx) => {
    const menus = await resolveMenuIds(tx, menuIds)
    await tx.roleMenu.deleteMany({ where: { roleId } })
    if (menus.length > 0) await tx.roleMenu.createMany({ data: menus.map((menuId) => ({ roleId, menuId })) })
  })
}
