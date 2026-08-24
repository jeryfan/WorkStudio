import { useEffect, useRef, useState } from 'react'
import { useAppShell } from '../../state/AppShellContext'
import type { BrowserTabRenderProps } from './browserTabDescriptor'
import {
  ArrowIcon,
  BrowserReloadIcon,
  BrowserGlobeIcon,
  OpenExternalIcon,
  AnnotateIcon
} from '../icons'
import { APP_SHELL_BUTTON_CLASS } from './appShellButtonClass'
import { TAB_PREVIEW_PIN_EXEMPT } from './AppShellTabPanel'
import { BrowserOptionsMenu } from './BrowserOptionsMenu'
import { BrowserFindBar } from './BrowserFindBar'

/** 地址栏输入归一化：无协议补 https://，仅允许 http/https */
function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return /^https?:\/\//i.test(withScheme) ? withScheme : null
}

/**
 * Browser tab —— 逐层复刻 Codex 实测 DOM(2026-08-23,空 tab 态):
 *
 *   div.relative.h-full.min-h-0
 *   └ div.relative.grid.h-full.min-h-0.w-full.min-w-0.grid-rows-[auto_1fr]
 *       [data-browser-sidebar-chrome-expanded=true]            ← 稳态恒 true(初挂一瞬为 false)
 *       [data-browser-sidebar-primary-focus-target="address"]  ← 新 tab 自动聚焦地址栏(实测)
 *     ├ div.relative.z-10.h-toolbar-pane.min-w-0.shrink-0.border-b.border-token-border
 *     │ ├ div[data-browser-sidebar-toolbar] 三 zone:gap-px 导航 / flex-1 地址栏 / gap-1.5 动作
 *     │ └ div 进度条(loading 时 opacity-100,否则 0):animate-pulse bg-token-progress-bar-background
 *     └ div.relative.flex.min-h-0.min-w-0.flex-1.flex-col
 *       └ div.relative.min-h-0.min-w-0.flex-1.overflow-hidden
 *         ├ 有 url → <webview>(Electron 载体;Codex 是独立受控 browser target,DOM 不可比)
 *         └ 无 url → 空态 "Start browsing / Enter a URL to open a page"(Zyo 空态家族,
 *           与 Files tab 空态同一套;注意这里的标题**不套 h2**,Files 空态才套)
 *
 * 与 Codex 的已知差异(标记):
 * - Codex 新 tab 不加载任何主页,空 URL 即空态 —— WS 也不再默认 google.com。
 * - Annotate 按钮:标注功能未实现,按实测的 disabled 态渲染。
 * - Browser options 菜单:8 个菜单项全是宿主功能(Find in page / device toolbar /
 *   screenshot / cookies / passwords / Downloads / clear data / settings),WS 无对应
 *   能力,本轮只落 trigger 的 DOM,菜单未实现。
 * - 加载进度条:Codex 由受控 browser 的加载事件驱动;WS 由 webview 事件驱动,等价。
 */
