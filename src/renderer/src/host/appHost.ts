import { newMessagePortRpcSession, RpcTarget, type RpcStub } from 'capnweb'
import type {
  AppHostMain,
  AppInfoSnapshot,
  AppUpdatesViewService,
  AppUpdateViewState,
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

/**
 * 更新状态的接收端（Codex `appUpdates.stateChanged`）。
 *
 * 状态是**推**过来的快照，渲染层只存最后一份。这里做成 store 而不是直接
 * setState：注册时机（capnweb 握手完成）比任何组件挂载都早，先到的那份必须
 * 存下来，否则 app header 要等到下一次状态变化才有东西可画。
 */
class AppUpdates extends RpcTarget implements AppUpdatesViewService {
  private state: AppUpdateViewState | null = null
  private readonly listeners = new Set<(state: AppUpdateViewState) => void>()

  stateChanged(state: AppUpdateViewState): void {
    this.state = state
    for (const listener of Array.from(this.listeners)) listener(state)
  }

  getState(): AppUpdateViewState | null {
    return this.state
  }

  subscribe(listener: (state: AppUpdateViewState) => void): () => void {
    this.listeners.add(listener)
    if (this.state != null) listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

const appUpdates = new AppUpdates()

/** 订阅更新状态（app header 用） */
export function subscribeAppUpdates(listener: (state: AppUpdateViewState) => void): () => void {
  return appUpdates.subscribe(listener)
}

export function getAppUpdateState(): AppUpdateViewState | null {
  return appUpdates.getState()
}

class AppView extends RpcTarget {
  /*
   * getter 而不是实例属性：capnweb 只暴露类上的方法与 getter，
   * 实例属性会被拒（Codex 的 AppView 也是 `get services()`）。
   */
  get services(): AppViewServices {
    return { clientCoordination, appUpdates }
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

/**
 * 启动门禁 —— Codex `appServices.startup.whenReady()`。
 *
 * 语义与失败时也 resolve 的理由见 `@shared/host/appHost` 的 `StartupService`。
 * 这里刻意**只调一次并缓存**：它是 `use()` 的入参，每次渲染都新建一个 promise
 * 会让 React 永远挂起（新 promise 永远是 pending 状态的那一帧）。
 */
let startupReady: Promise<void> | undefined

export function whenStartupReady(): Promise<void> {
  startupReady ??= whenHostServicesReady().then((services) => services.startup.whenReady())
  return startupReady
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
