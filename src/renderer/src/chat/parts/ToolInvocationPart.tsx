import type { ChatToolInvocationContent } from '../model/content'
import type { ToolInvocation } from '../model/toolInvocation'
import { TerminalToolPart } from './tool/TerminalToolPart'
import { InputOutputToolPart } from './tool/InputOutputToolPart'
import { FileEditToolPart } from './tool/FileEditToolPart'
import { SearchToolPart } from './tool/SearchToolPart'
import { ToolConfirmation } from './ToolConfirmation'
import { DiffView } from './tool/DiffView'
import { TerminalOutput } from './tool/TerminalOutput'
import { parseDiff } from '../model/diff'
import { useChatActions } from '../ChatActionsContext'
import { ConversationItem, DiffCounts } from './activity'
import { countDiffLines } from '../model/diff'

/**
 * 工具调用 → 组件。
 *
 * 按 `data.kind` 分发,不是按"哪种协议条目"。这正是归一化的收益:
 * 一个 MCP 工具和一个 dynamic 工具的呈现需求是一样的(入参出参折叠),
 * 它们来自哪种条目类型与渲染无关。
 *
 * 这与 Codex 的做法一致 —— 它也是一个对 `item.type` 的扁平 switch
 * (`exec` / `patch` / `web-search` / `mcp-tool-call` / `dynamic-tool-call` …),
 * 每个分支落到同一套活动行原语上。
 *
 * 等待确认是个例外,它先于 kind 分发:这时候要展示的不是"工具干了什么",
 * 而是"工具**打算**干什么,批不批"。
 *
 * 之前每个分支外面还套一层 `div.chat-tool-invocation-part`;Codex 没有那一层
 * —— 条目壳由 `ConversationItem`(ActivityRow 内部)提供,再套一个空 div
 * 会多出一层无用的布局盒。
 */
export function ToolInvocationPart({
  content
}: {
  content: ChatToolInvocationContent
}): React.JSX.Element {
  const { invocation } = content
  const { respondToApproval } = useChatActions()

  if (invocation.state.type === 'waitingForConfirmation') {
    return (
      <ToolConfirmation
        invocation={invocation}
        requestKey={invocation.state.requestKey}
        reason={invocation.state.reason}
        onDecide={respondToApproval}
      >
        <ConfirmationPreview invocation={invocation} />
      </ToolConfirmation>
    )
  }

  switch (invocation.data.kind) {
    case 'terminal':
      return <TerminalToolPart invocation={invocation} data={invocation.data} />
    case 'inputOutput':
      return <InputOutputToolPart invocation={invocation} data={invocation.data} />
    case 'fileEdit':
      return <FileEditToolPart invocation={invocation} data={invocation.data} />
    case 'search':
      return <SearchToolPart invocation={invocation} data={invocation.data} />
    default: {
      const never: never = invocation.data
      throw new Error(`未处理的工具数据:${JSON.stringify(never)}`)
    }
  }
}

/**
 * 审批时给用户看的东西。
 *
 * 命令直接摊开(不折叠)——要人判断该不该跑,却把命令收起来是自相矛盾的。
 * 补丁同理,展开全部改动。
 *
 * 文件改动的审批请求本身不带补丁(补丁在条目里),条目还没到时 `changes`
 * 是空的,那就只显示标题和按钮。
 */
function ConfirmationPreview({
  invocation
}: {
  invocation: ToolInvocation
}): React.JSX.Element | null {
  const data = invocation.data

  if (data.kind === 'terminal') {
    return <TerminalOutput command={data.commandForDisplay} output={null} />
  }

  if (data.kind === 'fileEdit') {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {data.changes.map((change) => {
          const parsed = parseDiff(change.diff)
          const counts = countDiffLines(change.diff)
          return (
            <ConversationItem key={change.path}>
              <div className="flex min-w-0 items-center gap-1.5 text-size-chat text-token-conversation-body">
                <span className="min-w-0 truncate">{change.path}</span>
                <DiffCounts
                  className="text-size-chat-sm"
                  linesAdded={counts.added}
                  linesRemoved={counts.removed}
                />
              </div>
              {parsed ? (
                <DiffView
                  original={parsed.original}
                  modified={parsed.modified}
                  path={change.path}
                />
              ) : (
                <pre className="overflow-x-auto whitespace-pre font-vscode-editor text-size-chat-sm">
                  {change.diff}
                </pre>
              )}
            </ConversationItem>
          )
        })}
      </div>
    )
  }

  return null
}
