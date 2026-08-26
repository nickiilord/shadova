import { prisma } from "@repo/db"
import { badRequest, notFound } from "../lib/http-error.js"

export async function ensureDictType(id: string): Promise<void> {
  const type = await prisma.dictType.findUnique({ where: { id }, select: { id: true } })
  if (!type) throw notFound("字典类型不存在")
}

export interface DictItemInput {
  labelZh: string
  labelEn?: string | null | undefined
  value: string
  sort: number
  status?: boolean | undefined
}

export async function replaceDictItems(typeId: string, items: DictItemInput[]): Promise<void> {
  await ensureDictType(typeId)
  const values = items.map((item) => item.value)
  if (new Set(values).size !== values.length) throw badRequest("字典项值不能重复")
  await prisma.$transaction(async (tx) => {
    await tx.dictItem.deleteMany({ where: { typeId } })
    if (items.length > 0) {
      await tx.dictItem.createMany({
        data: items.map((item) => ({
          typeId, labelZh: item.labelZh, labelEn: item.labelEn ?? null, value: item.value,
          sort: item.sort, status: item.status ?? true,
        })),
      })
    }
  })
}
