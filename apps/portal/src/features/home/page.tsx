import type { JSX } from "react"
import { useTranslation } from "react-i18next"

import { MailIcon, MessageCircleIcon, PhoneIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { portalIconByName } from "@/lib/icons"
import { MessageForm } from "./MessageForm"
import { usePortalHomeQuery } from "./usePortalHome"

/**
 * 门户首页：品牌区 → Banner 轮播 → 图文区块 → 联系方式与社交链接 → 留言表单 → 页脚。
 * 数据来自公开聚合接口 /api/portal/home（免登录）；各区块在数据缺失时整块不渲染（空站点也能正常打开）。
 */
/** 站点配置的可空字段在库中可能是空串（后端 zod 只限长度），展示前统一按「非空串」判断 */
function isPresent(value: string | null): value is string {
  return value !== null && value !== ""
}

export default function PortalHomePage(): JSX.Element {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = usePortalHomeQuery()

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-24 text-center text-muted-foreground">
        {error?.message ?? t("loadError")}
      </div>
    )
  }

  const { site, sections, banners } = data
  const pageTitle = site.seoTitle ?? site.siteName
  const socialLinks = [
    { label: "Facebook", url: site.facebookUrl },
    { label: "Instagram", url: site.instagramUrl },
    { label: "YouTube", url: site.youtubeUrl },
    { label: "Telegram", url: site.telegramUrl },
  ].filter((link): link is { label: string; url: string } => isPresent(link.url))
  const hasContact = Boolean(site.contactEmail ?? site.contactPhone ?? site.whatsappNumber)

  return (
    <>
      {/* SEO：React 19 将 title/meta 提升到 head；SPA 下由可执行 JS 的爬虫读取 */}
      {isPresent(pageTitle) && <title>{pageTitle}</title>}
      {isPresent(site.seoDescription) && <meta name="description" content={site.seoDescription} />}
      {isPresent(site.seoKeywords) && <meta name="keywords" content={site.seoKeywords} />}

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">{site.siteName}</h1>
          {isPresent(site.siteTagline) && (
            <p className="text-lg text-muted-foreground">{site.siteTagline}</p>
          )}
        </header>

        {banners.length > 0 && (
          <Carousel className="w-full">
            <CarouselContent>
              {banners.map((banner) => {
                const image = (
                  <img
                    src={banner.imageUrl}
                    alt={banner.title}
                    className="h-64 w-full rounded-xl object-cover sm:h-80"
                  />
                )
                return (
                  <CarouselItem key={banner.id}>
                    {isPresent(banner.linkUrl) ? (
                      <a href={banner.linkUrl} target="_blank" rel="noreferrer">
                        {image}
                      </a>
                    ) : (
                      image
                    )}
                  </CarouselItem>
                )
              })}
            </CarouselContent>
            {banners.length > 1 && (
              <>
                <CarouselPrevious />
                <CarouselNext />
              </>
            )}
          </Carousel>
        )}

        {sections.length > 0 && (
          <section className="flex flex-col gap-6">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">{t("sectionsTitle")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((section) => {
                const Icon = portalIconByName(section.icon)
                return (
                  <Card key={section.id}>
                    <CardHeader>
                      {Icon !== null && (
                        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-5" />
                        </div>
                      )}
                      <CardTitle>{section.title}</CardTitle>
                    </CardHeader>
                    {isPresent(section.description) && (
                      <CardContent className="text-sm text-muted-foreground">
                        {section.description}
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        {(hasContact || socialLinks.length > 0) && (
          <section className="grid gap-6 sm:grid-cols-2">
            {hasContact && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("contactTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  {isPresent(site.contactEmail) && (
                    <a
                      href={`mailto:${site.contactEmail}`}
                      className="flex items-center gap-2 hover:text-foreground"
                    >
                      <MailIcon className="size-4 text-muted-foreground" />
                      {site.contactEmail}
                    </a>
                  )}
                  {isPresent(site.contactPhone) && (
                    <a
                      href={`tel:${site.contactPhone}`}
                      className="flex items-center gap-2 hover:text-foreground"
                    >
                      <PhoneIcon className="size-4 text-muted-foreground" />
                      {site.contactPhone}
                    </a>
                  )}
                  {isPresent(site.whatsappNumber) && (
                    <span className="flex items-center gap-2">
                      <MessageCircleIcon className="size-4 text-muted-foreground" />
                      {`${t("contactWhatsapp")}: ${site.whatsappNumber}`}
                    </span>
                  )}
                </CardContent>
              </Card>
            )}
            {socialLinks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("socialTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {socialLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border px-4 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      {link.label}
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        )}

        <Separator />

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">{t("messageTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("messageDesc")}</p>
          </div>
          <MessageForm />
        </section>

        <footer className="flex flex-col items-center gap-2 border-t pt-6 text-center text-sm text-muted-foreground">
          {isPresent(site.footerText) && <p>{site.footerText}</p>}
          {isPresent(site.privacyPolicyUrl) && (
            <a
              href={site.privacyPolicyUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              {t("privacyPolicy")}
            </a>
          )}
        </footer>
      </div>
    </>
  )
}
