import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enPortal from "./locales/en/portal.json"
import zhPortal from "./locales/zh/portal.json"

export const SUPPORTED_LANGUAGES = ["zh", "en"] as const
export type LanguageKey = (typeof SUPPORTED_LANGUAGES)[number]

/** 语言检测：localStorage 记忆优先，其次浏览器语言（与 apps/web 同规则，门户不做切换 UI，自动跟随） */
function detectInitialLanguage(): LanguageKey {
  const stored = localStorage.getItem("language")
  if (stored === "zh" || stored === "en") return stored
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

// 类型安全 key：翻译 key 写错编译期报错（resources 形状随语言 JSON 自动同步）
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "portal"
    resources: { portal: typeof zhPortal }
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { portal: zhPortal },
    en: { portal: enPortal },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "zh",
  defaultNS: "portal",
  ns: ["portal"],
  interpolation: { escapeValue: false },
})

export default i18n
