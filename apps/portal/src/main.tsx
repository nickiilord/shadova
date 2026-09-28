import { StrictMode, useState } from "react"
import type { JSX } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import PortalHomePage from "@/features/home/page"
import i18n from "@/localization/i18n"
import "./index.css"

/** 同步 <html lang>（SEO 与无障碍），语言变化时跟随 */
function syncHtmlLang(language: string): void {
  document.documentElement.lang = language.startsWith("zh") ? "zh-CN" : "en"
}

syncHtmlLang(i18n.language)
i18n.on("languageChanged", syncHtmlLang)

/**
 * 门户根组件：公开单页应用。
 * 当前只有首页，故不引入 react-router（需要多页时再引入）；QueryClient 惰性创建一次。
 */
export function App(): JSX.Element {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <PortalHomePage />
      <Toaster />
    </QueryClientProvider>
  )
}

const rootElement = document.getElementById("root")
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
