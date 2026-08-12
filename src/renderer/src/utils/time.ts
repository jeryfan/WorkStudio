const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const YEAR = 365 * DAY

/**
 * 时间戳 → 紧凑相对时间（"3m" / "12h" / "2w"）。
 *
 * 侧栏空间只够两三个字符，因此不用 Intl.RelativeTimeFormat 的完整措辞。
 * 关键是不要把结果存进数据模型——跨天、跨时区、窗口长时间不刷新时，
 * 预先格式化的文案会立刻与事实不符。
 *
 * @param timestampMs 毫秒时间戳
 * @param nowMs 当前时间，便于测试注入
 */
export function formatRelativeTime(timestampMs: number, nowMs = Date.now()): string {
  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000))
  if (seconds < MINUTE) return 'now'
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`
  if (seconds < WEEK) return `${Math.floor(seconds / DAY)}d`
  if (seconds < YEAR) return `${Math.floor(seconds / WEEK)}w`
  return `${Math.floor(seconds / YEAR)}y`
}

/**
 * 毫秒时长 → 紧凑文案（"54m 53s" / "3s"）。
 * 用于轮次耗时；不足一秒显示 0s 而不是空字符串。
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
