import { useState } from 'react'
import type { InputOutputToolData, ToolInvocation } from '../../model/toolInvocation'
import { toolStatus, toolSummary } from '../../model/toolDisplay'
import { CodeBlockPart } from '../CodeBlockPart'
import { ToolActivityDisclosure } from '../activity'
import { RawOutputIcon } from '../../../components/icons'
import { McpContentBlockPart } from './McpContentBlockPart'
import { RawOutputDialog } from './RawOutputDialog'
import { ToolActivityIcon } from './ToolActivityIcon'
import { cx } from '../../../utils/cx'

/**
 * 通用工具(MCP / dynamic)的活动行。
 *
 * 结构照 Codex 的 `ew`(`subagent-activity-chip-group`),展开体是:
 *
 * ```
 * ActivityBody variant="grouped"                 ← 不缩进、不加 gap-2/pt-2
 * ├ div.[&_*]:text-token-non-assistant-body-descendant.flex.flex-col.gap-0.5
 * │   └ McpContentBlockPart × n                  ← 散文
 * ├ CodeSnippet(json, max-h-48)                  ← 结果整体是 JSON 时
 * └ div.inline-flex.w-fit > button               ← 「原始输出」触发器(hover 才显)
 * ```
 *
 * ## 与上一版的三处差别(都是实测比对出来的)
 *
 * 1. **不再有入参代码块。** Codex 的展开体里只有结果;入参连同 callId、耗时、
 *    原始 result 一起收进「原始输出」对话框。折叠一行的目的是回答"这次调用干了
 *    什么",请求体是排查时才要的东西,常驻会把结果挤下去。
 * 2. **结果按内容分流,不是一律代码块。** 上一版把整个 `content` 数组
 *    `JSON.stringify` 塞进代码块 —— 等宽 + `whitespace-pre!`(不换行),
 *    MCP 返回的长 URL 直接横向溢出;而 MCP 结果**经常就是散文**。
 *    现在:整体是 JSON → 代码块;否则 → `McpContentBlockPart` 的散文排版。
 * 3. **展开体 variant 是 `grouped` 且不缩进。** `ToolActivityDisclosure` 的默认档
 *    (`default` + `indent`)会给出 `gap-2 pt-2 pb-1 ps-6`,Codex 这里是
 *    `gap-[var(--conversation-grouped-item-gap,4px)] pt-1` 且没有 `ps-6`。
 *
 * `group` 类挂在行的外层容器上,给「原始输出」按钮的 `group-hover:opacity-100`
 * 提供作用域 —— 按钮平时是透明的,鼠标进到这一行才浮出来。
 */
export function InputOutputToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: InputOutputToolData
}): React.JSX.Element {
  const [rawOpen, setRawOpen] = useState(false)

  const hasResult =
    data.blocks.length > 0 || data.structuredJson != null || data.error != null
  const running = toolStatus(invocation) === 'running'

  return (
    <>
      <ToolActivityDisclosure
        className="group"
        icon={<ToolActivityIcon invocation={invocation} />}
        status={toolStatus(invocation)}
        summary={toolSummary(invocation)}
        bodyVariant="grouped"
        indentContent={false}
      >
        {/*
         * 运行中还没有任何结果时不给展开体 —— 有 children 就会长出 chevron,
         * 点开却是空的。Codex 同理:`De`/`N`/`Oe` 全空且未完成时那一支是 null。
         */}
        {hasResult || !running ? (
          <>
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
          </>
        ) : undefined}
      </ToolActivityDisclosure>

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
