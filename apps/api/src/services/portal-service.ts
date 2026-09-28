import { prisma } from "@repo/db"
import type { Prisma } from "@repo/db"
import type { PortalHome, PortalSite } from "../lib/schemas.js"

/**
 * 站点配置的固定单行主键，与 schema.prisma 的 `PortalConfig.id @default("portal")` 一致。
 * 该表只有这一行：无新增/删除接口，写入一律按此键 upsert（读不到行时按默认值返回，不隐式插行）。
 */
export const PORTAL_CONFIG_ID = "portal"

/** 站点配置字段选择器（读默认值分支与读库分支共用同一字段集，防止两处漂移） */
const PORTAL_SITE_SELECT = {
  siteName: true,
  siteTagline: true,
  contactEmail: true,
  contactPhone: true,
  whatsappNumber: true,
  facebookUrl: true,
  instagramUrl: true,
  youtubeUrl: true,
  telegramUrl: true,
  privacyPolicyUrl: true,
  footerText: true,
  seoTitle: true,
  seoDescription: true,
  seoKeywords: true,
} as const

/** 未配置站点时的默认值：首装即可访问公开首页，管理端表单也能拿到完整字段（而非缺字段报错） */
const EMPTY_PORTAL_SITE: PortalSite = {
  siteName: "",
  siteTagline: null,
  contactEmail: null,
  contactPhone: null,
  whatsappNumber: null,
  facebookUrl: null,
  instagramUrl: null,
  youtubeUrl: null,
  telegramUrl: null,
  privacyPolicyUrl: null,
  footerText: null,
  seoTitle: null,
  seoDescription: null,
  seoKeywords: null,
}

/** 读取站点配置（无行时返回默认值；公开首页与管理端站点配置页共用） */
export async function readPortalSite(): Promise<PortalSite> {
  const row = await prisma.portalConfig.findUnique({
    where: { id: PORTAL_CONFIG_ID },
    select: PORTAL_SITE_SELECT,
  })
  return row ?? { ...EMPTY_PORTAL_SITE }
}

/**
 * 站点配置补丁：字段可缺省（未提交即不修改）。显式 `| undefined` 是必要的——
 * exactOptionalPropertyTypes 下 `Partial<T>` 不接受值为 undefined 的属性，而 zod `.optional()` 的输出正是该形态。
 */
export type PortalSitePatch = { [K in keyof PortalSite]?: PortalSite[K] | undefined }

/**
 * 保存站点配置：UPDATE 只包含「已提交」的字段——未提交字段不参与 SQL，避免并发保存互相覆盖
 * （若写回读到的完整快照，两个管理员同时改不同字段时，后写者会覆盖先写者的改动）。
 * 单行 upsert 保证不产生第二行。
 */
export async function savePortalSite(fields: PortalSitePatch): Promise<PortalSite> {
  // 逐字段收集已提交项：Prisma 输入类型在 exactOptionalPropertyTypes 下不接受值为 undefined 的属性
  const update: Prisma.PortalConfigUpdateInput = {}
  if (fields.siteName !== undefined) update.siteName = fields.siteName
  if (fields.siteTagline !== undefined) update.siteTagline = fields.siteTagline
  if (fields.contactEmail !== undefined) update.contactEmail = fields.contactEmail
  if (fields.contactPhone !== undefined) update.contactPhone = fields.contactPhone
  if (fields.whatsappNumber !== undefined) update.whatsappNumber = fields.whatsappNumber
  if (fields.facebookUrl !== undefined) update.facebookUrl = fields.facebookUrl
  if (fields.instagramUrl !== undefined) update.instagramUrl = fields.instagramUrl
  if (fields.youtubeUrl !== undefined) update.youtubeUrl = fields.youtubeUrl
  if (fields.telegramUrl !== undefined) update.telegramUrl = fields.telegramUrl
  if (fields.privacyPolicyUrl !== undefined) update.privacyPolicyUrl = fields.privacyPolicyUrl
  if (fields.footerText !== undefined) update.footerText = fields.footerText
  if (fields.seoTitle !== undefined) update.seoTitle = fields.seoTitle
  if (fields.seoDescription !== undefined) update.seoDescription = fields.seoDescription
  if (fields.seoKeywords !== undefined) update.seoKeywords = fields.seoKeywords

  // create 分支只在首行不存在时触发（首次保存，无并发场景）：以默认值补全未提交字段
  const current = await readPortalSite()
  // 合并必须用 `=== undefined` 判断而非 `??`：null 是「显式清空」的合法值，不能被默认值顶掉
  const merged: PortalSite = {
    siteName: fields.siteName ?? current.siteName,
    siteTagline: fields.siteTagline === undefined ? current.siteTagline : fields.siteTagline,
    contactEmail: fields.contactEmail === undefined ? current.contactEmail : fields.contactEmail,
    contactPhone: fields.contactPhone === undefined ? current.contactPhone : fields.contactPhone,
    whatsappNumber: fields.whatsappNumber === undefined ? current.whatsappNumber : fields.whatsappNumber,
    facebookUrl: fields.facebookUrl === undefined ? current.facebookUrl : fields.facebookUrl,
    instagramUrl: fields.instagramUrl === undefined ? current.instagramUrl : fields.instagramUrl,
    youtubeUrl: fields.youtubeUrl === undefined ? current.youtubeUrl : fields.youtubeUrl,
    telegramUrl: fields.telegramUrl === undefined ? current.telegramUrl : fields.telegramUrl,
    privacyPolicyUrl: fields.privacyPolicyUrl === undefined ? current.privacyPolicyUrl : fields.privacyPolicyUrl,
    footerText: fields.footerText === undefined ? current.footerText : fields.footerText,
    seoTitle: fields.seoTitle === undefined ? current.seoTitle : fields.seoTitle,
    seoDescription: fields.seoDescription === undefined ? current.seoDescription : fields.seoDescription,
    seoKeywords: fields.seoKeywords === undefined ? current.seoKeywords : fields.seoKeywords,
  }

  await prisma.portalConfig.upsert({
    where: { id: PORTAL_CONFIG_ID },
    update,
    create: merged,
  })
  // 重读而非返回 merged：并发写入下只有库里的值才准确
  return readPortalSite()
}

/**
 * 公开首页聚合：站点配置 + 启用区块 + 启用 Banner（并发三次查询，各自按 sort 升序）。
 * 聚合只服务公开首屏（一次请求取齐）；管理端列表走各自的分页接口，两者不共用查询。
 */
export async function readPortalHome(): Promise<PortalHome> {
  const [site, sections, banners] = await Promise.all([
    readPortalSite(),
    prisma.portalSection.findMany({
      where: { status: true },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      select: { id: true, icon: true, title: true, description: true, sort: true },
    }),
    prisma.portalBanner.findMany({
      where: { status: true },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, imageUrl: true, linkUrl: true, sort: true },
    }),
  ])
  return { site, sections, banners }
}
