import type {
  AppShellTabDescriptorInput,
  AppShellTabRenderProps
} from '../../state/AppShellContext'
import { newBrowserTabId } from '../../state/AppShellContext'
import { BrowserGlobeIcon } from '../icons'
import { BrowserTab } from './BrowserTab'
import { browserConversationId } from '../../host/browserScope'
import { removeBrowserSurface } from '../../host/browserSurfaces'

export interface BrowserTabState {
  /** 当前 URL;空 = 新标签页(标题 "New tab",空态引导 "Start browsing") */
  url: string
  /** 缩放百分比(Codex 每个 browser tab 各自的 zoomPercent;默认 100) */
  zoomPercent: number
}

/** renderPanel 额外收到的 props(Codex browser tab 的 props 含初始 url 等) */
export interface BrowserTabRenderProps extends AppShellTabRenderProps<BrowserTabState> {
  initialUrl: string
}

/**
 * Browser tab 描述符工厂 —— tabId 是随机 UUID(实测);tab 图标是地球,
 * svg 类为 size-full(尺寸由 strip 的 icon-xs 容器给)。
 * Codex 的 browser tab `kind` 未能从 bundle 取证(host 侧创建),不设 ——
 * activeTabReactKey 退回 tabId(UUID),每个 browser tab 各自挂载。
 */
/**
 * `browserTabId` 只在 browser_use 侧开页时给：那个 id 是宿主生成的（`bu-…`），
 * 宿主的页面注册表已经用它建好了路由，渲染层必须用同一个 id 才能认领到那条
 * 路由 —— 自己再生成一个 UUID 会让宿主和渲染层各自持有一个半成品 tab。
 */
export function createBrowserTabDescriptor(
  url = '',
  browserTabId?: string
): AppShellTabDescriptorInput<BrowserTabState> {
  const tabId = browserTabId ?? newBrowserTabId()
  return {
    tabId,
    title: 'New tab',
    icon: <BrowserGlobeIcon className="size-full" />,
    defaultState: () => ({ url, zoomPercent: 100 }),
    /*
     * tab 真的被关掉时才回收宿主侧的页面（Codex 的 tab 描述符 onClose 同义）。
     * 面板卸载 / 切 tab 都不走这里 —— 页面要活过那些。
     */
    onClose: () => removeBrowserSurface(browserConversationId(), tabId),
    renderPanel: (props) => <BrowserTab {...props} initialUrl={url} />
  }
}
