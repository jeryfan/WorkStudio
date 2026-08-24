import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cx } from '../../../utils/cx'
import {
  formatUnit,
  groupHeaderState,
  summarizeGroup,
  summaryPartText,
  visibleGroupChildren,
  type GroupHeaderState,
  type RenderUnit
} from '../../model/renderUnits'
import { CadencedShimmer } from '../CadencedShimmer'
import { ActivityHeader, ActivityHeaderContent, ActivityRow } from './index'
import { DISCLOSURE_TRANSITION } from './transition'
import { ThreadTurnGap } from '../../ThreadTurn'
import { ChatContentPart } from '../ChatContentPart'
import { GroupActiveLabel } from './GroupActiveLabel'
import { ToolActivityIcon } from '../tool/ToolActivityIcon'

/**
 * 一组工具的活动行 —— Codex 的 `UO` + `Gg` + `GO` + `Jg` + `XO`
 *(`subagent-activity-chip-group` / `content-reference-markers`)。
 *
 * 连续的 groupable 条目(exec / patch / web-search / mcp / dynamic)在 Codex 里
 * 收成**一行组**:表头是聚合摘要("Used Playwright integration, searched the web"),
 * 展开后是一个 `max-h-56` 的滚动窗,成员各行其是。
 *
 * ## 表头三态(`Yr`)
 *
 * | 态 | 时机 | 内容 |
 * |---|---|---|
 * | `summary` | 默认(完成/非最新) | 聚合摘要,**无流光** |
 * | `active` | 最新单元 + 轮次在跑 + 组里有在跑的 | 那条的实况摘要 + 流光 |
 * | `thinking` | 最新单元 + 在跑 + 组里没在跑的 | "Thinking" 或推理标题 + 流光 |
 *
 * ## 展开体是四态机,与 `ToolActivityDisclosure` 不同
 *
 * `collapsed → opening →(rAF)→ expanded → closing →(动画完)→ collapsed`,
 * 而且**折叠时 body 不挂载**(不像 DisclosureBody 常驻高度 0)。动画用
 * `height: auto ↔ 0`(不是测出来的像素):组内容会随子项流式变化,
 * 测高一测就过期。
 *
 * 摘要文案的切换有 1000ms 节流(`Yg`):流式期间组表头文案频繁变,
 * 少于 1s 内的变化攒着,防止表头闪烁。
 */

/** 摘要切换的最小间隔(Codex `$g = 1e3`) */
const SUMMARY_SWAP_INTERVAL_MS = 1000

