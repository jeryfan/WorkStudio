import { useState, useSyncExternalStore } from 'react'
import { ActivityMcpIcon } from '../../../components/icons/activity'
import { useTheme } from '../../theme/themeContext'
import { readMcpToolLogo, subscribeMcpToolLogos } from '../../../services/chat/mcpLogoService'

/**
 * MCP 工具的图标 —— Codex 的 `kg`(`Fg` 的 mcp-tool-call 分支)。
 *
 * 级联(与源码同序):
 * 1. 连接器 app 的 logo(`appContext.connectorId` → `app/list`)
 * 2. MCP 服务器自报的 icon(`mcpServerStatus/list` → `serverInfo.icons`)
 * 3. 四点兜底图标(`Ui`,Codex 在无 logo 时渲染的就是它)
 *
 * Codex 另有两档 WS 没有数据源的:browserUse 结果的站点 favicon、
 * MCP app 的插件 logo —— 协议里没有,不实现。
 *
 * 类名照会话里的实测(组表头/组内子行/独立行同一份):
 * 兜底 svg 与 logo img 都是
 * `rounded-2xs icon-xs shrink-0 bg-token-main-surface-primary object-contain`
 * (兜底另带 `text-token-conversation-body`)。
 */
export function McpToolIcon({
  server,
  connectorId
}: {
  server: string
  connectorId: string | null
}): React.JSX.Element {
  const { variant: themeVariant } = useTheme()
  const logo = useSyncExternalStore(subscribeMcpToolLogos, () =>
    readMcpToolLogo(server, connectorId)
  )
  const [failed, setFailed] = useState(false)

  const src = themeVariant === 'dark' ? (logo?.logoUrlDark ?? logo?.logoUrl) : logo?.logoUrl
  if (src != null && !failed) {
    return (
      <img
        alt={server}
        src={src}
        onError={() => setFailed(true)}
        className="rounded-2xs icon-xs shrink-0 bg-token-main-surface-primary object-contain"
      />
    )
  }
  /*
   * 兜底四点 svg 的类名照 Codex 实测 —— 它是两段类串拼接(`kg` 的 fallback 类 +
   * 外层 logo 槽位类),`rounded-2xs icon-xs shrink-0 text-token-conversation-body`
   * 各出现两次是 Codex 自己的合并结果,不是重复笔误。
   */
  return (
    <ActivityMcpIcon
      aria-hidden
      className="rounded-2xs icon-xs shrink-0 rounded-2xs bg-token-main-surface-primary object-contain text-token-conversation-body icon-xs shrink-0 text-token-conversation-body"
    />
  )
}
