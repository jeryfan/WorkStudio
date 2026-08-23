import { useState, type ReactNode } from 'react'
import { CadencedShimmer } from '../CadencedShimmer'
import { ActivityHeaderRow } from './ActivityHeaderRow'
import { DisclosureBody } from './DisclosureBody'

/**
 * `ToolActivityDisclosure`(Codex `tool-activity-disclosure` 源码 `Y`) ——
 * 一次工具调用在会话里的完整形态:一行摘要,点开是细节。
 *
 * ## 它替掉了什么
 *
 * 之前 WS 的工具调用走 VS Code 的 `Collapsible`(`.chat-used-context` +
 * `grid-template-rows: 0fr→1fr` 动画 + 常驻 chevron + 完成后的对勾图标)。
 * Codex 一个都没有:动画是**测量出来的像素高度**,chevron 平时透明,
 * 完成状态不给对勾 —— 状态由摘要的时态("Ran …" vs "Running …")与流光表达。
 *
 * ## 两个状态位,不是一个
 *
 * ```
 * const [runningExpanded, setRunningExpanded] = useState(false)
 * const [idleExpanded,    setIdleExpanded]    = useState(defaultExpanded)
 * const expanded = hasBody && (running ? !runningExpanded : idleExpanded)
 * ```
 *
 * 注意 running 那一档取的是**非**:`runningExpanded` 初值 false → 运行中默认
 * **展开**,点一下把它置 true 才收起。也就是说这个 state 的语义是
 * "用户主动收起过"。运行结束后切到 `idleExpanded`(默认 false)→ 自动收起。
 *
 * 这正好是「跑的时候看得见,跑完自动让路」——而且不需要任何 effect 去同步:
 * 换的是读哪个 state,不是去写另一个。我第一版想成"一个 expanded + useEffect
 * 在 status 变化时重置",那会在 status 抖动时把用户的展开操作抹掉。
 *
 * `onExpand` 只在**即将展开**时触发(`expanded || onExpand?.()`),给调用方做
 * 懒加载:细节很多时(整个终端输出)不必在收起状态下先拉一遍。
 */
export function ToolActivityDisclosure({
  accessory,
  defaultExpanded = false,
  icon,
  indentContent = true,
  onExpand,
  status,
  summary,
  children
}: {
  accessory?: ReactNode
  defaultExpanded?: boolean
  icon?: ReactNode
  /** 展开体是否缩进到与表头文字对齐(`ps-6`)。默认 true */
  indentContent?: boolean
  /** 即将展开时触发,用于懒加载细节 */
  onExpand?(): void
  status: 'running' | 'completed'
  summary: ReactNode
  /** 有 children 才可展开;没有就是一行纯摘要 */
  children?: ReactNode
}): React.JSX.Element {
  const [runningExpanded, setRunningExpanded] = useState(false)
  const [idleExpanded, setIdleExpanded] = useState(defaultExpanded)

  const running = status === 'running'
  const hasBody = children != null
  const expanded = hasBody && (running ? !runningExpanded : idleExpanded)

  const onToggle = (): void => {
    if (!expanded) onExpand?.()
    if (running) setRunningExpanded(!runningExpanded)
    else setIdleExpanded(!idleExpanded)
  }

  return (
    <ActivityHeaderRow
      icon={icon}
      accessory={accessory}
      summary={
        <CadencedShimmer
          active={running}
          className="min-w-0 truncate text-size-chat text-token-conversation-summary-leading group-hover/activity-header:text-token-foreground"
        >
          {summary}
        </CadencedShimmer>
      }
      disclosure={hasBody ? { expanded, onToggle } : undefined}
      body={
        hasBody ? (
          <DisclosureBody expanded={expanded} indent={indentContent}>
            {children}
          </DisclosureBody>
        ) : undefined
      }
    />
  )
}
