import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import type { ListMcpServerStatusResponse } from '@shared/protocol/generated/v2/ListMcpServerStatusResponse'
import type { AppsListResponse } from '@shared/protocol/generated/v2/AppsListResponse'

/**
 * MCP 工具的 logo 通道 —— Codex `kg`(`Fg` 的 mcp-tool-call 分支)的数据层。
 *
 * Codex 的 logo 级联依赖它的连接器目录(`resolvedApps`)与宿主提供的
 * `mcpServerStatuses`;WS 的数据同款,来自 app-server 的两个方法:
 *
 * - `app/list` → 连接器 app 目录(`AppInfo.logoUrl` / `logoUrlDark`),
 *   由 `mcpToolCall.appContext.connectorId` 关联到具体调用
 * - `mcpServerStatus/list` → 每个 MCP 服务器自报的 `serverInfo.icons`
 *   (MCP 规范的图标清单,取第一条的 `src`)
 *
 * 两个清单都小且不常变,会话内取一次缓存;`mcpServer/startupStatus/updated`
 * 到达时缓存作废(服务器可能后来才连上)。
 *
 * 都没有时返回 null —— 渲染层落到 Codex 的四点兜底图标(`ActivityMcpIcon`),
 * 与 Codex 无 logo 时的行为一致。
 */
export interface McpToolLogo {
  logoUrl: string | null
  logoUrlDark: string | null
}

interface Cache {
  byConnectorId: Map<string, McpToolLogo>
  byServer: Map<string, McpToolLogo>
}

let cache: Cache | null = null
let inflight: Promise<Cache> | null = null
const listeners = new Set<() => void>()

/** MCP 规范的 icons 数组是 JsonValue,尽力抽 src 字符串 */
function iconSrc(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null
  for (const item of raw) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const src = (item as Record<string, unknown>).src
      if (typeof src === 'string' && src.length > 0) return src
    }
  }
  return null
}

async function fetchCache(): Promise<Cache> {
  const [apps, statuses] = await Promise.all([
    rpc.request<AppsListResponse>(M.appList, {}).catch(() => null),
    rpc.request<ListMcpServerStatusResponse>(M.mcpServerStatusList, {}).catch(() => null)
  ])
  const byConnectorId = new Map<string, McpToolLogo>()
  for (const app of apps?.data ?? []) {
    if (app.logoUrl == null && app.logoUrlDark == null) continue
    byConnectorId.set(app.id, { logoUrl: app.logoUrl, logoUrlDark: app.logoUrlDark })
  }
  const byServer = new Map<string, McpToolLogo>()
  for (const server of statuses?.data ?? []) {
    const src = iconSrc(server.serverInfo?.icons)
    if (src != null) byServer.set(server.name, { logoUrl: src, logoUrlDark: src })
  }
  return { byConnectorId, byServer }
}

function load(): Promise<Cache> {
  if (cache != null) return Promise.resolve(cache)
  inflight ??= fetchCache()
    .then((c) => {
      cache = c
      inflight = null
      listeners.forEach((l) => l())
      return c
    })
    .catch(() => {
      inflight = null
      // 失败留下空缓存:不反复打协议,渲染层用兜底图标
      cache = { byConnectorId: new Map(), byServer: new Map() }
      return cache
    })
  return inflight
}

// 服务器状态变化 → 缓存作废,下一次读取重新拉
rpc.on('mcpServer/startupStatus/updated', () => {
  cache = null
  load().catch(() => {})
})

/**
 * 读一个 MCP 调用的 logo。立刻返回缓存(可能为 null),未加载时触发加载,
 * 到位后经 `subscribe` 通知。与 useSyncExternalStore 直接配套。
 */
export function readMcpToolLogo(server: string, connectorId: string | null): McpToolLogo | null {
  if (cache == null) void load()
  if (connectorId != null) {
    const byApp = cache?.byConnectorId.get(connectorId)
    if (byApp != null) return byApp
  }
  return cache?.byServer.get(server) ?? null
}

export function subscribeMcpToolLogos(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
