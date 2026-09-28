import { PORTAL_ICON_NAMES } from "@repo/shared"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  Calendar,
  Cloud,
  Code,
  Compass,
  Database,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  Globe,
  Hammer,
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListTree,
  Lock,
  Mail,
  Menu,
  MessageSquare,
  Monitor,
  Network,
  Package,
  Palette,
  PanelLeft,
  Phone,
  PieChart,
  Rocket,
  Search,
  Server,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  Terminal,
  TrendingUp,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from "lucide-react"

/** 图标选择器可选集合：管理端常用 lucide 图标（按语义分组排序，够用不贪多） */
export const ICON_CHOICES: { name: string; icon: LucideIcon }[] = [
  // 导航/布局
  { name: "layout-dashboard", icon: LayoutDashboard },
  { name: "gauge", icon: Gauge },
  { name: "home", icon: Home },
  { name: "panel-left", icon: PanelLeft },
  { name: "menu", icon: Menu },
  { name: "list-tree", icon: ListTree },
  // 用户/角色/权限
  { name: "users", icon: Users },
  { name: "user-round", icon: UserRound },
  { name: "user-cog", icon: UserCog },
  { name: "shield", icon: Shield },
  { name: "shield-check", icon: ShieldCheck },
  { name: "key-round", icon: KeyRound },
  { name: "lock", icon: Lock },
  // 系统/设置
  { name: "settings", icon: Settings },
  { name: "settings-2", icon: Settings2 },
  { name: "sliders-horizontal", icon: SlidersHorizontal },
  { name: "hammer", icon: Hammer },
  { name: "wrench", icon: Wrench },
  { name: "layers", icon: Layers },
  { name: "boxes", icon: Boxes },
  // 数据/监控
  { name: "database", icon: Database },
  { name: "server", icon: Server },
  { name: "cloud", icon: Cloud },
  { name: "monitor", icon: Monitor },
  { name: "network", icon: Network },
  { name: "bar-chart-3", icon: BarChart3 },
  { name: "pie-chart", icon: PieChart },
  { name: "trending-up", icon: TrendingUp },
  { name: "target", icon: Target },
  { name: "compass", icon: Compass },
  // 内容/文档
  { name: "file-text", icon: FileText },
  { name: "folder", icon: Folder },
  { name: "folder-open", icon: FolderOpen },
  { name: "book-open", icon: BookOpen },
  { name: "code", icon: Code },
  { name: "terminal", icon: Terminal },
  { name: "palette", icon: Palette },
  // 业务/通讯
  { name: "building-2", icon: Building2 },
  { name: "mail", icon: Mail },
  { name: "phone", icon: Phone },
  { name: "message-square", icon: MessageSquare },
  { name: "bell", icon: Bell },
  { name: "calendar", icon: Calendar },
  { name: "globe", icon: Globe },
  { name: "search", icon: Search },
  { name: "shopping-cart", icon: ShoppingCart },
  { name: "package", icon: Package },
  { name: "wallet", icon: Wallet },
  { name: "tag", icon: Tag },
  { name: "sparkles", icon: Sparkles },
  { name: "rocket", icon: Rocket },
]

const ICON_MAP = new Map(ICON_CHOICES.map(({ name, icon }) => [name, icon]))

/** 按名称取 lucide 图标组件（未注册或空返回 null——侧边栏/表格渲染兜底） */
export function iconByName(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  return ICON_MAP.get(name) ?? null
}

/**
 * 门户图文区块可选图标：取值来自 @repo/shared 的 PORTAL_ICON_NAMES（管理端选择器 / API 校验 /
 * portal 渲染三端唯一清单），这里只保留本应用已注册的图标。
 * 清单必须是 ICON_CHOICES 的子集，由 test/portal-icons.test.ts 守护（否则运营会选到 portal 渲染不出的图标）。
 */
export const PORTAL_ICON_CHOICES: { name: string; icon: LucideIcon }[] = PORTAL_ICON_NAMES.flatMap((name) => {
  const icon = ICON_MAP.get(name)
  return icon ? [{ name, icon }] : []
})

const PORTAL_ICON_MAP = new Map(PORTAL_ICON_CHOICES.map(({ name, icon }) => [name, icon]))

/** 按名称取门户区块图标（取值受 PORTAL_ICON_NAMES 白名单约束；不在清单内返回 null） */
export function portalIconByName(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  return PORTAL_ICON_MAP.get(name) ?? null
}
