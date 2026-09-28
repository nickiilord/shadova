import { PORTAL_ICON_NAMES, type PortalIconName } from "@repo/shared"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  Cloud,
  Code,
  Compass,
  Globe,
  Layers,
  Mail,
  MessageSquare,
  Package,
  Palette,
  Phone,
  PieChart,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

/**
 * 门户图文区块图标映射：键类型是 @repo/shared 的 PortalIconName，
 * 清单增删时此处编译期报错（缺失或多出都过不了类型检查）。
 */
const PORTAL_ICONS: Record<PortalIconName, LucideIcon> = {
  sparkles: Sparkles,
  rocket: Rocket,
  target: Target,
  globe: Globe,
  "shield-check": ShieldCheck,
  layers: Layers,
  "trending-up": TrendingUp,
  "bar-chart-3": BarChart3,
  "pie-chart": PieChart,
  users: Users,
  "building-2": Building2,
  wallet: Wallet,
  "shopping-cart": ShoppingCart,
  package: Package,
  tag: Tag,
  mail: Mail,
  phone: Phone,
  "message-square": MessageSquare,
  compass: Compass,
  "book-open": BookOpen,
  calendar: Calendar,
  cloud: Cloud,
  code: Code,
  palette: Palette,
}

/**
 * 按名称取区块图标；未设置或不在清单内返回 null（区块降级为纯文字卡片）。
 * 数据库中的图标名可能来自旧版本清单，故按值域收窄后再取值，不做无校验断言。
 */
export function portalIconByName(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  const key = PORTAL_ICON_NAMES.find((candidate) => candidate === name)
  return key === undefined ? null : PORTAL_ICONS[key]
}
