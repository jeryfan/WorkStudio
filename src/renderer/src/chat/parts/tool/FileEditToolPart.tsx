import type { FileEditToolData, ToolInvocation } from '../../model/toolInvocation'
import { countDiffLines, parseDiff } from '../../model/diff'
import { Collapsible } from '../Collapsible'
import { CodeBlockPart } from '../CodeBlockPart'
import { InlineAnchor } from '../InlineAnchor'
import { ToolTitle } from './ToolTitle'
import { DiffView } from './DiffView'

/**
 * 文件改动 —— 对应上游的 chatEditPillElement + chatChangesSummaryPart。
 *
 * 每个文件一行：路径（可点开）+ 增删行数。展开后是 diff。
 *
 * 增删行数**总是**显示，即使补丁方言没认出来：数 `+` / `-` 开头的行比还原两侧
 * 宽容得多，标题上的 `+12 −3` 不该因为解析失败就消失。
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

  return (
    <div className="chat-tool-invocation-part chat-file-edit-part">
      <Collapsible
        title={<ToolTitle invocation={invocation} suffix={<DiffCounts {...totals} />} />}
      >
        <div className="chat-file-edit-list">
          {data.changes.map((change) => (
            <FileDiff key={change.path} change={change} />
          ))}
        </div>
      </Collapsible>
    </div>
  )
}

function DiffCounts({ added, removed }: { added: number; removed: number }): React.JSX.Element {
  return (
    <span className="chat-thinking-title-diff">
      {added > 0 && <span className="label-added">+{added}</span>}
      {removed > 0 && <span className="label-removed">−{removed}</span>}
    </span>
  )
}

function FileDiff({ change }: { change: FileEditToolData['changes'][number] }): React.JSX.Element {
  const parsed = parseDiff(change.diff)
  const counts = countDiffLines(change.diff)

  return (
    <div className="chat-file-edit-item">
      <div className="chat-file-edit-header">
        <span className={`chat-file-edit-op chat-file-edit-op-${change.operation}`}>
          {change.operation}
        </span>
        <InlineAnchor path={change.path} />
        {change.movedTo && (
          <>
            <span className="chat-file-edit-arrow">→</span>
            <InlineAnchor path={change.movedTo} />
          </>
        )}
        <DiffCounts {...counts} />
      </div>

      {parsed ? (
        <DiffView original={parsed.original} modified={parsed.modified} path={change.path} />
      ) : (
        /*
         * 补丁方言不认识时的退路：按 diff 语法高亮原样显示。
         * 永远是对的，只是少了左右对照与语言高亮。
         */
        <CodeBlockPart code={change.diff} lang="diff" />
      )}
    </div>
  )
}
