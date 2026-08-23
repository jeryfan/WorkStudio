import type { InputOutputToolData, ToolInvocation } from '../../model/toolInvocation'
import { toolStatus, toolSummary } from '../../model/toolDisplay'
import { CodeBlockPart } from '../CodeBlockPart'
import { ToolActivityDisclosure } from '../activity'
import { ToolActivityIcon } from './ToolActivityIcon'

/**
 * 通用工具(MCP / dynamic)的入参与出参。
 *
 * 结构照 Codex 的 WebMCP 活动行(`subagent-activity-chip-group` 里那段
 * `<ToolActivityDisclosure icon status="completed" summary>` 的 children):
 *
 * ```
 * div.flex.min-w-0.flex-col.gap-2
 * ├ CodeSnippet title="Tool"   codeContainerClassName="max-h-48 overflow-auto" language="json"
 * └ CodeSnippet title="Result" codeContainerClassName="max-h-48 overflow-auto" language="json"
 * ```
 *
 * 两处与之前的 VS Code 版不同:
 * - 标签("Input" / "Output")不是外面另起的 `div.chat-tool-io-label`,
 *   而是**代码块自己的标题栏**(`title` 属性)——Codex 的 CodeSnippet 本来就带
 *   标题栏,再套一层标签是重复的。
 * - 高度上限 `max-h-48`(192px)由代码容器承担,不是让整块无限长。
 */
export function InputOutputToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: InputOutputToolData
}): React.JSX.Element {
  const hasBody = data.input.length > 0 || (data.output?.length ?? 0) > 0

  return (
    <ToolActivityDisclosure
      icon={<ToolActivityIcon invocation={invocation} />}
      status={toolStatus(invocation)}
      summary={toolSummary(invocation)}
    >
      {hasBody ? (
        <div className="flex min-w-0 flex-col gap-2">
          {data.input.length > 0 && (
            <CodeBlockPart
              code={data.input}
              lang="json"
              title="Tool"
              codeContainerClassName="max-h-48 overflow-auto"
            />
          )}
          {data.output != null && data.output.length > 0 && (
            <CodeBlockPart
              code={data.output}
              lang={data.outputLang}
              title="Result"
              codeContainerClassName="max-h-48 overflow-auto"
            />
          )}
        </div>
      ) : undefined}
    </ToolActivityDisclosure>
  )
}
