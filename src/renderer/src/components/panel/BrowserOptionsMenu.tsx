import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { DotsIcon } from '../icons'
import { ZoomInIcon, ZoomOutIcon, ZoomResetIcon } from '../icons/extracted/ZoomIcons'
import { APP_SHELL_BUTTON_CLASS } from './appShellButtonClass'

/**
 * Browser options 菜单 —— Codex `thread.browser.options`(app-initial:447820)。
 *
 * 实测项序(新 tab 态):
 *   Find in page(无 URL 时 disabled)
 *   ─
 *   Zoom 组:[Zoom | (− 100% +) | Reset](Reset 在 100% 时 disabled)
 *   ─
 *   Show device toolbar
 *   Take a screenshot
 *   ─
 *   Import cookies and passwords…
 *   Passwords and autofill ▸(Password manager / Contact info)
 *   Downloads
 *   Clear browsing data ▸(Clear cookies / Clear cache)
 *   ─
 *   Browser settings
 *
 * WS 落地差异(webview ≠ Codex 受控浏览器;逐项标注):
 * - Find in page / Zoom / Screenshot / Clear cookies·cache:真实现(webview +
 *   persist:browser 分区 session)。
 * - Device toolbar / Import cookies / Passwords / Downloads / Browser settings:
 *   Codex 里是受控浏览器特性或设置页导航,WS 无对应物 —— **渲染但 disabled**
 *   (标注,不做假实现)。
 * - Print:Codex 本构建未显示(isPrintMenuItemVisible=false,实测菜单无此项),不渲染。
 */

/** Chromium 缩放档位(与 Codex 受控浏览器同源) */
const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500]

function stepZoom(current: number, delta: 1 | -1): number {
  const index = ZOOM_STEPS.findIndex((z) => z >= current)
  const at = index === -1 ? ZOOM_STEPS.length - 1 : index
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + delta))]
}

const MENU_ITEM_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex items-center disabled:opacity-40 disabled:cursor-not-allowed'
const SEPARATOR_CLASS = 'mx-1 my-1 border-t border-token-border/60'
const SUB_TRIGGER_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground hover:bg-token-list-hover-background focus:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background cursor-interaction flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed'
const SUB_CONTENT_CLASS =
  'no-drag z-50 m-px flex min-w-[180px] select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background/90 px-1 py-1 text-token-foreground ring-[0.5px] ring-token-border shadow-xl-spread backdrop-blur-sm'

export function BrowserOptionsMenu({
  zoomPercent,
  pageActionsDisabled,
  onZoomChange,
  onOpenFindInPage,
  onCaptureScreenshot,
  onClearData
}: {
  /** 当前缩放百分比(100 = 100%) */
  zoomPercent: number
  /** 无页面加载时 Find/Zoom 等不可用(Codex `pageActionsDisabled`) */
  pageActionsDisabled: boolean
  onZoomChange(nextPercent: number): void
  onOpenFindInPage(): void
  onCaptureScreenshot(): void
  onClearData(kind: 'cookies' | 'cache'): void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const atHundred = zoomPercent === 100

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Browser options"
          data-browser-sidebar-skip-address-commit="true"
          title="Browser options"
          className={`${APP_SHELL_BUTTON_CLASS} outline-hidden cursor-interaction`}
        >
          <DotsIcon className="icon-xs rotate-90" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="no-drag z-50 m-px flex w-[280px] select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background/90 px-1 py-1 text-token-foreground ring-[0.5px] ring-token-border shadow-xl-spread backdrop-blur-sm"
          style={{
            maxWidth: 'min(var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))',
            maxHeight:
              'min(var(--radix-dropdown-menu-content-available-height), calc(100vh - 16px))'
          }}
        >
          <DropdownMenu.Item
            className={MENU_ITEM_CLASS}
            disabled={pageActionsDisabled}
            onSelect={() => onOpenFindInPage()}
          >
            Find in page
          </DropdownMenu.Item>
          <div className={SEPARATOR_CLASS} role="separator" />
          {/* Zoom 组(Codex 实测 DOM:label + −/percent/+ 组 + Reset) */}
          <div
            role="group"
            aria-label="Zoom"
            className="flex items-center gap-1 rounded-lg px-[var(--padding-row-x)] py-0.5 text-sm"
            // 菜单选型选择会关菜单;zoom 是连续操作,拦住
            onClick={(e) => e.preventDefault()}
          >
            <span className="min-w-0 flex-1 truncate">Zoom</span>
            <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-token-border bg-token-foreground/5 text-xs">
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={pageActionsDisabled}
                className="flex h-6 w-6 cursor-interaction items-center justify-center text-token-description-foreground outline-none hover:bg-token-list-hover-background focus:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(e) => {
                  e.preventDefault()
                  onZoomChange(stepZoom(zoomPercent, -1))
                }}
              >
                <ZoomOutIcon className="icon-xs" />
              </button>
              <div className="w-11 border-x border-token-border py-0.5 text-center tabular-nums">
                {zoomPercent}%
              </div>
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={pageActionsDisabled}
                className="flex h-6 w-6 cursor-interaction items-center justify-center text-token-description-foreground outline-none hover:bg-token-list-hover-background focus:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(e) => {
                  e.preventDefault()
                  onZoomChange(stepZoom(zoomPercent, 1))
                }}
              >
                <ZoomInIcon className="icon-xs" />
              </button>
            </div>
            <button
              type="button"
              aria-label="Reset"
              title="Reset"
              disabled={pageActionsDisabled || atHundred}
              className="flex h-6 w-6 shrink-0 cursor-interaction items-center justify-center rounded-md text-token-description-foreground outline-none hover:bg-token-list-hover-background focus:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40"
              onClick={(e) => {
                e.preventDefault()
                onZoomChange(100)
              }}
            >
              <ZoomResetIcon className="icon-xs" />
            </button>
          </div>
          <div className={SEPARATOR_CLASS} role="separator" />
          {/* Codex 受控浏览器特性,webview 无设备工具栏能力 —— 渲染但 disabled */}
          <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled>
            Show device toolbar
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={MENU_ITEM_CLASS}
            disabled={pageActionsDisabled}
            onSelect={() => onCaptureScreenshot()}
          >
            Take a screenshot
          </DropdownMenu.Item>
          <div className={SEPARATOR_CLASS} role="separator" />
          {/* 以下三项是 Codex 设置页/资料库导航,WS 无对应物 —— 渲染但 disabled */}
          <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled>
            Import cookies and passwords…
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={SUB_TRIGGER_CLASS} disabled>
              <span>Passwords and autofill</span>
              <span className="icon-2xs text-token-description-foreground">›</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={SUB_CONTENT_CLASS}>
                <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled>
                  Password manager
                </DropdownMenu.Item>
                <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled>
                  Contact info
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled>
            Downloads
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={SUB_TRIGGER_CLASS}>
              <span>Clear browsing data</span>
              <span className="icon-2xs text-token-description-foreground">›</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={SUB_CONTENT_CLASS}>
                <DropdownMenu.Item
                  className={MENU_ITEM_CLASS}
                  onSelect={() => onClearData('cookies')}
                >
                  Clear cookies
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={MENU_ITEM_CLASS}
                  onSelect={() => onClearData('cache')}
                >
                  Clear cache
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <div className={SEPARATOR_CLASS} role="separator" />
          <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled>
            Browser settings
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
