/**
 * 工具调用的展示派生值。
 *
 * 放在 model 层而不是组件里:它们是纯函数,多个 part 都要用,
 * 而且 react-refresh 要求组件文件只导出组件(混着导出会让整个模块
 * 在热更新时重建,丢掉展开状态)。
 */
import type { ToolInvocation } from './toolInvocation'

/** 工具是否以失败告终(含被拒绝) */
export function toolFailed(invocation: ToolInvocation): boolean {
  const { state } = invocation
  return (
    (state.type === 'completed' && !state.success) ||
    (state.type === 'cancelled' && state.reason === 'denied')
  )
}

/** 是否还在跑 —— 决定摘要走不走流光、展开体默认开不开 */
export function toolRunning(invocation: ToolInvocation): boolean {
  return invocation.state.type === 'executing' || invocation.state.type === 'streaming'
}

/** `ToolActivityDisclosure` 的 status 档 */
export function toolStatus(invocation: ToolInvocation): 'running' | 'completed' {
  return toolRunning(invocation) ? 'running' : 'completed'
}

/** 耗时格式化。亚秒的工具调用显示 "0.4s" 比 "412ms" 更容易横向比较 */
export function formatDuration(ms: number | null): string | null {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/**
 * 活动行的摘要文案 —— **耗时是拼进句子里的,不是另起一个后缀 span**。
 *
 * 这是照 Codex 的 `toolSummaryForCmd.*` 一族文案抄的,那边一共六种形态,
 * 按状态选连接词:
 *
 * | 状态 | Codex 文案 id | 形态 |
 * |---|---|---|
 * | 进行中,无耗时 | `runningGenericCommandWithoutElapsed` | `Running command` |
 * | 进行中,有耗时 | `runningGenericCommandWithElapsed` | `Running command **for** {elapsed}` |
 * | 已完成,无耗时 | `ranGenericCommandWithoutElapsed` | `Ran command` |
 * | 已完成,有耗时 | `ranGenericCommandWithElapsed` | `Ran command **in** {elapsed}` |
 * | 被中断,无耗时 | `stoppedGenericCommandWithoutElapsed` | `Stopped command` |
 * | 被中断,有耗时 | `stoppedGenericCommandWithElapsed` | `Stopped command **after** {elapsed}` |
 *
 * 三个连接词各不相同(for / in / after),不是同一个模板换时态 —— 这点只有
 * 读文案表才知道。之前 WS 是"标题 + 一个装耗时的 `.chat-tool-suffix` span",
 * 那在 Codex 里对应的是 `accessory` 槽,而 accessory 是给增删行数那种
 * **结构化附加信息**用的,耗时属于句子。
 *
 * 时态本身走 adapter 给的两个字段(`invocationMessage` / `pastTenseMessage`),
 * 它们的措辞已经是 `Running X` / `Ran X` 这一套,与 Codex 同构。
 */
export function toolSummary(invocation: ToolInvocation): string {
  const { state } = invocation
  const elapsed = state.type === 'completed' ? formatDuration(state.durationMs) : null

  if (state.type === 'cancelled') {
    // 被中断/拒绝:换成 "Stopped …",时态不再是"做过了"
    const stopped = stoppedPhrase(invocation.invocationMessage)
    return state.reason === 'denied' ? `${stopped} (skipped)` : stopped
  }

  if (toolRunning(invocation)) return invocation.invocationMessage

  const done = invocation.pastTenseMessage ?? invocation.invocationMessage
  return elapsed == null ? done : `${done} in ${elapsed}`
}

/**
 * `Running npm test` → `Stopped npm test`。
 *
 * 认不出进行时的开头就整句前面加 "Stopped:" —— 硬套模板会造出
 * "Stopped Searched the web" 这种句子。
 */
function stoppedPhrase(invocationMessage: string): string {
  const m = /^(Running|Searching|Editing|Reading)\s+(.*)$/.exec(invocationMessage)
  return m ? `Stopped ${m[2]}` : `Stopped: ${invocationMessage}`
}
