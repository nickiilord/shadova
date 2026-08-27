import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

// jsdom 未实现 ResizeObserver（input-otp 组件依赖），注入空实现
class ResizeObserverStub {
  observe: ResizeObserver["observe"] = () => undefined
  unobserve: ResizeObserver["unobserve"] = () => undefined
  disconnect: ResizeObserver["disconnect"] = () => undefined
}

globalThis.ResizeObserver = ResizeObserverStub

// jsdom 未实现 matchMedia（sidebar 的 use-mobile hook 依赖），注入最小实现
if (typeof window.matchMedia === "undefined") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

// jsdom 未实现 PointerEvent（Base UI checkbox 的 dispatchClickWithModifiers
// 内部构造 new PointerEvent("click") 分发到隐藏 input），注入 MouseEvent 子类兜底
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? "mouse"
      this.isPrimary = params.isPrimary ?? true
    }
  }
  window.PointerEvent = PointerEventStub as typeof PointerEvent
}

// 品牌名来自环境变量（config.ts 无内置默认）——测试环境显式 stub 保证断言稳定
vi.stubEnv("VITE_APP_NAME", "Shadova")

// i18n：测试统一中文（既有断言依赖中文文案）——动态 import 确保在初始化前写入语言偏好
localStorage.setItem("language", "zh")
await import("@/localization/i18n")
