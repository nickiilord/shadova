/**
 * 门户图文区块可选图标名（唯一来源：管理端选择器、API zod 校验、portal 渲染三处共用）。
 *
 * 与菜单图标（`apps/web/src/lib/icons.ts` 的 `ICON_CHOICES`）解耦：菜单图标偏功能语义，
 * 这里是面向访客的内容展示语义。取值必须是 `ICON_CHOICES` 的子集——管理端按本清单过滤出
 * 选择器选项，子集关系由 `apps/web` 的守护测试保证（否则运营会选到 portal 渲染不出的图标）。
 */
export const PORTAL_ICON_NAMES = [
  "sparkles",
  "rocket",
  "target",
  "globe",
  "shield-check",
  "layers",
  "trending-up",
  "bar-chart-3",
  "pie-chart",
  "users",
  "building-2",
  "wallet",
  "shopping-cart",
  "package",
  "tag",
  "mail",
  "phone",
  "message-square",
  "compass",
  "book-open",
  "calendar",
  "cloud",
  "code",
  "palette",
] as const

export type PortalIconName = (typeof PORTAL_ICON_NAMES)[number]
