import {
  ActivityInterruptedIcon,
  ActivityListFilesIcon,
  ActivityPatchIcon,
  ActivityReadFileIcon,
  ActivityTerminalIcon,
  BrowserGlobeIcon,
  SearchIcon
} from '../../../components/icons'
import { McpToolIcon } from './McpToolIcon'
import { isWebCommand } from '../../model/toolActivityLabel.ts'
import type { TerminalToolData, ToolInvocation } from '../../model/toolInvocation'

/**
 * 活动行图标 —— 逐条对应 Codex `subagent-activity-chip-group` 里的 `Fg(item)`。
 *
 * exec 分支的**顺序**是这一版纠正的重点(源码逐字):
 *
 * ```
 * case 'exec':
 *   if (parsedCmd.type === 'read')        → 书(skill 定义文件另有两个变体)
 *   if (parsedCmd.type === 'search')      → 放大镜
 *   if (parsedCmd.type === 'list_files')  → 文件夹
 *   if (executionStatus === 'interrupted')→ 圆角实心方块(停止)
 *   if (isWebCommand(cmd))                → 地球
 *   if (可视化命令)                        → 柱状图
 *   …                                     → 终端
 * case 'patch':      → 笔
 * case 'web-search': → 地球
 * case 'mcp-tool-call': → 服务器 logo 级联(`kg`)
 * case 'dynamic-tool-call': → 工具注册表,查不到**不给图标**
 * case 'assistant-message' / 'user-message' / 'worked-for': → 无图标
 * ```
 *
 * 上一版把「中断 → 停止图标」提到了最前面,而且对所有条目类型生效。两处都错:
 * 被中断的 `Read foo.ts` 在 Codex 里仍然是**书**(命令类别比结束方式更能说明
 * 这一行在干什么),而 patch / web-search / MCP 的图标**从不**因中断换掉。
 *
 * 类名在 Codex 里是个共享常量(`Lg`),所有活动行图标一字不差都用它:
 * `icon-xs shrink-0 text-token-conversation-body`。所以这里也只有一个常量。
 *
 * 两个复用:放大镜与地球的 path 与 WS 已有的 `SearchIcon` / `BrowserGlobeIcon`
 * **逐字相同**(比对过 `d` 属性),不另生成。
 */
export const ACTIVITY_ICON_CLASS = 'icon-xs shrink-0 text-token-conversation-body'

export function ToolActivityIcon({
  invocation
}: {
  invocation: ToolInvocation
}): React.JSX.Element | null {
  const data = invocation.data
  switch (data.kind) {
    case 'terminal':
      return terminalIcon(data, invocation)
    case 'fileEdit':
      return <ActivityPatchIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'search':
      return <BrowserGlobeIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'inputOutput':
      /*
       * MCP / dynamic 工具 —— Codex `Fg` 这一档走 `kg`:logo 级联
       * (连接器 app → 服务器自报 icon),都拿不到时是四点兜底图标。
       * dynamic 工具没有服务器名,Codex 那里走工具注册的图标,
       * WS 没有注册表,同样落兜底。
       */
      return data.source.kind === 'mcp' ? (
        <McpToolIcon server={data.source.server} connectorId={data.source.connectorId} />
      ) : /*
       * dynamic-tool-call:Codex `Fg` 这一档是 `renderAgentActivityIcon`
       * 注册表,查不到注册的工具**不渲染图标**(返回 null)。
       * WS 没有注册表,同样不渲染。
       */
      null
  }
}

/** exec 的图标 —— Codex `Fg()` 的 exec 分支,顺序照抄 */
function terminalIcon(data: TerminalToolData, invocation: ToolInvocation): React.JSX.Element {
  switch (data.parsedCmd.type) {
    case 'read':
      return <ActivityReadFileIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'search':
      return <SearchIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'listFiles':
      return <ActivityListFilesIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'unknown':
      break
  }
  const interrupted =
    invocation.state.type === 'cancelled' && invocation.state.reason === 'interrupted'
  if (interrupted) return <ActivityInterruptedIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
  // `Np(cmd)` —— curl 拉外网 URL:这一行的语义是"上网查",不是"跑了条命令"
  if (isWebCommand(data.command)) {
    return <BrowserGlobeIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
  }
  /*
   * Codex 这里还有一档 `Fp(status) && kp(cmd) != null` → 柱状图(可视化命令),
   * 要 visualization 通道,协议没有。
   */
  return <ActivityTerminalIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
}
