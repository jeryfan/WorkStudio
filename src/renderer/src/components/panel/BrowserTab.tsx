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
import { BrowserOptionsMenu } from './BrowserOptionsMenu'
import { BrowserFindBar } from './BrowserFindBar'
import { hostServices } from '../../host/appHost'
import { postMessageFromView } from '../../host/hostMessages'
import { ensureBrowserSurface, setBrowserSurfaceRect } from '../../host/browserSurfaces'
import { browserConversationId } from '../../host/browserScope'
import { useBrowserTabState } from '../../host/useBrowserSidebarState'
import type { BrowserPageCommand } from '@shared/host/messages'

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
  const conversationId = browserConversationId()

  /*
   * 状态的唯一来源是宿主（Codex 同构）。
   *
   * url/title/loading/canGoBack/canGoForward/zoomPercent 全部来自
   * `browser-sidebar-state`：真值在 guest 进程，而 browser_use 从 agent 侧
   * 驱动页面时渲染层不在链路上，自己维护一份必然对不上。
   *
   * `tabState.url` 只剩一个用途：决定这个 tab 是"空态"还是"要挂 webview"，
   * 并在面板重新挂载时把上次的地址交还宿主。
   */
  const hostState = useBrowserTabState(conversationId, tabId)
  const mountedUrl = tabState.url !== '' ? tabState.url : normalizeUrl(initialUrl) || ''
  const url = hostState?.url != null && hostState.url !== '' ? hostState.url : mountedUrl
  const canBack = hostState?.canGoBack === true
  const canForward = hostState?.canGoForward === true
  const loading = hostState?.isLoading === true
  const zoomPercent = hostState?.zoomPercent ?? tabState.zoomPercent
  const browserUseActive = hostState?.browserUseActive === true

  /*
   * 地址栏是"受控但可被用户接管"的：没在编辑时显示宿主的真实 URL，
   * 一旦用户开始输入就显示草稿，直到导航或放弃。
   *
   * 用 `null` 表示"没在编辑"而不是用 effect 把 url 同步进 state ——
   * 后者是 setState-in-effect，会多一次渲染，而且宿主 URL 与草稿谁覆盖谁
   * 取决于两个 effect 的先后，很容易写出"刚打的字被冲掉"。
   */
  const [addressDraft, setAddressDraft] = useState<string | null>(null)
  const address = addressDraft ?? url
  const [findOpen, setFindOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const addressRef = useRef<HTMLInputElement | null>(null)

  /** 页面命令统一走宿主（Codex `browser-sidebar-command`） */
  const runPageCommand = (command: BrowserPageCommand): void => {
    postMessageFromView({
      type: 'browser-sidebar-command',
      conversationId,
      browserTabId: tabId,
      command
    })
  }

  // tab 标题跟随宿主上报的网页标题（Codex 实测行为）
  useEffect(() => {
    const title = hostState?.title
    if (title != null && title !== '') rightPanelController.updateTab(tabId, { title })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- controller 身份稳定
  }, [hostState?.title, tabId])

  // 宿主状态回写 tabState.url，面板重新挂载后能把地址交还宿主
  useEffect(() => {
    if (hostState?.url != null && hostState.url !== '' && hostState.url !== tabState.url) {
      setTabState({ ...tabState, url: hostState.url })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟宿主 url 变化
  }, [hostState?.url])

  /*
   * 登记这个 tab 的页面（幂等）。
   *
   * 页面由 BrowserSurfaceLayer 持有，生命周期比本组件长：切 tab、关面板、
   * 切会话都不该销毁它 —— browser_use 可能正在驱动它。只有 tab 真的被关掉
   * 才 removeBrowserSurface（见 onClose）。
   */
  useEffect(() => {
    ensureBrowserSurface(conversationId, tabId)
  }, [conversationId, tabId])

  /*
   * 把锚点矩形持续报给持久层。
   *
   * 面板尺寸会随拖分栏、窗口 resize、tab 条变化而改变，只在挂载时量一次
   * 会让 webview 停在旧位置上。
   */
  useEffect(() => {
    const anchor = anchorRef.current
    if (anchor == null) {
      setBrowserSurfaceRect(conversationId, tabId, null)
      return
    }
    const report = (): void => {
      const rect = anchor.getBoundingClientRect()
      setBrowserSurfaceRect(conversationId, tabId, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(anchor)
    window.addEventListener('resize', report)
    // 布局动画也会挪锚点；低频轮询比监听所有可能的来源便宜
    const interval = window.setInterval(report, 250)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      window.clearInterval(interval)
      // 面板卸载：webview 交回停靠位，但**不销毁**页面
      setBrowserSurfaceRect(conversationId, tabId, null)
    }
  }, [conversationId, tabId, url])

  // 新 tab 自动聚焦地址栏(data-browser-sidebar-primary-focus-target="address",实测)
  useEffect(() => {
    if (url === '') addressRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时
  }, [])

  const go = (input: string): void => {
    const next = normalizeUrl(input)
    if (!next) return
    // 交回宿主：之后地址栏跟随真实 URL（可能被规范化成带斜杠的形式）
    setAddressDraft(null)
    // webview 尚未挂载时这条命令会被宿主记进状态，挂载后由宿主发起首次导航
    setTabState({ ...tabState, url: next })
    runPageCommand({ type: 'navigate', url: next })
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
                disabled={!canBack || browserUseActive}
                onClick={() => runPageCommand({ type: 'go-back' })}
                className={APP_SHELL_BUTTON_CLASS}
              >
                <ArrowIcon className="icon-xs" />
              </button>
              <button
                type="button"
                aria-label="Next"
                disabled={!canForward || browserUseActive}
                onClick={() => runPageCommand({ type: 'go-forward' })}
                className={APP_SHELL_BUTTON_CLASS}
              >
                <ArrowIcon className="icon-xs -scale-x-100 transform" />
              </button>
              {/* 实测:Codex 这个 Reload 按钮无 aria-label(loading 态应切 Stop,未实现) */}
              <button
                type="button"
                disabled={browserUseActive}
                onClick={() => runPageCommand({ type: 'reload' })}
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
                      /*
                       * browser_use 接管期间让出输入：agent 正在导航时用户改地址栏
                       * 只会和 agent 抢同一个页面。Codex 的接管态同样锁掉工具栏。
                       */
                      readOnly={browserUseActive}
                      onChange={(e) => {
                        setAddressDraft(e.target.value)
                      }}
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
                    onClick={() => void hostServices?.chromiumBrowser.openUrl(address)}
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
                    /*
                     * 截图由宿主经 CDP 完成（Page.captureScreenshot），不是
                     * webview.capturePage()：后者拍的是合成后的可见区域，
                     * 面板被遮住或滚出视口时会拿到空白图。
                     */
                    void hostServices?.browserSidebar.captureScreenshotToFile({
                      conversationId: browserConversationId(),
                      browserTabId: tabId
                    })
                  }}
                  onClearData={(kind) =>
                    void hostServices?.browserSidebar.clearBrowsingData([kind])
                  }
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
            <BrowserFindBar
              conversationId={conversationId}
              browserTabId={tabId}
              runPageCommand={runPageCommand}
              onClose={() => setFindOpen(false)}
            />
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
              /*
               * 这里只放一个**锚点**：真正的 `<webview>` 住在 BrowserSurfaceLayer
               * 里（全程挂载），按这个矩形盖上来。原因是 webview 一旦从 DOM 摘下
               * guest 就销毁，而页面必须活过面板。
               */
              <div ref={anchorRef} data-browser-surface-anchor="true" className="h-full w-full" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
