import { useEffect, useState } from 'react'
import type { TerminalToolData, ToolInvocation } from '../../model/toolInvocation'
import { formatDuration } from '../../model/toolDisplay'
import { CadencedShimmer } from '../CadencedShimmer'
import { ActivityHeaderRow, DisclosureBody } from '../activity'
import { ToolActivityIcon } from './ToolActivityIcon'
import { TerminalOutput } from './TerminalOutput'

/**
 * 终端命令的活动行 —— Codex 的 `AS`(`subagent-activity-chip-group`)。
 *
 * `AS` 按命令类别分成两种形态,不是一种:
 *
 * | parsedCmd.type | 组件 | 展开体 |
 * |---|---|---|
 * | read / search / list_files | `jS`(纯标签行) | **没有**(读文件的"结果"进了模型,没有可展示的输出) |
 * | 其余 | `MS`(通用命令行) | 有(shell 块),**默认收起** |
 *
 * 与上一版的三处出入:
 *
 * 1. **未完成的分类命令不渲染**。Codex 的 exec 分支:
 *    `(read || search || list_files) && !isFinished → return null`。
 *    进行中的 "Reading foo.ts" 不是一行,它的存在感在组表头的 active 态
 *    (`Reading foo.ts` 流光)与组里。被中断的同理(isFinished 为 false)。
 * 2. **通用命令行默认收起,运行中也不自动展开**。Codex 这里不是
 *    `ToolActivityDisclosure` 的「运行档默认展开」(`MS` 自己
 *    `useState('collapsed')`)—— 那是 MCP 行(`ew`→`Y`)的行为,两族不要串。
 * 3. **耗时是活的**:运行中每秒 tick(`Running command for 0:07`),
 *    命令文字只在收起态进摘要(展开后命令在展开体的 shell 块里):
 *    收起 "Ran npm test in 2.3s" / 展开 "Ran command in 2.3s"。
 */

/** 分类行(read/search/list)—— Codex 的 `jS`。仅完成态会走到这里 */
function ClassifiedCommandLabel({ text }: { text: string }): React.JSX.Element {
  // `<verb>Read</verb> {path}` —— 动词一词带 leading 色(Codex `iC`),其余原样
  const space = text.indexOf(' ')
  const verb = space === -1 ? text : text.slice(0, space)
  const rest = space === -1 ? '' : text.slice(space + 1)
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 truncate text-token-conversation-summary-trailing [@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:text-token-foreground [&_*]:text-token-foreground/30 [@media(hover:hover)]:group-[:hover:not(:has([data-agent-activity-file-link]:hover))]/activity-header:[&_*]:text-token-foreground">
      <span className="min-w-0 truncate">
        <span className="text-token-conversation-summary-leading">{verb}</span>
        {rest ? ` ${rest}` : ''}
      </span>
    </span>
  )
}

export function TerminalToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: TerminalToolData
}): React.JSX.Element | null {
  const { state } = invocation
  const running = state.type === 'executing' || state.type === 'streaming'
  const cancelled = state.type === 'cancelled'
  const classified = data.commandKind !== 'unknown'

  // Codex exec 分支:未完成的 read/search/list_files 不渲染成行
  // (WS 的 cancelled 对应 Codex 的 interrupted —— isFinished 为 false,同样不渲染)
  if (classified && (running || cancelled)) return null

  if (classified) {
    return (
      <ActivityHeaderRow
        icon={<ToolActivityIcon invocation={invocation} />}
        summary={
          <ClassifiedCommandLabel
            text={
              cancelled
                ? invocation.invocationMessage
                : (invocation.pastTenseMessage ?? invocation.invocationMessage)
            }
          />
        }
      />
    )
  }

  return (
    <GenericCommandRow
      invocation={invocation}
      data={data}
      running={running}
      cancelled={cancelled}
    />
  )
}

/** 通用命令行 —— Codex 的 `MS` */
function GenericCommandRow({
  invocation,
  data,
  running,
  cancelled
}: {
  invocation: ToolInvocation
  data: TerminalToolData
  running: boolean
  cancelled: boolean
}): React.JSX.Element {
  // Codex `useState('collapsed')` —— 默认收起,运行中也不自动展开
  const [expanded, setExpanded] = useState(false)

  /*
   * 活耗时:Codex 的 `nC`(运行中 = now - startedAt,完成后 = durationMs)+
   * `Gr(…, 1e3)` 每秒 tick。协议不给 startedAt,Codex 同源代码的兜底是
   * 行的挂载时间(`x = useState(() => inProgress ? Date.now() : null)`)。
   */
  const [mountedAt] = useState(() => (running ? Date.now() : null))
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!running || mountedAt == null) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running, mountedAt])
  const elapsedMs =
    running && mountedAt != null
      ? Math.max(nowMs - mountedAt, 0)
      : (stateCompletedDuration(invocation) ?? 0)
  const elapsedLabel = elapsedMs > 0 ? formatDuration(elapsedMs) : null

  const command = data.commandForDisplay.trim()
  // Codex `QS`:命令文字只在收起态进摘要(展开后它在展开体的 shell 块里)
  let summary: string
  if (running) {
    summary = elapsedLabel == null ? 'Running command' : `Running command for ${elapsedLabel}`
  } else if (cancelled) {
    const after = elapsedLabel == null ? '' : ` after ${elapsedLabel}`
    summary =
      expanded || command.length === 0 ? `Stopped command${after}` : `Stopped ${command}${after}`
  } else {
    const inLabel = elapsedLabel == null ? '' : ` in ${elapsedLabel}`
    summary =
      expanded || command.length === 0 ? `Ran command${inLabel}` : `Ran ${command}${inLabel}`
  }

  return (
    <ActivityHeaderRow
      className="relative overflow-clip"
      icon={<ToolActivityIcon invocation={invocation} />}
      disclosure={{ expanded, onToggle: () => setExpanded((v) => !v) }}
      summary={
        <span className="min-w-0 truncate text-token-conversation-summary-trailing group-hover/activity-header:text-token-foreground">
          <CadencedShimmer
            active={running}
            className="font-sans text-token-conversation-summary-leading group-hover/activity-header:text-token-foreground"
          >
            {summary}
          </CadencedShimmer>
        </span>
      }
      body={
        <DisclosureBody expanded={expanded} variant="default">
          {expanded ? (
            <TerminalOutput
              command={command}
              output={data.output}
              isInProgress={running}
              footer={
                <TerminalOutput.Footer
                  isInProgress={running}
                  isSuccess={stateSucceeded(invocation)}
                  exitCode={data.exitCode}
                  wasInterrupted={cancelled}
                />
              }
            />
          ) : undefined}
        </DisclosureBody>
      }
    />
  )
}

function stateCompletedDuration(invocation: ToolInvocation): number | null {
  return invocation.state.type === 'completed' ? invocation.state.durationMs : null
}

function stateSucceeded(invocation: ToolInvocation): boolean {
  return invocation.state.type === 'completed' && invocation.state.success
}
