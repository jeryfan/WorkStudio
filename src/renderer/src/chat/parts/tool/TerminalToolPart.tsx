import type { TerminalToolData, ToolInvocation } from '../../model/toolInvocation'
import { Collapsible } from '../Collapsible'
import { ToolTitle } from './ToolTitle'
import { formatDuration } from '../../model/toolDisplay'

/**
 * 终端命令 —— 对应上游的 chatTerminalToolProgressPart.ts。
 *
 * 上游用 xterm 渲染输出（为了 ANSI 颜色与光标控制），同时留了一条 `<pre>` 的
 * 降级路径（`.chat-terminal-output { white-space: pre }`）。这里走降级路径：
 * 对话里的命令输出是**回看**，不是可交互终端，为它引一个终端模拟器不划算。
 *
 * 输出默认收起。一次构建的输出动辄几千行，展开是常态的话回答会被挤没。
 */

/** 收起时输出完全不渲染，展开也只保留尾部若干行 —— 全量输出能有几 MB */
const MAX_LINES = 400

export function TerminalToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: TerminalToolData
}): React.JSX.Element {
  const output = data.output ?? ''
  const lines = output.split('\n')
  const truncated = lines.length > MAX_LINES
  const shown = truncated ? lines.slice(-MAX_LINES).join('\n') : output

  const duration =
    invocation.state.type === 'completed' ? formatDuration(invocation.state.durationMs) : null
  const exit = data.exitCode != null && data.exitCode !== 0 ? `exit ${data.exitCode}` : null

  return (
    <div className="chat-tool-invocation-part chat-terminal-content-part">
      <Collapsible
        className="chat-terminal-thinking-collapsible"
        title={
          <ToolTitle
            invocation={invocation}
            suffix={
              <>
                {exit && <span className="chat-tool-exit-code">{exit}</span>}
                {duration && <span>{duration}</span>}
              </>
            }
          />
        }
      >
        <div className="chat-terminal-output-container expanded">
          <div className="chat-terminal-output-body">
            {/*
             * 命令本身也放进展开区：标题里的文案可能是"Searched for foo"这类
             * 人话概括，看不到实际跑了什么。排查问题时需要原始命令。
             */}
            <div className="chat-terminal-command-line">
              <span className="chat-terminal-prompt">$</span>
              <code>{data.commandForDisplay}</code>
            </div>
            {data.cwd && <div className="chat-terminal-cwd">{data.cwd}</div>}
            {truncated && (
              <div className="chat-terminal-truncated">
                只显示最后 {MAX_LINES} 行，共 {lines.length} 行
              </div>
            )}
            {output ? (
              <pre className="chat-terminal-output">{shown}</pre>
            ) : (
              <div className="chat-terminal-no-output">没有输出</div>
            )}
          </div>
        </div>
      </Collapsible>
    </div>
  )
}
