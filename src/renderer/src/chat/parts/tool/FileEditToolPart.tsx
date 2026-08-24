import { useState } from 'react'
import type { FileEditToolData, ToolInvocation } from '../../model/toolInvocation'
import { countDiffLines, parseDiff } from '../../model/diff'
import { toolRunning, toolSummary } from '../../model/toolDisplay'
import { ActivityBody, ActivityHeaderRow, DiffCounts, DisclosureBody } from '../activity'
import { CodeBlockPart } from '../CodeBlockPart'
import { CadencedShimmer } from '../CadencedShimmer'
import { InlineAnchor } from '../InlineAnchor'
import { DiffView } from './DiffView'
import { ToolActivityIcon } from './ToolActivityIcon'

/**
 * 文件改动的活动行 —— 照 Codex 的 `patch` 条目。
 *
 * Codex 的 patch 行长这样(`subagent-activity-chip-group` 里那个 `ym` 调用):
 *
 * ```
 * <ActivityHeaderRow
 *   className="overflow-clip rounded-lg"
 *   headerClassName="text-token-conversation-body"
 *   icon={<PatchIcon/>}
 *   summary={<FileLink/>}
 *   accessory={
 *     <div className="flex items-center gap-1.5">
 *       <DiffCounts variant="agent-activity" className="text-size-chat-sm" …/>
 *       {type === 'add'    && <span className="block size-1.5 rounded-full bg-token-charts-blue/70"/>}
 *       {type === 'delete' && <span className="block size-1.5 rounded-full bg-token-charts-red/70"/>}
 *     </div>
 *   }
 *   disclosure={{accessibleLabel: `Toggle diff for ${fileName}`, expanded, onToggle}}
 *   body={<motion.div …>{diff}</motion.div>}
 * />
 * ```
 *
 * 三处从源码抄来的判断:
 *
 * 1. **增删行数走 `accessory` 槽,不是拼进摘要**。accessory 在 chevron 左边,
 *    是给这种结构化附加信息用的;耗时那类才拼进句子(见 `toolSummary`)。
 * 2. **`variant="agent-activity"`**:平时继承行的颜色,只在整行 hover 时才变成
 *    git 增删色 —— 而且鼠标停在文件链接上不算(见 DiffCounts 里那条 `:not(:has(…))`)。
 * 3. **新增文件补一个蓝点、删除补一个红点**(`size-1.5 rounded-full`,
 *    `bg-token-charts-{blue,red}/70`)。修改文件没有点 —— 点只标"这文件是新的/没了"。
 *
 * **WS 与 Codex 的一处结构差异**:Codex 一个 `patch` 条目对应一个文件,多文件
 * 走 `turn-diff` 聚合;WS 的协议是一条 `fileChange` 带 N 个 change。所以这里
 * 单文件时直接是那一行,多文件时外面套一行汇总、里面用
 * `ActivityBody variant="grouped"` 排开每个文件 —— 用的是 Codex 给多子条目
 * 准备的那一档(`gap-[var(--conversation-grouped-item-gap,4px)] pt-1`)。
 */
export function FileEditToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: FileEditToolData
}): React.JSX.Element {
  const totals = data.changes.reduce(
    (acc, change) => {
      const { added, removed } = countDiffLines(change.diff)
      return { added: acc.added + added, removed: acc.removed + removed }
    },
    { added: 0, removed: 0 }
  )

  // 单文件:就是 Codex 的那一行,文件名当摘要
  if (data.changes.length === 1) {
    return (
      <FileChangeRow change={data.changes[0]} icon={<ToolActivityIcon invocation={invocation} />} />
    )
  }

  return <MultiFileChangeRows invocation={invocation} data={data} totals={totals} />
}

/** 多文件:外面套一行汇总(Codex 走 turn-diff 聚合,WS 协议是单条带 N 个
 * change —— 差异见文件头注释)。单状态、默认收起,与 patch 行一致。 */
function MultiFileChangeRows({
  invocation,
  data,
  totals
}: {
  invocation: ToolInvocation
  data: FileEditToolData
  totals: { added: number; removed: number }
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <ActivityHeaderRow
      icon={<ToolActivityIcon invocation={invocation} />}
      summary={
        <CadencedShimmer
          active={toolRunning(invocation)}
          className="min-w-0 truncate text-size-chat text-token-conversation-summary-leading group-hover/activity-header:text-token-foreground"
        >
          {toolSummary(invocation)}
        </CadencedShimmer>
      }
      accessory={
        totals.added > 0 || totals.removed > 0 ? (
          <div className="flex items-center gap-1.5">
            <DiffCounts
              className="text-size-chat-sm"
              linesAdded={totals.added}
              linesRemoved={totals.removed}
              variant="agent-activity"
            />
          </div>
        ) : undefined
      }
      disclosure={
        data.changes.length > 0 ? { expanded, onToggle: () => setExpanded((v) => !v) } : undefined
      }
      body={
        data.changes.length > 0 ? (
          <DisclosureBody expanded={expanded} variant="grouped">
            <ActivityBody variant="grouped">
              {data.changes.map((change) => (
                <FileChangeRow key={change.path} change={change} />
              ))}
            </ActivityBody>
          </DisclosureBody>
        ) : undefined
      }
    />
  )
}

/**
 * 单个文件的活动行:文件链接 + 增删行数 + 状态点,展开是 diff。
 *
 * 不能用 `ToolActivityDisclosure` —— 那个把摘要包进 `CadencedShimmer`
 * (文件名不需要流光),而且它的展开态跟 `status` 绑定(文件行没有 running 概念)。
 * 所以直接用下一层的 `ActivityHeaderRow` + `DisclosureBody`,与 Codex 的
 * patch 行同层同构。
 */
function FileChangeRow({
  change,
  icon
}: {
  change: FileEditToolData['changes'][number]
  icon?: React.ReactNode
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const parsed = parseDiff(change.diff)
  const counts = countDiffLines(change.diff)
  const fileName = change.path.split('/').pop() ?? change.path

  return (
    <ActivityHeaderRow
      className="overflow-clip rounded-lg"
      headerClassName="text-token-conversation-body"
      icon={icon}
      summary={
        <>
          <InlineAnchor path={change.path} />
          {change.movedTo && (
            <>
              <span className="mx-1 text-token-text-tertiary">→</span>
              <InlineAnchor path={change.movedTo} />
            </>
          )}
        </>
      }
      accessory={
        <div className="flex items-center gap-1.5">
          {(counts.added > 0 || counts.removed > 0) && change.operation !== 'delete' && (
            <DiffCounts
              className="text-size-chat-sm"
              linesAdded={counts.added}
              linesRemoved={counts.removed}
              variant="agent-activity"
            />
          )}
          {change.operation === 'add' && (
            <span className="block size-1.5 rounded-full bg-token-charts-blue/70" />
          )}
          {change.operation === 'delete' && (
            <span className="block size-1.5 rounded-full bg-token-charts-red/70" />
          )}
        </div>
      }
      disclosure={{
        expanded,
        onToggle: () => setExpanded((v) => !v),
        accessibleLabel: `Toggle diff for ${fileName}`
      }}
      body={
        <DisclosureBody expanded={expanded}>
          {parsed ? (
            <DiffView original={parsed.original} modified={parsed.modified} path={change.path} />
          ) : (
            /*
             * 补丁方言不认识时的退路:按 diff 语法高亮原样显示。
             * 永远是对的,只是少了左右对照与语言高亮。
             */
            <CodeBlockPart code={change.diff} lang="diff" />
          )}
        </DisclosureBody>
      }
    />
  )
}
