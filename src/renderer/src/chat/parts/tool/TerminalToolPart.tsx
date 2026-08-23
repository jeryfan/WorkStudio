import type { TerminalToolData, ToolInvocation } from '../../model/toolInvocation'
import { toolStatus, toolSummary } from '../../model/toolDisplay'
import { ToolActivityDisclosure } from '../activity'
import { ToolActivityIcon } from './ToolActivityIcon'
import { TerminalOutput } from './TerminalOutput'

/**
 * 终端命令的活动行。
 *
 * 之前是 VS Code 的 `Collapsible`(常驻 chevron + 对勾 + `grid-template-rows`
 * 动画),现在是 Codex 的 `ToolActivityDisclosure`:
 *
 * - 摘要就是一句话("Ran npm test in 2.3s"),耗时拼在句子里而不是另起后缀
 * - 运行中默认**展开**、跑完自动收起,由 disclosure 的两个状态位实现
 * - 完成后没有对勾图标 —— 状态由时态和流光表达
 *
 * 退出码非零时把它拼进摘要:Codex 的 exec 行也是这么做的(失败信息属于句子,
 * 不是一个单独的红色徽章)。
 */
export function TerminalToolPart({
  invocation,
  data
}: {
  invocation: ToolInvocation
  data: TerminalToolData
}): React.JSX.Element {
  const failed = data.exitCode != null && data.exitCode !== 0
  const summary = failed
    ? `${toolSummary(invocation)} · exit ${data.exitCode}`
    : toolSummary(invocation)
  const hasBody = data.commandForDisplay.length > 0 || (data.output?.length ?? 0) > 0

  return (
    <ToolActivityDisclosure
      icon={<ToolActivityIcon invocation={invocation} />}
      status={toolStatus(invocation)}
      summary={summary}
    >
      {hasBody ? (
        <TerminalOutput command={data.commandForDisplay} output={data.output} />
      ) : undefined}
    </ToolActivityDisclosure>
  )
}
