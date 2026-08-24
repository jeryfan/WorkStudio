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
import type { TerminalToolData, ToolInvocation } from '../../model/toolInvocation'

/**
 * 活动行图标 —— 逐条对应 Codex `subagent-activity-chip-group` 里的 `Fg(item)`。
 *
 * 那个函数的 exec 分支是**先看命令被解析成了什么**,才落到终端图标:
 *
 * ```
 * case 'exec':
 *   if (parsedCmd.type === 'read')        → 书(skill 定义文件另有两个变体)
 *   if (parsedCmd.type === 'search')      → 放大镜
 *   if (parsedCmd.type === 'list_files')  → 文件夹
 *   if (executionStatus === 'interrupted')→ 圆角实心方块(停止)
 *   if (isWebCommand(cmd))                → 地球
 *   …                                     → 终端
 * case 'patch':      → 笔
 * case 'web-search': → 地球
 * case 'reasoning':  → **无图标**(推理块走 ActivityHeader,不走 ActivityHeaderRow)
 * ```
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
  const interrupted =
    invocation.state.type === 'cancelled' && invocation.state.reason === 'interrupted'
  if (interrupted) {
    return <ActivityInterruptedIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
  }

  const data = invocation.data
  switch (data.kind) {
    case 'terminal':
      // 内层 switch 每个分支都 return,所以外层不需要 break —— 但 eslint 的
      // no-fallthrough 看不穿嵌套 switch,给它一个显式的兜底 return。
      return terminalIcon(data.commandKind)
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

/** exec 的图标按命令类别分 —— Codex `Fg()` 的 exec 分支 */
function terminalIcon(kind: TerminalToolData['commandKind']): React.JSX.Element {
  switch (kind) {
    case 'read':
      return <ActivityReadFileIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'search':
      return <SearchIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'listFiles':
      return <ActivityListFilesIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
    case 'unknown':
      return <ActivityTerminalIcon aria-hidden className={ACTIVITY_ICON_CLASS} />
  }
}