export function ActivityGroup({
  unit,
  isLatestVisibleUnit,
  isTurnInProgress,
  isActivitySliceClosed,
  isExploring,
  thinkingFallbackMessage
}: {
  unit: Extract<RenderUnit, { kind: 'group' }>
  isLatestVisibleUnit: boolean
  isTurnInProgress: boolean
  isActivitySliceClosed: boolean
  isExploring: boolean
  thinkingFallbackMessage: string | null
}): React.JSX.Element {
  const state = groupHeaderState(unit, {
    isLatestVisibleUnit,
    isTurnInProgress,
    isActivitySliceClosed,
    isExploring
  })
  const children = visibleGroupChildren(unit)
  const canExpand = children.length > 0

  // ── Gg 的四态机(折叠时 body 不挂载)──
  const [disclosure, setDisclosure] = useState<'collapsed' | 'opening' | 'expanded' | 'closing'>(
    'collapsed'
  )
  const open = disclosure === 'opening' || disclosure === 'expanded'
  const settledOpen = disclosure === 'expanded'

  const onToggle = (): void => {
    if (open) {
      setDisclosure('closing')
      return
    }
    if (disclosure === 'closing') {
      setDisclosure('expanded')
      return
    }
    setDisclosure('opening')
    requestAnimationFrame(() => {
      setDisclosure((s) => (s === 'opening' ? 'expanded' : s))
    })
  }

  return (
    <ActivityRow
      header={
        <ActivityHeader disclosure={canExpand ? { expanded: open, onToggle } : undefined}>
          <GroupHeaderSummary
            state={state}
            unit={unit}
            thinkingFallbackMessage={thinkingFallbackMessage}
            canExpand={canExpand}
          />
        </ActivityHeader>
      }
      body={
        canExpand && disclosure !== 'collapsed' ? (
          <motion.div
            initial={false}
            animate={settledOpen ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
            transition={DISCLOSURE_TRANSITION}
            style={{ overflow: 'hidden', pointerEvents: settledOpen ? 'auto' : 'none' }}
            onAnimationComplete={() => {
              setDisclosure((s) => (s === 'closing' ? 'collapsed' : s))
            }}
          >
            <div
              className="vertical-scroll-fade-mask flex max-h-56 flex-col overflow-x-hidden overflow-y-auto [--edge-fade-distance:1.5rem]"
              style={
                {
                  '--conversation-patch-file-gap': 'var(--conversation-grouped-item-gap, 4px)'
                } as React.CSSProperties
              }
            >
              {children.map((content) => (
                <div key={content.invocation.id}>
                  <ThreadTurnGap variant="grouped" />
                  <ChatContentPart content={content} />
                </div>
              ))}
            </div>
          </motion.div>
        ) : undefined
      }
    />
  )
}

// ── 表头(Codex `GO` + `Jg` + `bg`)──────────────────────────────

function GroupHeaderSummary({
  state,
  unit,
  thinkingFallbackMessage,
  canExpand
}: {
  state: GroupHeaderState
  unit: Extract<RenderUnit, { kind: 'group' }>
  thinkingFallbackMessage: string | null
  canExpand: boolean
}): React.JSX.Element {
  // 内容与图标按表头三态分流(Codex `GO`)
  let content: ReactNode
  let icon: ReactNode = null
  if (state.kind === 'thinking') {
    content = <CadencedShimmer>{thinkingFallbackMessage ?? 'Thinking'}</CadencedShimmer>
  } else if (state.kind === 'active') {
    icon = <ToolActivityIcon invocation={state.item.invocation} />
    content = (
      <CadencedShimmer>
        <GroupActiveLabel item={state.item} />
      </CadencedShimmer>
    )
  } else {
    const summary = summarizeGroup(unit.items)
    icon =
      summary.iconItem != null ? (
        <ToolActivityIcon invocation={summary.iconItem.invocation} />
      ) : null
    content = <CompletedGroupSummary unit={unit} />
  }
  // Codex `GO` 的内容包装层(三态共用)
  content = (
    <span
      className={cx(
        'block min-w-0 max-w-full flex-1 truncate text-token-conversation-body [&_*:not(button)]:!text-token-conversation-body',
        canExpand &&
          'group-hover/activity-header:!text-token-foreground group-hover/activity-header:[&_*:not(button)]:!text-token-foreground'
      )}
    >
      {content}
    </span>
  )

  return (
    <span
      className={cx(
        'text-token-conversation-body flex min-w-0 max-w-full items-center truncate',
        canExpand && 'shrink group-hover/activity-header:text-token-foreground'
      )}
    >
      <DeferredSummary
        summaryKey={stateKey(state)}
        transition={state.kind === 'summary' ? 'immediate' : 'deferred'}
      >
        {icon == null ? (
          content
        ) : (
          // Codex `bg`:图标 + 文字共用一层 inline-flex
          <ActivityHeaderContent className="max-w-full overflow-hidden">
            <span className="contents text-token-conversation-body">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{content}</span>
          </ActivityHeaderContent>
        )}
      </DeferredSummary>
    </span>
  )
}

function stateKey(state: GroupHeaderState): string {
  if (state.kind === 'active') return `active:${state.item.invocation.id}`
  return state.kind
}

/**
 * Codex `Yg` —— 摘要切换的 1s 节流:距上次切换不足 1s 时攒到点再换,
 * 表头不会在流式期间一闪一闪。`immediate` 档(summary 态)直接换。
 */
function DeferredSummary({
  summaryKey,
  transition,
  children
}: {
  summaryKey: string
  transition: 'immediate' | 'deferred'
  children: ReactNode
}): React.JSX.Element {
  const [shown, setShown] = useState<{ key: string; node: ReactNode }>({
    key: summaryKey,
    node: children
  })
  const lastSwapAtMs = useRef<number>(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (summaryKey === shown.key) return
    const apply = (): void => {
      lastSwapAtMs.current = Date.now()
      setShown({ key: summaryKey, node: children })
    }
    if (transition === 'immediate') {
      if (timer.current != null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
      apply()
      return
    }
    const remaining = SUMMARY_SWAP_INTERVAL_MS - (Date.now() - lastSwapAtMs.current)
    if (remaining <= 0) {
      apply()
      return
    }
    timer.current = window.setTimeout(() => {
      timer.current = null
      apply()
    }, remaining)
    return () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [summaryKey, transition, children, shown.key])

  return (
    <span className="flex min-h-4 max-w-full min-w-0 items-center truncate">
      {transition === 'immediate' || shown.key === summaryKey ? children : shown.node}
    </span>
  )
}

/** Codex `XO` —— 完成态的聚合摘要(段间 `, ` 连接;空摘要显示 "Worked") */
function CompletedGroupSummary({
  unit
}: {
  unit: Extract<RenderUnit, { kind: 'group' }>
}): React.JSX.Element {
  const { parts } = summarizeGroup(unit.items)
  return (
    <span className="block max-w-full min-w-0 truncate">
      {parts.length === 0
        ? 'Worked'
        : formatUnit(parts.map((part, i) => summaryPartText(part, i === 0)))}
    </span>
  )
}
