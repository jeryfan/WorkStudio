import type { ChatToolInvocationContent } from '../model/content'
import type { ToolInvocation } from '../model/toolInvocation'
import { TerminalToolPart } from './tool/TerminalToolPart'
import { InputOutputToolPart } from './tool/InputOutputToolPart'
import { FileEditToolPart } from './tool/FileEditToolPart'
import { SearchToolPart } from './tool/SearchToolPart'
import { ToolConfirmation } from './ToolConfirmation'
import { DiffView } from './tool/DiffView'
import { parseDiff } from '../model/diff'
import { useChatActions } from '../ChatActionsContext'

/**
 * 工具调用 → 组件 —— 对应上游的 chatToolInvocationPart.ts。
 *
 * 按 `toolSpecificData.kind` 分发，不是按"哪种协议条目"。这正是归一化的收益：
 * 一个 MCP 工具和一个 dynamic 工具的呈现需求是一样的（入参出参折叠），
 * 它们来自哪种条目类型与渲染无关。
 *
 * 等待确认是个例外，它先于 kind 分发：这时候要展示的不是"工具干了什么"，
 * 而是"工具**打算**干什么，批不批"。上游同样是在 chatToolInvocationPart 里
 * 先看状态、再决定用哪个 subPart。
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
      <div className="chat-tool-invocation-part">
        <ToolConfirmation
          invocation={invocation}
          requestKey={invocation.state.requestKey}
          reason={invocation.state.reason}
          onDecide={respondToApproval}
        >
          <ConfirmationPreview invocation={invocation} />
        </ToolConfirmation>
      </div>
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
      throw new Error(`未处理的工具数据：${JSON.stringify(never)}`)
    }
  }
}

/**
 * 审批时给用户看的东西。
 *
 * 命令直接摊开（不折叠）——要人判断该不该跑，却把命令收起来是自相矛盾的。
 * 补丁同理，展开全部改动。
 *
 * 文件改动的审批请求本身不带补丁（补丁在条目里），条目还没到时 `changes`
 * 是空的，那就只显示标题和按钮。
 */
function ConfirmationPreview({
  invocation
}: {
  invocation: ToolInvocation
}): React.JSX.Element | null {
  const data = invocation.data

  if (data.kind === 'terminal') {
    return (
      <div className="chat-confirmation-message-terminal">
        <div className="chat-terminal-command-line">
          <span className="chat-terminal-prompt">$</span>
          <code>{data.commandForDisplay}</code>
        </div>
        {data.cwd && <div className="chat-terminal-cwd">{data.cwd}</div>}
      </div>
    )
  }

  if (data.kind === 'fileEdit') {
    return (
      <div className="chat-file-edit-list">
        {data.changes.map((change) => {
          const parsed = parseDiff(change.diff)
          return (
            <div key={change.path}>
              <div className="chat-file-edit-header">
                <span className={`chat-file-edit-op chat-file-edit-op-${change.operation}`}>
                  {change.operation}
                </span>
                <span>{change.path}</span>
              </div>
              {parsed ? (
                <DiffView
                  original={parsed.original}
                  modified={parsed.modified}
                  path={change.path}
                />
              ) : (
                <pre className="chat-terminal-output">{change.diff}</pre>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return null
}
