import i18n from "@/localization/i18n"

/**
 * 时间展示（唯一实现）：跟随界面语言（zh-CN / en-US，24 小时制），非法值显示 "-"。
 * 此前 log / session / notifications 三个页面各有一份副本且兜底行为不一致（前者原样返回非法值），
 * announcement 另有不跟随语言的内联写法——统一收敛到这里。
 */
export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString(i18n.language === "zh" ? "zh-CN" : "en-US", { hour12: false })
}
