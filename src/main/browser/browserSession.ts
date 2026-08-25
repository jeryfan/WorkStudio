import { app, session, type Session } from 'electron'
import { desktopUserAgent } from '@shared/host/channels'
import type { BrowsingDataKind } from '@shared/host/messages'

/**
 * 内置浏览器的会话（cookie/缓存）隔离。
 *
 * 取证：Codex 的 partition 前缀是 `persist:codex-browser-`，profile 名经
 * `encodeURIComponent` 拼在后面，默认 profile 是 `app`；清数据时的 storages 是
 * `['fileSystems','indexedDB','localStorage','webSQL','serviceWorkers']`。
 *
 * 为什么必须由主进程决定 partition 而不是让渲染层写在 `<webview partition=...>`：
 * 渲染层能写就意味着页面能被引导到应用自己的 session 里（那里有登录态），
 * 所以 Codex 在 `will-attach-webview` 里**无条件覆盖** partition。
 */
const PARTITION_PREFIX = 'persist:codex-browser-'
const SITE_DATA_STORAGES = [
  'fileSystems',
  'indexedDB',
  'localStorage',
  'websql',
  'serviceworkers'
] as const

export const DEFAULT_BROWSER_PROFILE = 'app'

export function browserPartition(profile: string = DEFAULT_BROWSER_PROFILE): string {
  return `${PARTITION_PREFIX}${encodeURIComponent(profile)}`
}

let configured = false

/** 取得（并在首次调用时配置）内置浏览器的 session */
export function configureBrowserSession(profile: string = DEFAULT_BROWSER_PROFILE): Session {
  const browserSession = session.fromPartition(browserPartition(profile))
  if (!configured) {
    configured = true
    // UA 里带产品标识：站点的兼容性分支与我们的埋点都靠它
    browserSession.setUserAgent(desktopUserAgent({ appVersion: app.getVersion() }))
    // 内置浏览器不该弹权限框：默认全部拒绝，需要时再逐项放开
    browserSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  }
  return browserSession
}

export async function clearBrowsingData(
  kinds: BrowsingDataKind[],
  profile: string = DEFAULT_BROWSER_PROFILE
): Promise<void> {
  const browserSession = configureBrowserSession(profile)
  if (kinds.includes('cache')) await browserSession.clearCache()
  const storages: string[] = []
  if (kinds.includes('cookies')) storages.push('cookies')
  if (kinds.includes('siteData')) storages.push(...SITE_DATA_STORAGES)
  if (storages.length > 0) {
    await browserSession.clearStorageData({
      storages: storages as NonNullable<Electron.ClearStorageDataOptions['storages']>
    })
  }
}
