import type { AppShellTabDescriptorInput } from '../../state/AppShellContext'
import { newBrowserTabId } from '../../state/AppShellContext'
import { BrowserGlobeIcon } from '../icons'
import { BrowserTab } from './BrowserTab'

export interface BrowserTabState {
  /** 当前 URL;空 = 新标签页(标题 "New tab",空态引导) */
  url: string
}

/**
 * Browser tab 描述符工厂 —— tabId 是随机 UUID(实测);tab 图标是地球,
 * svg 类为 size-full(尺寸由 strip 的 icon-xs 容器给)。
 */
export function createBrowserTabDescriptor(url = ''): AppShellTabDescriptorInput<BrowserTabState> {
  return {
    tabId: newBrowserTabId(),
    title: 'New tab',
    icon: <BrowserGlobeIcon className="size-full" />,
    defaultState: () => ({ url }),
    renderPanel: (props) => <BrowserTab {...props} />
  }
}
