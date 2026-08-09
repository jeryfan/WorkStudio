import { useEffect, useRef, useState } from 'react'
import { usePanels, type PanelTab } from '../../state/PanelContext'
import { ArrowIcon, ReviewIcon } from '../icons'

/** 新 browser tab 的默认主页 */
const HOME_URL = 'https://www.google.com'

/** 地址栏输入归一化：无协议补 https://，仅允许 http/https */
function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return /^https?:\/\//i.test(withScheme) ? withScheme : null
}

interface BrowserTabProps {
  tab: PanelTab
  dock: 'right' | 'bottom'
}

/**
 * Browser tab —— Electron <webview> 内嵌浏览器。
 * 安全基线：独立 session partition、webview 内默认 nodeIntegration=false、
 * new-window 一律交给系统浏览器（shell:openExternal，仅 http/https）。
 */
export function BrowserTab({ tab, dock }: BrowserTabProps): React.JSX.Element {
  const { updateTab } = usePanels()
  const initialUrl = normalizeUrl(tab.payload.url ?? '') ?? HOME_URL
  const [address, setAddress] = useState(initialUrl)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const [loading, setLoading] = useState(false)
  const viewRef = useRef<HTMLElement | null>(null)

  // 挂载 webview 事件（元素 ref 方式获取 Electron WebviewTag 实例方法）
  useEffect(() => {
    const view = viewRef.current as unknown as {
      addEventListener(type: string, fn: (e: { url?: string; title?: string }) => void): void
      removeEventListener(type: string, fn: (e: { url?: string; title?: string }) => void): void
      canGoBack(): boolean
      canGoForward(): boolean
      getURL(): string
    } | null
    if (!view) return

    const syncNav = (): void => {
      setCanBack(view.canGoBack())
      setCanForward(view.canGoForward())
      const current = view.getURL()
      if (current) setAddress(current)
    }
    const onNavigate = (): void => syncNav()
    const onTitle = (e: { title?: string }): void => {
      if (e.title) updateTab(dock, tab.id, { title: e.title })
    }
    const onNewWindow = (e: { url?: string }): void => {
      // 弹出窗口一律交给系统浏览器
      if (e.url) void window.api.openExternal(e.url)
    }
    const onStart = (): void => setLoading(true)
    const onStop = (): void => {
      setLoading(false)
      syncNav()
    }

    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate-in-page', onNavigate)
    view.addEventListener('page-title-updated', onTitle)
    view.addEventListener('new-window', onNewWindow)
    view.addEventListener('did-start-loading', onStart)
    view.addEventListener('did-stop-loading', onStop)
    return () => {
      view.removeEventListener('did-navigate', onNavigate)
      view.removeEventListener('did-navigate-in-page', onNavigate)
      view.removeEventListener('page-title-updated', onTitle)
      view.removeEventListener('new-window', onNewWindow)
      view.removeEventListener('did-start-loading', onStart)
      view.removeEventListener('did-stop-loading', onStop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dock, tab.id])

  const go = (input: string): void => {
    const url = normalizeUrl(input)
    if (!url) return
    setAddress(url)
    const view = viewRef.current as unknown as { loadURL(url: string): Promise<void> } | null
    view?.loadURL(url)?.catch(() => {})
  }

  const callView = (method: 'goBack' | 'goForward' | 'reload'): void => {
    const view = viewRef.current as unknown as Record<string, () => void> | null
    view?.[method]?.()
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 工具栏 */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[#e2e4e8] px-2">
        <button
          type="button"
          aria-label="Back"
          disabled={!canBack}
          onClick={() => callView('goBack')}
          className="flex size-7 items-center justify-center rounded-lg text-tertiary enabled:hover:bg-row-hover disabled:cursor-default disabled:opacity-40 [&_svg]:size-4"
        >
          <ArrowIcon />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!canForward}
          onClick={() => callView('goForward')}
          className="flex size-7 items-center justify-center rounded-lg text-tertiary enabled:hover:bg-row-hover disabled:cursor-default disabled:opacity-40 [&_svg]:size-4"
        >
          <ArrowIcon className="-scale-x-100" />
        </button>
        <button
          type="button"
          aria-label="Reload"
          onClick={() => callView('reload')}
          className={`flex size-7 items-center justify-center rounded-lg text-tertiary hover:bg-row-hover [&_svg]:size-4 ${
            loading ? 'animate-spin' : ''
          }`}
        >
          <ReviewIcon />
        </button>

        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            go(address)
          }}
        >
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            spellCheck={false}
            aria-label="Address"
            className="h-7 w-full rounded-lg border border-[#e2e4e8] bg-[#f6f7f8] px-2.5 text-[13px] text-ink outline-none placeholder:text-[#9ba1a6] focus:border-focus"
            placeholder="Search or enter URL"
          />
        </form>

        <button
          type="button"
          aria-label="Open in external browser"
          title="Open in external browser"
          onClick={() => void window.api.openExternal(address)}
          className="flex size-7 items-center justify-center rounded-lg text-tertiary hover:bg-row-hover [&_svg]:size-4"
        >
          <ArrowIcon className="-rotate-45" />
        </button>
      </div>

      {/* 网页内容（webview 专有属性经 spread 传入，绕过 react/no-unknown-property） */}
      <webview
        ref={viewRef as React.RefObject<HTMLElement>}
        src={initialUrl}
        className="min-h-0 flex-1"
        {...{
          partition: 'persist:browser',
          webpreferences: 'contextIsolation=yes, nodeIntegration=no'
        }}
      />
    </div>
  )
}
