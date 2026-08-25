import { MarkdownPart } from './parts/MarkdownPart'
import { ChatContentPart } from './parts/ChatContentPart'
import { ThinkingPlaceholder } from './parts/ThinkingPlaceholder'
import { ActivityGroup } from './parts/activity/ActivityGroup'
import { ChatResponseFooter } from './parts/ChatResponseFooter'
import {
  shouldShowProcessToggle,
  splitTurnContent,
  turnRunningState,
  turnSummaryLabel
} from './model/turnSections'
import {
  countUnitItems,
  demoteSingleItemGroup,
  groupHeaderState,
  groupIntoRenderUnits,
  unitTargetIds
} from './model/renderUnits'
import { contentKey } from './model/contentKey'
import { responsePlainText } from './model/responseText'
import type { ThreadRow } from './model/rows'
import {
  ThreadAssistantCommentary,
  ThreadAssistantMessage,
  ThreadItem,
  ThreadItems,
  ThreadProcessSection,
  ThreadTurnGap
} from './ThreadTurn'

/**
 * 一个 turn 的回复侧(过程段 / 状态行 / 最终回复)—— ChatView 与预览页
 * 共用这一个实现。结构注释见 ChatView 与 model/renderUnits.ts。
 */
export function ThreadTurnBody({
  row,
  isLastResponse
}: {
  row: Extract<ThreadRow, { kind: 'response' }>
  isLastResponse: boolean
}): React.JSX.Element {
  const res = row
  const text = responsePlainText(res)
  const split = splitTurnContent(res.content)
  const process = split.process
  const final = split.final

  // ── 渲染单元管线(Codex `Tr`/`Jr`)──
  const units = groupIntoRenderUnits(process)
  const isTurnInProgress = !res.isComplete
  const finalMessage = final[0]?.kind === 'markdownContent' ? final[0] : undefined

  /*
   * 轮次运行态 —— Codex `ja` 的四态 + 轮次组件里的 `On`/`kn`/`An`/`W`。
   * 探索段(`jr`)也在里面算,所以 `isExploring` 与组表头拿到的是同一个值。
   */
  const running = turnRunningState({
    process,
    units,
    isTurnInProgress,
    assistantContent: finalMessage?.content ?? null,
    assistantPhase: finalMessage?.phase ?? null,
    hasBlockingRequest: process.some(
      (c) => c.kind === 'toolInvocation' && c.invocation.state.type === 'waitingForConfirmation'
    )
  })
  const collapsedCount = countUnitItems(units)

  return (
    <>
      {units.length > 0 && (
        <>
          <ThreadProcessSection
            showToggle={shouldShowProcessToggle({
              final,
              processCount: collapsedCount,
              units,
              cancelled: res.isCanceled,
              isTurnInProgress
            })}
            summary={turnSummaryLabel(res.startedAtMs, res.completedAtMs, collapsedCount)}
          >
            <ThreadItems>
              {units.map((unit, index) => {
                const isLatestVisibleUnit = index === units.length - 1
                const state = groupHeaderState(unit, {
                  isLatestVisibleUnit,
                  isTurnInProgress,
                  isActivitySliceClosed: running.isActivitySliceClosed,
                  isExploring: running.isExploring
                })
                const demoted = demoteSingleItemGroup(unit, state)
                const targetIds = unitTargetIds(demoted)
                return (
                  <ThreadItem key={unit.key} targetIds={targetIds ?? undefined}>
                    {demoted.kind === 'group' ? (
                      <ActivityGroup
                        unit={demoted}
                        isLatestVisibleUnit={isLatestVisibleUnit}
                        isTurnInProgress={isTurnInProgress}
                        isActivitySliceClosed={running.isActivitySliceClosed}
                        isExploring={running.isExploring}
                        /*
                         * Codex `thinkingFallbackMessage: n === 'active' || kn ? tn : void 0`
                         * —— 只在状态行被组表头吸收(`kn`)时下传。否则组表头的
                         * thinking 态会和底部的状态行同时显示同一句推理标题。
                         * Codex 把它下传给**每个**组(不只最新那个),因为组只在
                         * thinking 态用它,而 thinking 态本身要求是最新单元。
                         */
                        thinkingFallbackMessage={
                          running.absorbedByLastUnit ? res.thinkingFallback : null
                        }
                      />
                    ) : demoted.item.kind === 'markdownContent' ? (
                      // 中间助手消息:与最终回复同一套结构(Codex 实测)
                      <ThreadAssistantCommentary>
                        <MarkdownPart content={demoted.item} textStyle="assistant-message" />
                      </ThreadAssistantCommentary>
                    ) : (
                      <ChatContentPart content={demoted.item} />
                    )}
                  </ThreadItem>
                )
              })}
            </ThreadItems>
          </ThreadProcessSection>
          <ThreadTurnGap />
        </>
      )}
      {/*
       * 轮次状态行 —— Codex `An` 决定挂不挂载、`W` 决定可不可见。
       * 两者分开是有意的:`An && !W` 时行仍然占位(`invisible`),
       * 不让底部在"在想"与"不在想"之间抽动。
       * 过程段折叠与否它都在;最新单元是组时(`kn`)收进组表头,这里不渲染。
       */}
      {running.showThinkingPlaceholder && (
        <>
          <ThinkingPlaceholder message={res.thinkingFallback} visible={running.isThinkingVisible} />
          <ThreadTurnGap />
        </>
      )}
      {/* Codex:没有最终助手条目就不渲染这一段(`vn && B != null`) */}
      {final.length > 0 && (
        <ThreadAssistantMessage
          unitKey={res.id}
          targetId={res.id}
          sentTime={res.completedAtMs != null ? formatClockTime(res.completedAtMs) : undefined}
          actions={
            // 流式期间不给操作条:此时复制会拿到半截内容
            res.isComplete && text.length > 0 ? <ChatResponseFooter text={text} /> : undefined
          }
        >
          <div
            data-markdown-text-style="assistant-message"
            className="codex-MarkdownRoot [&>*:last-child]:mb-0 [&>ol:first-child]:mt-0 [&>ul:first-child]:mt-0"
          >
            {final.map((content, index) => (
              <ChatContentPart key={contentKey(content, index)} content={content} />
            ))}
          </div>
        </ThreadAssistantMessage>
      )}
      {isLastResponse && <ThreadTurnGap />}
    </>
  )
}

/** `span[data-assistant-message-sent-time]` 里那个时间 —— Codex 实测形如 `Friday 12:01 AM` */
function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
