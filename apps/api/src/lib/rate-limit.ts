// 内存滑动窗口限流（单实例；进程重启失效，与 login-throttle 同取舍）。
// 与 login-throttle 的分工：那边是「认证失败计数 + 锁定」（账号维度，认证语义），
// 这里是「单位时间最多 N 次」（来源维度，公开写接口防刷语义）——两种语义不合并，
// 避免为复用而造出四不像的抽象。
// 防内存膨胀：条目硬上限 + 周期清扫（策略与 login-throttle 一致，每 100 次记账清扫一次）。
interface Window {
  stamps: number[]
  lastActive: number
}

const windows = new Map<string, Window>()
let operationCount = 0

/** 记账条目无活动保留时长（覆盖最长窗口；超过即清理） */
const STALE_MS = 60 * 60 * 1000

/** 内存条目硬上限（防 key 喷洒无界增长；超出按 lastActive 驱逐最久未活动条目） */
export const MAX_ENTRIES = 10_000

/** 清理长期无活动条目（周期性触发；导出便于单测直接调用） */
export function sweepStale(now = Date.now()): void {
  for (const [key, window] of windows) {
    if (window.lastActive < now - STALE_MS) windows.delete(key)
  }
}

/** 超出上限时驱逐 lastActive 最早的条目（近似 LRU，避免误伤活跃来源） */
function evictOldest(): void {
  while (windows.size > MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [key, window] of windows) {
      if (window.lastActive < oldestAt) {
        oldestAt = window.lastActive
        oldestKey = key
      }
    }
    if (oldestKey === null) return
    windows.delete(oldestKey)
  }
}

/**
 * 记账并返回是否放行：窗口内已达 limit 次返回 false（不记账）。
 * 同一请求的多条规则必须全部调用（不要用 && 短路），否则被跳过的规则等于没生效。
 */
export function consume(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  operationCount += 1
  if (operationCount % 100 === 0) sweepStale(now)
  const entry = windows.get(key) ?? { stamps: [], lastActive: now }
  const stamps = entry.stamps.filter((stamp) => stamp > now - windowMs)
  entry.stamps = stamps
  entry.lastActive = now
  if (stamps.length >= limit) {
    windows.set(key, entry)
    return false
  }
  stamps.push(now)
  windows.set(key, entry)
  evictOldest()
  return true
}

/** 测试辅助：当前内存条目数（验证清扫与上限行为） */
export function windowsSizeForTest(): number {
  return windows.size
}
