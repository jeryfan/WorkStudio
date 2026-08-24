import { useState } from 'react'
import type { InputOutputToolData, ToolInvocation } from '../../model/toolInvocation'
import { toolRunning } from '../../model/toolDisplay'
import { CodeBlockPart } from '../CodeBlockPart'
import { ActivityHeaderRow, DisclosureBody } from '../activity'
import { CadencedShimmer } from '../CadencedShimmer'
import { RawOutputIcon } from '../../../components/icons'
import { McpContentBlockPart } from './McpContentBlockPart'
import { RawOutputDialog } from './RawOutputDialog'
import { ToolActivityIcon } from './ToolActivityIcon'
import { cx } from '../../../utils/cx'

/**
 * 通用工具(MCP / dynamic)的活动行 —— Codex 的 `ew`
 *(`subagent-activity-chip-group` 的 mcp-tool-call 分支)。
 *
 * ## 展开态是单状态,用户控制、默认收起
 *
 * 不是 `ToolActivityDisclosure`(Codex `Y`)的运行档默认展开 —— 这个构建里
 * 会话工具行没有用 Y 的:exec 行(`MS`)与 MCP 行(`ew`)都是
 * `useState` 收起默认。`Y` 只在 WebMCP 工具定义那一处出现(WS 没有)。
 *
 * ## 展开条件(`Ne`)
 *
 * `e.completed || e.result != null` —— 还在跑且什么都没回来时行不可点
 * (没有 chevron);完成后总有内容(空了也是一句 "Tool returned no content")。
 *
 * ## 展开体只有结果,没有入参
 *
 * 入参连同 callId、耗时收进「原始输出」对话框。结果按内容分流:
 * 散文块(`McpContentBlockPart`)/ 整体 JSON(代码块)/ 错误(危险色块)。
 */
export function InputOutputToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: InputOutputToolData
}): React.JSX.Element {
  const [rawOpen, setRawOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const running = toolRunning(invocation)
  const hasResult = data.blocks.length > 0 || data.structuredJson != null || data.error != null
  const expandable = !running || hasResult

  return (
    <>
      <ActivityHeaderRow
        className="group"
        icon={<ToolActivityIcon invocation={invocation} />}
        summary={
          // Codex 的 MCP 行摘要是 `{tool}`(句首大写名)—— leading 类与流光照 `Ie`;
          // 不拼耗时(它在「原始输出」对话框里,不在行上)
          <CadencedShimmer
            active={running}
            className="min-w-0 shrink truncate text-size-chat text-token-conversation-summary-leading group-hover/activity-header:text-token-foreground"
          >
            {invocation.invocationMessage}
          </CadencedShimmer>
        }
        disclosure={expandable ? { expanded, onToggle: () => setExpanded((v) => !v) } : undefined}
        body={
          expandable ? (
            <DisclosureBody expanded={expanded} variant="grouped" indent={false}>
              {data.error != null ? (
                /*
                 * 错误走 Codex 的 danger callout(`Ti level="danger" fullWidth`):
                 * 整块红底 + `max-h-48` 滚动窗。错误文案经常是一整段 stack trace,
                 * 不封高度会把整个会话流顶下去。
                 */
                <div className="w-full rounded-lg border border-transparent bg-token-charts-red/10 p-2 text-token-charts-red">
                  <div className="max-h-48 overflow-auto text-size-chat whitespace-pre-wrap">
                    {data.error}
                  </div>
                </div>
              ) : data.blocks.length > 0 ? (
                <div className="[&_*]:text-token-non-assistant-body-descendant flex flex-col gap-0.5">
                  {data.blocks.map((block, i) => (
                    <McpContentBlockPart key={i} block={block} />
                  ))}
                </div>
              ) : data.structuredJson != null ? null : (
                <p className="text-token-description-foreground/80">Tool returned no content</p>
              )}

              {data.structuredJson == null ? null : (
                <CodeBlockPart
                  code={data.structuredJson}
                  lang="json"
                  codeContainerClassName="max-h-48 overflow-auto"
                />
              )}

              {/*
               * 「原始输出」触发器。Codex 的类名逐字:`color="ghost"` + `size="icon"`
               * (`electron:p-1 electron:[&>svg]:icon-sm flex items-center justify-center
               * p-0.5` + `rounded-full electron:rounded-md`),外面套一层
               * `div.inline-flex.w-fit` 让它不撑满整行。
               */}
              <div className="inline-flex w-fit">
                <button
                  type="button"
                  aria-label="Show raw tool call output"
                  onClick={() => setRawOpen(true)}
                  className={cx(
                    'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none',
                    'focus:outline-none disabled:cursor-not-allowed disabled:opacity-40',
                    'focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:ring-offset-0',
                    'text-token-text-tertiary enabled:hover:bg-token-list-hover-background border-transparent',
                    'flex items-center justify-center p-0.5 electron:p-1 electron:[&>svg]:icon-sm',
                    'rounded-full electron:rounded-md',
                    'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100'
                  )}
                >
                  <RawOutputIcon aria-hidden className="icon-xxs" />
                </button>
              </div>
            </DisclosureBody>
          ) : undefined
        }
      />

      {rawOpen && (
        <RawOutputDialog
          title={`Raw ${invocation.toolId} tool call output`}
          json={data.rawJson}
          onClose={() => setRawOpen(false)}
        />
      )}
    </>
  )
}
