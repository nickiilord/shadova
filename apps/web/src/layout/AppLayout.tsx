import { Fragment, useMemo, useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ChevronRightIcon,
  ChevronsUpDownIcon,
  FileIcon,
  FolderIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"

import type { components } from "@/api/schema"
import { useAuth } from "@/auth/AuthProvider"
import ErrorBoundary from "@/components/business/ErrorBoundary"
import { LanguageToggle } from "@/components/business/LanguageToggle"
import { NotificationBell } from "@/components/business/NotificationBell"
import { ThemeToggle } from "@/components/business/ThemeToggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ProfileDialog } from "@/features/system/user/ProfileDialog"
import { ChangePasswordDialog } from "@/features/system/user/ChangePasswordDialog"
import { avatarUrl } from "@/lib/avatar"
import { menuDisplayName } from "@/localization/menuName"
import { APP_NAME } from "@/config"
import { iconByName } from "@/lib/icons"
import { cn } from "@/lib/utils"
import ForbiddenPage from "@/pages/ForbiddenPage"
import NotFoundPage from "@/pages/NotFoundPage"
import { ME_QUERY_KEY, useMeQuery } from "@/router/guards"
import { filterNavigableMenus, menuToRoutes } from "@/router/generateRoutes"

type MenuNode = components["schemas"]["MenuNode"]

/**
 * MENU → SidebarMenuButton 渲染为 NavLink（end：对齐 aria-current 与视觉精确匹配，
 * 避免 to="/" 时前缀匹配导致的常驻高亮）；isActive 驱动 data-active 高亮，
 * 另加左侧竖向指示条（after 伪元素）强化激活态
 */
function MenuLink({ node }: { node: MenuNode }): JSX.Element | null {
  const location = useLocation()
  const isActive = location.pathname === node.path
  if (!node.path) return null
  const Icon = iconByName(node.icon)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={node.path} end />}
        isActive={isActive}
        className="relative after:absolute after:inset-y-1.5 after:left-0 after:w-0.5 after:rounded-full after:bg-sidebar-primary after:opacity-0 data-active:after:opacity-100"
      >
        {Icon ? <Icon className="size-4 shrink-0" /> : null}
        <span>{menuDisplayName(node)}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** DIR 子级 MENU：SidebarMenuSubButton 渲染为 NavLink（缩进 + 左侧边框样式） */
function SubMenuLink({ node }: { node: MenuNode }): JSX.Element | null {
  const location = useLocation()
  if (!node.path) return null
  const Icon = iconByName(node.icon)
  return (
    <SidebarMenuSubButton
      render={<NavLink to={node.path} end />}
      isActive={location.pathname === node.path}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span>{menuDisplayName(node)}</span>
    </SidebarMenuSubButton>
  )
}

/** DIR：Collapsible 分组（可折叠，shadcn 官方组件），trigger 为 SidebarMenuButton，面板为 SidebarMenuSub */
function DirGroup({ node }: { node: MenuNode }): JSX.Element {
  const Icon = iconByName(node.icon) ?? FolderIcon
  return (
    <Collapsible className="group/collapsible" defaultOpen>
      <SidebarMenuItem>
        <CollapsibleTrigger render={<SidebarMenuButton />}>
          <Icon className="size-4 shrink-0" />
          <span>{menuDisplayName(node)}</span>
          <ChevronRightIcon className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
        </CollapsibleTrigger>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub>
          {node.children.map((child) => (
            <SubMenuEntry key={child.id} node={child} />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** DIR 子级条目：MENU → 子菜单链接；BUTTON → 不渲染；DIR → 纯分组标签 + 递归子菜单（种子数据无此形状，兜底） */
function SubMenuEntry({ node }: { node: MenuNode }): JSX.Element | null {
  if (node.type === "BUTTON") return null
  if (node.type === "DIR") {
    return (
      <SidebarMenuSubItem>
        <span className="flex h-7 items-center px-2 text-xs font-medium text-sidebar-foreground/70">
          {menuDisplayName(node)}
        </span>
        <SidebarMenuSub>
          {node.children.map((child) => (
            <SubMenuEntry key={child.id} node={child} />
          ))}
        </SidebarMenuSub>
      </SidebarMenuSubItem>
    )
  }
  return (
    <SidebarMenuSubItem>
      <SubMenuLink node={node} />
    </SidebarMenuSubItem>
  )
}

/**
 * 侧边栏导航：顶层 MENU → 固定 "总览" 组；顶层 DIR → 可折叠分组（Collapsible，
 * 默认展开，点击目录名收起/展开——管理端目录惯例）；嵌套 DIR 同样可折叠递归。
 */
function Navigation({ navTree }: { navTree: MenuNode[] }): JSX.Element {
  const { t } = useTranslation()
  const overview = navTree.filter((node) => node.type === "MENU")
  const dirGroups = navTree.filter((node) => node.type === "DIR")
  return (
    <>
      {overview.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel>{t("overview")}</SidebarGroupLabel>
          <SidebarMenu>
            {overview.map((node) => (
              <MenuLink key={node.id} node={node} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      {dirGroups.length > 0 && (
        <SidebarGroup>
          <SidebarMenu>
            {dirGroups.map((node) => (
              <DirGroup key={node.id} node={node} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  )
}

/** 沿 navTree 查找 pathname 对应 MENU 的祖先链（含自身）；未命中返回 null */
function findMenuTrail(
  nodes: MenuNode[],
  pathname: string,
  ancestors: MenuNode[] = [],
): MenuNode[] | null {
  for (const node of nodes) {
    if (node.type === "MENU" && node.path === pathname) return [...ancestors, node]
    const found = findMenuTrail(node.children, pathname, [...ancestors, node])
    if (found) return found
  }
  return null
}

/** 顶栏面包屑：祖先后缀链（如 系统管理 / 用户管理）；无匹配路径显示 "控制台" 兜底。
 * 每段显示菜单配置的图标（iconByName），未配置时按类型默认（DIR→文件夹、MENU→文件） */
function Breadcrumb({ trail }: { trail: MenuNode[] | null }): JSX.Element {
  const { t } = useTranslation()
  if (!trail || trail.length === 0) {
    return <span className="text-sm font-medium">{t("console")}</span>
  }
  return (
    <nav aria-label={t("breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-sm">
      {trail.map((node, index) => {
        const isLast = index === trail.length - 1
        const Icon = iconByName(node.icon) ?? (node.type === "DIR" ? FolderIcon : FileIcon)
        return (
          <Fragment key={node.id}>
            {index > 0 && (
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
            )}
            <Icon className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span
              className={cn(
                "truncate",
                isLast ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {menuDisplayName(node)}
            </span>
          </Fragment>
        )
      })}
    </nav>
  )
}

export default function AppLayout(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()
  const { data: me } = useMeQuery()
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  // 路由在 me 数据就绪后生成（navTree 变化 → 重建）；RequireAuth 已拉取同 key 查询，共享缓存
  const sourceNavTree = me?.navTree
  const navTree = useMemo(() => filterNavigableMenus(sourceNavTree ?? []), [sourceNavTree])
  const routes = useMemo(() => menuToRoutes(navTree), [navTree])
  const trail = useMemo(
    () => findMenuTrail(navTree, location.pathname),
    [navTree, location.pathname],
  )

  async function handleLogout(): Promise<void> {
    await auth.logout()
    // 清掉 me 缓存，避免退出后旧用户数据残留（同一 QueryClient 跨登录复用）
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
    void navigate("/login")
  }

  return (
    <>
    <SidebarProvider>
      <Sidebar collapsible="icon">
        {/* 品牌区：字母 mark（渐变方块 + P）+ 字标；折叠为 icon 模式时仅保留居中的 mark */}
        <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-0">
          <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary to-primary/70 text-primary-foreground">
              <span className="text-sm font-bold leading-none">{APP_NAME.charAt(0)}</span>
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold leading-tight">{APP_NAME}</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <Navigation navTree={navTree} />
        </SidebarContent>
        {/* 用户区（shadcn sidebar-15 UserMenu 官方区块形态）：SidebarMenuButton size="lg" 舒展尺寸、
            打开态高亮（data-[state=open]）、grid 两行文本、ChevronsUpDown 锚点；全部使用 shadcn 组件 */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      className="gap-3 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    />
                  }
                >
                  <Avatar className="size-8 shrink-0">
                    {/* 有头像显示图片，否则回退昵称首字 */}
                    {me?.user.avatar && (
                      <img
                        src={avatarUrl(me.user.avatar) ?? undefined}
                        alt={me.user.nickname}
                        className="size-full rounded-full object-cover"
                      />
                    )}
                    <AvatarFallback className="text-xs">
                      {me?.user.nickname.slice(0, 1) ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{me?.user.nickname ?? "…"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {me?.user.email ?? me?.user.username ?? ""}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-48">
                  {/* Label 必须包在 Group 内：Base UI 1.7 的 GroupLabel 无 Group 上下文会抛
                      MenuGroupContext is missing → 渲染错误卸载整树（曾导致点击用户菜单白屏）。
                      信息区：昵称 + 邮箱 + 手机号（不展示 username 登录字段） */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      <div className="flex flex-col gap-1 py-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {me?.user.nickname ?? "…"}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t("profileEmail", { value: me?.user.email ?? t("unset") })}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t("profilePhone", { value: me?.user.telephone ?? t("unset") })}
                        </span>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {/* 用户设置：打开个人资料编辑弹窗（自己改自己的昵称/邮箱/手机号） */}
                  <DropdownMenuItem
                    onClick={() => {
                      setProfileOpen(true)
                    }}
                  >
                    <SettingsIcon />
                    {t("userSettings")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setPasswordOpen(true)
                    }}
                  >
                    <SettingsIcon />
                    {t("changePassword")}
                  </DropdownMenuItem>
                  {/* 退出登录用主题默认配色（不用 destructive 红色——跟随明暗主题） */}
                  <DropdownMenuItem
                    onClick={() => {
                      void handleLogout()
                    }}
                  >
                    <LogOutIcon />
                    {t("logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Breadcrumb trail={trail} />
          {/* 消息中心 + 主题切换：固定在顶栏右上角 */}
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageToggle />
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">
          {/* 内层容器统一页面留白与最大宽度（大屏限宽保持版式比例） */}
          <div className="mx-auto w-full max-w-7xl px-6 py-6">
            {/* 错误边界只包内层 Routes：页面渲染抛错时兜底，侧边栏/顶栏与登录流程不受影响 */}
            <ErrorBoundary>
              <Routes>
                {routes.map((route) => (
                  <Route key={route.path} path={route.path} element={route.element} />
                ))}
                {/* 403 兜底：权限交集已过滤导航，此路由供错误边界/未来扩展或手动访问使用 */}
                <Route path="/403" element={<ForbiddenPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
      {/* 用户设置弹窗（个人资料编辑）：条件挂载，me 就绪后可用 */}
      {profileOpen && me?.user && (
        <ProfileDialog
          user={me.user}
          onClose={() => {
            setProfileOpen(false)
          }}
        />
      )}
      {passwordOpen && (
        <ChangePasswordDialog onClose={() => { setPasswordOpen(false); }} />
      )}
    </>
  )
}
