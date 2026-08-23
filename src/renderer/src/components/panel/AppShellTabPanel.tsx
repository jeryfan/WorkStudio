import { Component, type ReactNode } from 'react'
import type { AppShellTabDescriptor, AppShellTabPanelController } from '../../state/AppShellContext'

/**
 * AppShellTabPanel —— Codex 里这个名字属于 **tab 内容区的 error boundary**
 * (app-initial:208423 QCr:fallback 文案 "Tab content couldn't render / Try again")。
 * 之前 WorkStudio 把整条 strip+面板组件叫这个名字,是误用,已由 AppShellTabs 取代。
 *
 * tabpanel 层逐层对齐 QCr 实测:
 *
 *   div[role=tabpanel][aria-label=标题][data-app-shell-tab-panel-controller][data-tab-id]
 *     [tabindex=-1].relative.min-h-0.flex-1.outline-none
 *     onPointerDownCapture / onKeyDownCapture:目标是 [data-tab-preview-pin-exempt]
 *     子树则豁免,否则 preview tab 立即 pin(Codex 的 JCr 判定)
 *   └ <ErrorBoundary name="AppShellTabPanel" resetKey={tabId}>  ← tab 崩溃不拖垮整个面板
 *     └ tab.renderPanel({tabId, isActive, onClose, tabState, setTabState})
 */

/** Codex `ZCr` = "data-tab-preview-pin-exempt"(app-initial:208422) */
export const TAB_PREVIEW_PIN_EXEMPT = 'data-tab-preview-pin-exempt'

function isPinExempt(e: Event): boolean {
  return e.target instanceof Element && e.target.closest(`[${TAB_PREVIEW_PIN_EXEMPT}]`) != null
}

class TabPanelErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error): void {
    console.error('[AppShellTabPanel] tab content crashed:', error)
  }

  override componentDidUpdate(prevProps: { resetKey: string }): void {
    // Codex:resetKey(tabId)变化时重置错误态
    if (prevProps.resetKey !== this.props.resetKey && this.state.error != null) {
      this.setState({ error: null })
    }
  }

  override render(): ReactNode {
    if (this.state.error != null) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="text-sm text-token-text-primary">Tab content couldn&apos;t render</div>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="cursor-interaction rounded-lg px-2 py-1 text-sm text-token-text-secondary hover:bg-token-list-hover-background"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function AppShellTabPanel({
  controller,
  tab
}: {
  controller: AppShellTabPanelController
  tab: AppShellTabDescriptor
}): React.JSX.Element {
  const pinOnInteract = (e: React.SyntheticEvent): void => {
    if (isPinExempt(e.nativeEvent)) return
    if (tab.isPreview) controller.pinTab(tab.tabId)
  }

  const entry = controller.tabStateById[tab.tabId]
  const tabState = entry == null ? tab.defaultState?.() : entry.value

  return (
    <div
      role="tabpanel"
      aria-label={tab.title}
      data-app-shell-tab-panel-controller={controller.panelId}
      data-tab-id={tab.tabId}
      tabIndex={-1}
      onPointerDownCapture={pinOnInteract}
      onKeyDownCapture={pinOnInteract}
      className="relative min-h-0 flex-1 outline-none"
    >
      <TabPanelErrorBoundary resetKey={tab.tabId}>
        {tab.renderPanel({
          tabId: tab.tabId,
          isActive: true,
          onClose: () => controller.closeTab(tab.tabId),
          tabState,
          setTabState: (next) => controller.setTabState(tab.tabId, next)
        })}
      </TabPanelErrorBoundary>
    </div>
  )
}
