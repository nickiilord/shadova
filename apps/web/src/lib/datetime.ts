import i18n from "@/localization/i18n"

/**
 * 时间列的完整展示（唯一实现）：跟随界面语言（zh-CN / en-US，24 小时制），非法值显示 "-"。
 * 管理端时间列一律走这里，不要在页面内联 toLocaleString —— 那会让各页兜底行为分叉。
 * （NotificationBell 的「月日时分」短格式是顶栏预览用的另一种形态，不复用此处。）
 */
export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString(i18n.language === "zh" ? "zh-CN" : "en-US", { hour12: false })
}
