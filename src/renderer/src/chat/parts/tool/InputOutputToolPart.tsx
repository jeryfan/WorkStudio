import type { InputOutputToolData, ToolInvocation } from '../../model/toolInvocation'
import { Collapsible } from '../Collapsible'
import { CodeBlockPart } from '../CodeBlockPart'
import { ToolTitle } from './ToolTitle'
import { formatDuration } from '../../model/toolDisplay'

/**
 * 通用工具的入参与出参 —— 对应上游的 chatToolInputOutputContentPart.ts。
 *
 * MCP 与 dynamic 工具的参数形状由各服务器自定，我们无从做语义化展示，
 * 所以老老实实展示 JSON——但用代码块而不是纯文本：缩进后的 JSON 至少能扫，
 * 挤成一行的没法读。
 */
export function InputOutputToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: InputOutputToolData
}): React.JSX.Element {
  const duration =
    invocation.state.type === 'completed' ? formatDuration(invocation.state.durationMs) : null

  return (
    <div className="chat-tool-invocation-part tool-input-output-part">
      <Collapsible title={<ToolTitle invocation={invocation} suffix={duration} />}>
        <div className="chat-tool-io">
          {data.input && (
            <div className="chat-tool-io-section">
              <div className="chat-tool-io-label">Input</div>
              <CodeBlockPart code={data.input} lang="json" />
            </div>
          )}
          {data.output && (
            <div className="chat-tool-io-section">
              <div className="chat-tool-io-label">Output</div>
              <CodeBlockPart code={data.output} lang={data.outputLang} />
            </div>
          )}
        </div>
      </Collapsible>
    </div>
  )
}
