import { prisma } from "@repo/db"
import { notFound } from "../lib/http-error.js"

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { roles: { include: { role: true } }, department: { select: { id: true, nameZh: true, nameEn: true } } },
  })
  if (!user) throw notFound("用户不存在")
  return user
}

export type UserDetail = Awaited<ReturnType<typeof getUserDetail>>

export function toUserDetail(user: UserDetail) {
  return {
    id: user.id, username: user.username, nickname: user.nickname, email: user.email,
    telephone: user.telephone, avatar: user.avatar,
    department: user.department ? { id: user.department.id, nameZh: user.department.nameZh, nameEn: user.department.nameEn } : null,
    status: user.status, createdAt: user.createdAt,
    roles: user.roles.map(({ role }) => ({ id: role.id, nameZh: role.nameZh, nameEn: role.nameEn, code: role.code })),
  }
}