export function BrowserTab({
  tabId,
  initialUrl,
  tabState,
  setTabState
}: BrowserTabRenderProps): React.JSX.Element {
  const { rightPanelController } = useAppShell()
  const url = tabState.url !== '' ? tabState.url : normalizeUrl(initialUrl) || ''
  const [address, setAddress] = useState(url)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const [loading, setLoading] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const viewRef = useRef<HTMLElement | null>(null)
  const addressRef = useRef<HTMLInputElement | null>(null)
  const zoomPercent = tabState.zoomPercent

  // 缩放应用到 webview(Codex:host 对受控浏览器 setZoom;WS:webview.setZoomFactor)
  useEffect(() => {
    const view = viewRef.current as unknown as { setZoomFactor?(f: number): void } | null
    view?.setZoomFactor?.(zoomPercent / 100)
  }, [zoomPercent, url])

  // 新 tab 自动聚焦地址栏(data-browser-sidebar-primary-focus-target="address",实测)
  useEffect(() => {
    if (url === '') addressRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时
  }, [])

  // 挂载 webview 事件(元素 ref 方式获取 Electron WebviewTag 实例方法)
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
      if (current) {
        setAddress(current)
        setTabState({ ...tabState, url: current })
      }
    }
    const onNavigate = (): void => syncNav()
    const onTitle = (e: { title?: string }): void => {
      // tab 标题跟随网页标题(Codex 实测行为)
      if (e.title) rightPanelController.updateTab(tabId, { title: e.title })
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
  }, [tabId])

  const go = (input: string): void => {
    const next = normalizeUrl(input)
    if (!next) return
    setAddress(next)
    setTabState({ ...tabState, url: next })
    const view = viewRef.current as unknown as { loadURL(url: string): Promise<void> } | null
    view?.loadURL(next)?.catch(() => {})
  }

  const callView = (method: 'goBack' | 'goForward' | 'reload'): void => {
    const view = viewRef.current as unknown as Record<string, () => void> | null
    view?.[method]?.()
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        className="relative grid h-full min-h-0 w-full min-w-0 grid-rows-[auto_1fr]"
        data-browser-sidebar-chrome-expanded="true"
        data-browser-sidebar-primary-focus-target="address"
      >
        {/* 工具栏 */}
        <div className="relative z-10 h-toolbar-pane min-w-0 shrink-0 border-b border-token-border">
          <div
            data-browser-sidebar-toolbar="true"
            className="flex h-full min-w-0 items-center gap-1 px-2 text-token-description-foreground no-drag"
          >
            {/* Back / Next / Reload */}
            <div className="flex items-center gap-px">
              <button
                type="button"
                aria-label="Back"
                disabled={!canBack}
                onClick={() => callView('goBack')}
                className={APP_SHELL_BUTTON_CLASS}
              >
                <ArrowIcon className="icon-xs" />
              </button>
              <button
                type="button"
                aria-label="Next"
                disabled={!canForward}
                onClick={() => callView('goForward')}
                className={APP_SHELL_BUTTON_CLASS}
              >
                <ArrowIcon className="icon-xs -scale-x-100 transform" />
              </button>
              {/* 实测:Codex 这个 Reload 按钮无 aria-label(loading 态应切 Stop,未实现) */}
              <button
                type="button"
                onClick={() => callView('reload')}
                className={APP_SHELL_BUTTON_CLASS}
              >
                <BrowserReloadIcon className="icon-xs" />
              </button>
            </div>

            {/* 地址栏 */}
            <div className="flex min-w-0 flex-1 items-center justify-center px-1 no-drag">
              <div className="relative w-full max-w-[770px]">
                <div className="group/address-bar flex h-[28px] min-w-0 w-full items-center overflow-hidden rounded-[10px] transition-[background-color,box-shadow] duration-basic ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-colors bg-transparent ring-1 ring-inset ring-token-border">
                  {/* 折叠的前导图标槽(Codex 常态 w-0) */}
                  <div className="shrink-0 overflow-hidden transition-none w-0" />
                  <div className="relative h-full min-w-0 flex-1">
                    {/* Codex 没有 form 包装,回车走 input 的 onKeyDown;
                        实测属性只有 dir / data-browser-sidebar-address-input / placeholder / value,不写 type/spellCheck */}
                    <input
                      ref={addressRef}
                      dir="ltr"
                      data-browser-sidebar-address-input="true"
                      placeholder="Enter a URL"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          go(address)
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      className="h-full w-full min-w-0 bg-transparent py-0 text-sm leading-[18px] text-token-input-foreground outline-none select-text placeholder:text-token-input-placeholder-foreground [&::placeholder]:select-none cursor-text ps-2 text-start"
                    />
                  </div>
                  <button
                    type="button"
                    data-browser-sidebar-open-external="true"
                    aria-label="Open in external browser"
                    disabled={url === ''}
                    onClick={() => void window.api.openExternal(address)}
                    className="flex h-[28px] w-7 shrink-0 items-center justify-center rounded-l-none rounded-r-[10px] text-token-description-foreground outline-none transition-[background-color] duration-basic hover:bg-token-list-hover-background disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <OpenExternalIcon className="icon-xs" />
                  </button>
                </div>
              </div>
            </div>

            {/* Annotate / 状态播报 / Browser options */}
            <div className="flex items-center justify-end gap-1.5">
              {/*
               * Annotate:标注能力未实现,按实测的空闲态渲染 —— 容器 opacity-0 整个不可见,
               * 按钮是可展开变体(label "Annotating" 收在 max-w-0 里),disabled。
               */}
              <div className="ease-basic flex origin-right justify-end transition-[width,max-width,opacity,transform] duration-basic motion-reduce:transition-none pointer-events-none max-w-7 overflow-hidden opacity-0">
                <button
                  type="button"
                  aria-label="Annotate"
                  disabled
                  className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed flex rounded-lg text-token-text-tertiary border-transparent h-token-button-composer py-0 text-sm leading-[18px] ease-basic relative isolate min-w-8 overflow-hidden transition-[max-width,padding-inline,background-color,background-size,border-color,color] duration-relaxed [will-change:max-width,background-size] motion-reduce:transition-none disabled:opacity-100 justify-center px-0 !max-w-7 !min-w-7"
                >
                  <span className="flex min-w-0 items-center w-full justify-center">
                    <span className="icon-sm relative shrink-0 transition-transform duration-relaxed ease-basic motion-reduce:transition-none translate-x-0">
                      <AnnotateIcon className="absolute inset-0 size-full" />
                    </span>
                    <span className="ease-basic min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin-inline-start] duration-relaxed motion-reduce:transition-none ms-0 max-w-0 opacity-0">
                      Annotating
                    </span>
                  </span>
                </button>
              </div>
              <span role="status" className="sr-only" />
              <div className="max-w-8 origin-right scale-100 overflow-visible opacity-100 transition-[max-width,opacity,transform] duration-basic ease-basic motion-reduce:transition-none">
                {/* Browser options(Codex `thread.browser.options`;可实现的项全接) */}
                <BrowserOptionsMenu
                  zoomPercent={zoomPercent}
                  pageActionsDisabled={url === ''}
                  onZoomChange={(next) => setTabState({ ...tabState, zoomPercent: next })}
                  onOpenFindInPage={() => setFindOpen(true)}
                  onCaptureScreenshot={() => {
                    const view = viewRef.current as unknown as {
                      capturePage?: () => Promise<{ toDataURL(): string }>
                    } | null
                    void view?.capturePage?.().then((image) => {
                      const host = new URL(url).hostname.replace(/\W+/g, '-') || 'page'
                      void window.codexBridge.browser.saveDataUrl(
                        image.toDataURL(),
                        `screenshot-${host}.png`
                      )
                    })
                  }}
                  onClearData={(kind) => void window.codexBridge.browser.clearData(kind)}
                />
              </div>
            </div>
          </div>
          {/* 加载进度条 */}
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity ${
              loading ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="h-full w-full animate-pulse bg-token-progress-bar-background" />
          </div>
        </div>

        {/* 内容区 */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Find in page:find bar 覆盖在内容区顶部(Codex 的查找条由宿主叠加层渲染,
              DOM 不可取证;此处为同设计语义的推断实现) */}
          {findOpen && url !== '' && (
            <BrowserFindBar viewRef={viewRef} onClose={() => setFindOpen(false)} />
          )}
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            {url === '' ? (
              <div className="flex w-full flex-col items-center justify-center px-4 py-8 text-center absolute inset-0 select-none">
                <div className="flex w-full max-w-72 flex-col items-center gap-3">
                  <div className="flex items-center justify-center [&>svg]:size-8 [&>svg]:text-token-text-secondary">
                    <BrowserGlobeIcon />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-lg leading-6 font-medium text-token-foreground">
                      Start browsing
                    </div>
                    <div className="text-sm text-token-text-secondary">
                      Enter a URL to open a page
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // webview 专有属性经 spread 传入,绕过 react/no-unknown-property;
              // pin 豁免:webview 里的点击不算面板交互(Codex 的页面本来就在独立进程)
              <webview
                ref={viewRef as React.RefObject<HTMLElement>}
                src={url}
                className="h-full w-full"
                {...{
                  [TAB_PREVIEW_PIN_EXEMPT]: 'true',
                  partition: 'persist:browser',
                  webpreferences: 'contextIsolation=yes, nodeIntegration=no'
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
