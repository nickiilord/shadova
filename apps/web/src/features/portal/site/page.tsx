import { useEffect, useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { PERMISSIONS } from "@repo/shared"

import { PageHeader } from "@/components/business/PageHeader"
import { Permission } from "@/components/business/Permission"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { usePortalSiteQuery, useSavePortalSiteMutation } from "./usePortalSite"
import type { PortalSite, PortalSiteUpdateInput } from "./usePortalSite"

/** 表单态：可空字段在界面统一表现为空串，提交时再还原为 null（避免空串覆盖数据库中的“未配置”） */
interface SiteForm {
  siteName: string
  siteTagline: string
  contactEmail: string
  contactPhone: string
  whatsappNumber: string
  facebookUrl: string
  instagramUrl: string
  youtubeUrl: string
  telegramUrl: string
  privacyPolicyUrl: string
  footerText: string
  seoTitle: string
  seoDescription: string
  seoKeywords: string
}

/** 服务端返回 → 表单态（null 一律展示为空串） */
function toSiteForm(site: PortalSite): SiteForm {
  return {
    siteName: site.siteName,
    siteTagline: site.siteTagline ?? "",
    contactEmail: site.contactEmail ?? "",
    contactPhone: site.contactPhone ?? "",
    whatsappNumber: site.whatsappNumber ?? "",
    facebookUrl: site.facebookUrl ?? "",
    instagramUrl: site.instagramUrl ?? "",
    youtubeUrl: site.youtubeUrl ?? "",
    telegramUrl: site.telegramUrl ?? "",
    privacyPolicyUrl: site.privacyPolicyUrl ?? "",
    footerText: site.footerText ?? "",
    seoTitle: site.seoTitle ?? "",
    seoDescription: site.seoDescription ?? "",
    seoKeywords: site.seoKeywords ?? "",
  }
}

/** 空串转 null（PUT 语义：null 表示清空该项；直接提交空串会与“未配置”混淆） */
function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/** 表单态 → PUT 请求体（站点名称必填，其余空串转 null） */
function toSitePatch(form: SiteForm): PortalSiteUpdateInput {
  return {
    siteName: form.siteName.trim(),
    siteTagline: toNullable(form.siteTagline),
    contactEmail: toNullable(form.contactEmail),
    contactPhone: toNullable(form.contactPhone),
    whatsappNumber: toNullable(form.whatsappNumber),
    facebookUrl: toNullable(form.facebookUrl),
    instagramUrl: toNullable(form.instagramUrl),
    youtubeUrl: toNullable(form.youtubeUrl),
    telegramUrl: toNullable(form.telegramUrl),
    privacyPolicyUrl: toNullable(form.privacyPolicyUrl),
    footerText: toNullable(form.footerText),
    seoTitle: toNullable(form.seoTitle),
    seoDescription: toNullable(form.seoDescription),
    seoKeywords: toNullable(form.seoKeywords),
  }
}

/**
 * 站点配置页：门户首页的品牌、联系方式、社交链接、页脚与 SEO 单行配置表单。
 * 保存按钮由 <Permission code={PERMISSIONS.portalSiteUpdate}> 门控（读取需 portal:site:query，由路由守卫保证）。
 */
export default function PortalSitePage(): JSX.Element {
  const { t } = useTranslation("portal")
  const { data, isLoading, isError, error } = usePortalSiteQuery()
  const saveMutation = useSavePortalSiteMutation()
  const [form, setForm] = useState<SiteForm | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // 数据就绪后初始化表单（仅一次，避免覆盖用户正在编辑的内容）
  useEffect(() => {
    if (data && form === null) setForm(toSiteForm(data))
  }, [data, form])

  function update(field: keyof SiteForm, value: string): void {
    setForm((prev) => (prev === null ? prev : { ...prev, [field]: value }))
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!form) return
    if (!form.siteName.trim()) {
      setValidationError(t("siteNameRequired"))
      return
    }
    setValidationError(null)
    saveMutation.mutate(toSitePatch(form))
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t("siteTitle")} description={t("siteDesc")} />
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("siteTitle")} description={t("siteDesc")} />

      {isLoading || form === null ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>{t("brandSection")}</CardTitle>
              <CardDescription>{t("siteDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="portal-site-name">{t("siteName")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-name"
                      maxLength={191}
                      value={form.siteName}
                      onChange={(event) => {
                        update("siteName", event.target.value)
                      }}
                      placeholder={t("siteNamePlaceholder")}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="portal-site-tagline">{t("siteTagline")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-tagline"
                      maxLength={191}
                      value={form.siteTagline}
                      onChange={(event) => {
                        update("siteTagline", event.target.value)
                      }}
                      placeholder={t("siteTaglinePlaceholder")}
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("contactSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="portal-site-email">{t("contactEmail")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-email"
                      maxLength={191}
                      value={form.contactEmail}
                      onChange={(event) => {
                        update("contactEmail", event.target.value)
                      }}
                      placeholder={t("optionalPlaceholder")}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="portal-site-phone">{t("contactPhone")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-phone"
                      maxLength={64}
                      value={form.contactPhone}
                      onChange={(event) => {
                        update("contactPhone", event.target.value)
                      }}
                      placeholder={t("optionalPlaceholder")}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="portal-site-whatsapp">{t("whatsappNumber")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-whatsapp"
                      maxLength={64}
                      value={form.whatsappNumber}
                      onChange={(event) => {
                        update("whatsappNumber", event.target.value)
                      }}
                      placeholder={t("optionalPlaceholder")}
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("socialSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {(
                  [
                    ["facebookUrl", "facebookUrl"],
                    ["instagramUrl", "instagramUrl"],
                    ["youtubeUrl", "youtubeUrl"],
                    ["telegramUrl", "telegramUrl"],
                  ] as const
                ).map(([field, labelKey]) => (
                  <Field key={field}>
                    <FieldLabel htmlFor={`portal-site-${field}`}>{t(labelKey)}</FieldLabel>
                    <FieldContent>
                      <Input
                        id={`portal-site-${field}`}
                        value={form[field]}
                        maxLength={512}
                        onChange={(event) => {
                          update(field, event.target.value)
                        }}
                        placeholder={t("urlPlaceholder")}
                      />
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("footerSection")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="portal-site-privacy">{t("privacyPolicyUrl")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-privacy"
                      maxLength={512}
                      value={form.privacyPolicyUrl}
                      onChange={(event) => {
                        update("privacyPolicyUrl", event.target.value)
                      }}
                      placeholder={t("urlPlaceholder")}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="portal-site-footer">{t("footerText")}</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="portal-site-footer"
                      maxLength={2000}
                      value={form.footerText}
                      onChange={(event) => {
                        update("footerText", event.target.value)
                      }}
                      placeholder={t("footerTextPlaceholder")}
                      rows={2}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="portal-site-seo-title">{t("seoTitle")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-seo-title"
                      maxLength={191}
                      value={form.seoTitle}
                      onChange={(event) => {
                        update("seoTitle", event.target.value)
                      }}
                      placeholder={t("optionalPlaceholder")}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="portal-site-seo-description">{t("seoDescription")}</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="portal-site-seo-description"
                      maxLength={1000}
                      value={form.seoDescription}
                      onChange={(event) => {
                        update("seoDescription", event.target.value)
                      }}
                      placeholder={t("seoDescriptionPlaceholder")}
                      rows={2}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="portal-site-seo-keywords">{t("seoKeywords")}</FieldLabel>
                  <FieldContent>
                    <Input
                      id="portal-site-seo-keywords"
                      maxLength={500}
                      value={form.seoKeywords}
                      onChange={(event) => {
                        update("seoKeywords", event.target.value)
                      }}
                      placeholder={t("seoKeywordsPlaceholder")}
                    />
                    <FieldDescription>{t("seoKeywordsPlaceholder")}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {validationError && (
            <p role="alert" className="text-sm text-destructive">
              {validationError}
            </p>
          )}

          <div className="flex justify-end">
            <Permission code={PERMISSIONS.portalSiteUpdate}>
              <Button type="submit" disabled={saveMutation.isPending} className="h-9">
                {saveMutation.isPending ? t("saving") : t("save")}
              </Button>
            </Permission>
          </div>
        </form>
      )}
    </div>
  )
}
