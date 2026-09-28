import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enAnnouncement from "./locales/en/announcement.json"
import enCommon from "./locales/en/common.json"
import enConfig from "./locales/en/config.json"
import enDashboard from "./locales/en/dashboard.json"
import enDepartment from "./locales/en/department.json"
import enDict from "./locales/en/dict.json"
import enErrors from "./locales/en/errors.json"
import enLogin from "./locales/en/login.json"
import enLogs from "./locales/en/logs.json"
import enMenus from "./locales/en/menus.json"
import enNotifications from "./locales/en/notifications.json"
import enPortal from "./locales/en/portal.json"
import enRoles from "./locales/en/roles.json"
import enSessions from "./locales/en/sessions.json"
import enUsers from "./locales/en/users.json"
import zhAnnouncement from "./locales/zh/announcement.json"
import zhCommon from "./locales/zh/common.json"
import zhConfig from "./locales/zh/config.json"
import zhDashboard from "./locales/zh/dashboard.json"
import zhDepartment from "./locales/zh/department.json"
import zhDict from "./locales/zh/dict.json"
import zhErrors from "./locales/zh/errors.json"
import zhLogin from "./locales/zh/login.json"
import zhLogs from "./locales/zh/logs.json"
import zhMenus from "./locales/zh/menus.json"
import zhNotifications from "./locales/zh/notifications.json"
import zhPortal from "./locales/zh/portal.json"
import zhRoles from "./locales/zh/roles.json"
import zhSessions from "./locales/zh/sessions.json"
import zhUsers from "./locales/zh/users.json"

/** 支持的语言（key 为 i18next 语言码；nativeName 展示名；prefix 为语言切换菜单的简写徽标） */
export const SUPPORTED_LANGUAGES = [
  { key: "zh", nativeName: "中文", prefix: "中" },
  { key: "en", nativeName: "English", prefix: "EN" },
] as const

export type LanguageKey = (typeof SUPPORTED_LANGUAGES)[number]["key"]

/** 语言检测：localStorage 记忆优先，其次浏览器语言（zh 开头用中文，否则英文） */
function detectInitialLanguage(): LanguageKey {
  const stored = localStorage.getItem("language")
  if (stored === "zh" || stored === "en") return stored
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

// 类型安全 key：翻译 key 写错编译期报错（resources 形状随语言 JSON 自动同步）
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common"
    resources: {
      common: typeof zhCommon
      announcement: typeof zhAnnouncement
      login: typeof zhLogin
      dashboard: typeof zhDashboard
      users: typeof zhUsers
      roles: typeof zhRoles
      menus: typeof zhMenus
      department: typeof zhDepartment
      logs: typeof zhLogs
      sessions: typeof zhSessions
      dict: typeof zhDict
      config: typeof zhConfig
      notifications: typeof zhNotifications
      portal: typeof zhPortal
      errors: typeof zhErrors
    }
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { common: zhCommon, announcement: zhAnnouncement, login: zhLogin, dashboard: zhDashboard, users: zhUsers, roles: zhRoles, menus: zhMenus, department: zhDepartment, logs: zhLogs, sessions: zhSessions, dict: zhDict, config: zhConfig, notifications: zhNotifications, portal: zhPortal, errors: zhErrors },
    en: { common: enCommon, announcement: enAnnouncement, login: enLogin, dashboard: enDashboard, users: enUsers, roles: enRoles, menus: enMenus, department: enDepartment, logs: enLogs, sessions: enSessions, dict: enDict, config: enConfig, notifications: enNotifications, portal: enPortal, errors: enErrors },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "zh",
  defaultNS: "common",
  ns: ["common", "announcement", "login", "dashboard", "users", "roles", "menus", "department", "logs", "sessions", "dict", "config", "notifications", "portal", "errors"],
  interpolation: { escapeValue: false },
})

export default i18n
