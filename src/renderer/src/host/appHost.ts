import { newMessagePortRpcSession, RpcTarget, type RpcStub } from 'capnweb'
import type {
  AppHostMain,
  AppInfoSnapshot,
  AppViewServices,
  ClientCoordinationService,
  RemoteAppHostServices
} from '@shared/host/appHost'

/**
 * 宿主服务树的客户端。
 *
 * 取证（Codex 渲染层 `app-initial-*.js` 实测）：
 * ```js
 * function connectAppHost() {
 *   const {port1, port2} = new MessageChannel()
 *   window.postMessage({type:'connect-app-host', port: port2}, location.origin, [port2])
 *   return newMessagePortRpcSession(port1, appView)      // capnweb
 * }
 * async function initAppHost() {
 *   hostStub = connectAppHost()
 *   Bm = await hostStub.services                          // ← 整棵服务树
 *   if (Bm.clientCoordination) initClientCoordination(Bm.clientCoordination)
 *   if (Bm.terminal) initTerminal(Bm.terminal)
 * }
 * ```
 * 注意 `Bm` 是**模块级可空变量**，调用方写 `hostServices?.x.y()`。
 * 这里保持同一形状（ESM 的实时绑定让 `hostServices` 的更新对导入方可见），
 * 不额外包一层 Proxy/await 门面 —— 那样会把"服务还没连上"这件事藏起来，
 * 出问题时看不出是握手没完成还是调用失败。
 */

/** 渲染层反向暴露给主进程的服务（Codex 的 `AppView`） */
class ClientCoordination extends RpcTarget implements ClientCoordinationService {
  private readonly listeners = new Set<(queryKey: readonly string[]) => void>()

  invalidateQueryCache(params: { queryKey: readonly string[] }): void {
    for (const listener of this.listeners) listener(params.queryKey)
  }

  subscribe(listener: (queryKey: readonly string[]) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

const clientCoordination = new ClientCoordination()

class AppView extends RpcTarget {
  /*
   * getter 而不是实例属性：capnweb 只暴露类上的方法与 getter，
   * 实例属性会被拒（Codex 的 AppView 也是 `get services()`）。
   */
  get services(): AppViewServices {
    return { clientCoordination }
  }
}

const appView = new AppView()

/** 主进程侧的服务树；握手完成前是 undefined（与 Codex 的 `Bm` 同语义） */
export let hostServices: RemoteAppHostServices | undefined

let hostStub: RpcStub<AppHostMain> | undefined
let handshake: Promise<RemoteAppHostServices> | undefined

function connectAppHost(): RpcStub<AppHostMain> {
  const { port1, port2 } = new MessageChannel()
  /*
   * 把 port2 交给 preload 转移给主进程。
   * 走 window.postMessage 而不是直接 bridge 调用的原因：contextBridge 不能穿
   * MessagePort，只有 `ipcRenderer.postMessage` 的 transfer list 能。
   */
  window.postMessage({ type: 'connect-app-host', port: port2 }, window.location.origin, [port2])
  return newMessagePortRpcSession<AppHostMain>(port1, appView)
}

/** 建立服务树连接（App 根挂载时调一次，Codex 的 `R8e`） */
export function initAppHost(): Promise<RemoteAppHostServices> {
  if (handshake != null) return handshake
  handshake = (async () => {
    hostStub = connectAppHost()
    const services = (await hostStub.services) as unknown as RemoteAppHostServices
    hostServices = services
    // 不变量（版本/平台/家目录）预取一份，纯展示逻辑就不必变成异步
    cachedAppInfo = await services.appInfo.get()
    // 开发期把服务树挂到 window 上，便于在 DevTools/CDP 里直接调服务验证
    if (import.meta.env.DEV) {
      ;(window as unknown as { __hostServices?: unknown }).__hostServices = services
    }
    return services
  })()
  handshake.catch((error: unknown) => {
    console.error('[host] app host handshake failed', error)
    handshake = undefined
  })
  return handshake
}

/** 等服务树就绪（需要在启动早期就调服务的地方用） */
export function whenHostServicesReady(): Promise<RemoteAppHostServices> {
  return handshake ?? initAppHost()
}

/** 订阅主进程发来的查询失效通知 */
export function onQueryCacheInvalidated(
  listener: (queryKey: readonly string[]) => void
): () => void {
  return clientCoordination.subscribe(listener)
}

/**
 * appInfo 的同步快照（握手时预取，见 initAppHost）。
 * 版本号、平台、家目录在整个进程生命周期里不变，没必要每次都过一趟 RPC。
 */
let cachedAppInfo: AppInfoSnapshot | undefined

export function hostAppInfo(): AppInfoSnapshot | undefined {
  return cachedAppInfo
}
