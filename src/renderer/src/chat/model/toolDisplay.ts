/**
 * 工具调用的展示派生值。
 *
 * 放在 model 层而不是组件里：它们是纯函数，多个 part 都要用，
 * 而且 react-refresh 要求组件文件只导出组件（混着导出会让整个模块
 * 在热更新时重建，丢掉展开状态）。
 */
import type { ToolInvocation } from './toolInvocation'

/** 工具是否以失败告终（含被拒绝） */
export function toolFailed(invocation: ToolInvocation): boolean {
  const { state } = invocation
  return (
    (state.type === 'completed' && !state.success) ||
    (state.type === 'cancelled' && state.reason === 'denied')
  )
}

/** 耗时格式化。亚秒的工具调用显示 "0.4s" 比 "412ms" 更容易横向比较 */
export function formatDuration(ms: number | null): string | null {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}
