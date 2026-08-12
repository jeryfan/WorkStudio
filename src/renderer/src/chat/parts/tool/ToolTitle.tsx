import type { ToolInvocation } from '../../model/toolInvocation'
import { toolFailed } from '../../model/toolDisplay'
import { Codicon } from '../Codicon'

/**
 * 工具调用的标题行。
 *
 * 三种工具的标题结构一样，所以抽出来：图标 + 文案 + 状态后缀。
 *
 * 时态跟着状态走（"Running…" / "Ran …"）——这是上游 `invocationMessage` 与
 * `pastTenseMessage` 两个字段存在的全部理由。进行中的条目用过去时读起来像
 * 已经做完了，扫一眼会误判进度。
 *
 * **图标由状态决定，不由工具类型决定，而且进行中没有转圈图标。**
 * 这是照上游改的，`chatToolInvocationSubPart.ts getProgressIcon()` 的注释
 * 说得很直白：
 *
 *   > never returns the looping loading spinner — progress rows convey
 *   > activity via shimmer instead
 *
 * 配套 CSS 是 `.shimmer-progress > .codicon { display: none }`。同一件事用
 * 流光和转圈表达两遍是噪音，两个动画的节奏还对不上，看着更乱。
 */
export function ToolTitle({
  invocation,
  suffix,
  variant = 'collapsible'
}: {
  invocation: ToolInvocation
  /** 标题右侧的补充信息，如耗时、增删行数 */
  suffix?: React.ReactNode
  /**
   * 决定完成后那个对勾显不显示：
   *   collapsible  折叠型（终端、入参出参、文件改动）——上游默认**隐藏**它，
   *                由可访问性设置 chat.showChatCheckmarks 打开（默认 false）
   *   progress     单行进度型（检索）——上游的 .progress-container 一直显示
   */
  variant?: 'collapsible' | 'progress'
}): React.JSX.Element {
  const { state } = invocation
  const running = state.type === 'executing' || state.type === 'streaming'
  const text = running
    ? invocation.invocationMessage
    : (invocation.pastTenseMessage ?? invocation.invocationMessage)

  const failed = toolFailed(invocation)
  // 进行中不给图标：活动由文字流光表达
  const icon = failed ? 'error' : running ? null : 'check'

  return (
    <span className="chat-tool-title">
      {icon && (
        <Codicon
          name={icon}
          className={
            failed
              ? 'chat-tool-icon chat-tool-icon-error'
              : `chat-tool-icon chat-tool-check-${variant}`
          }
        />
      )}
      <span className={`chat-tool-label${running ? ' chat-shimmer-text' : ''}`}>{text}</span>
      {suffix && <span className="chat-tool-suffix">{suffix}</span>}
    </span>
  )
}
