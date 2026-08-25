import { useEffect, useState } from 'react'
import type { BrowserTabState } from '@shared/host/messages'
import { subscribeHostMessage } from './hostMessages'
import { whenHostServicesReady } from './appHost'

/**
 * 浏览器 tab 状态的订阅。
 *
 * 取证：Codex 的渲染层**不持有** url/title/loading —— 它订阅宿主广播的
 * `browser-sidebar-state`。原因见 main/browser/BrowserSidebarManager.ts 的说明：
 * 真值在 guest 进程，而 browser_use 从 agent 侧驱动页面时渲染层根本不在链路上。
 *
 * 首帧用 `browserSidebar.getState()` 拉一次：面板重新挂载（切 tab、切会话）时
 * 宿主不会为此重播一遍状态，不主动拉就会空一帧。
 */
export function useBrowserSidebarState(conversationId: string): BrowserTabState[] {
  const [tabs, setTabs] = useState<BrowserTabState[]>([])

  useEffect(() => {
    let alive = true
    void whenHostServicesReady()
      .then((services) => services.browserSidebar.getState(conversationId))
      .then((initial) => {
        if (alive) setTabs(initial)
      })
      .catch(() => undefined)

    const unsubscribe = subscribeHostMessage('browser-sidebar-state', (message) => {
      if (message.conversationId !== conversationId) return
      setTabs(message.tabs)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [conversationId])

  return tabs
}

/** 单个 tab 的状态（宿主还没有这个 tab 时为 undefined） */
export function useBrowserTabState(
  conversationId: string,
  browserTabId: string
): BrowserTabState | undefined {
  const tabs = useBrowserSidebarState(conversationId)
  return tabs.find((tab) => tab.browserTabId === browserTabId)
}
