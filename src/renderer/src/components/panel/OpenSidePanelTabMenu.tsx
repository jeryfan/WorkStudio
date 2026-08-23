import { useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAppShell } from '../../state/AppShellContext'
import type { AppShellTabPanelController } from '../../state/AppShellContext'
import { PlusIcon } from '../icons'
import { APP_SHELL_BUTTON_CLASS } from './appShellButtonClass'
import { useSidePanelTabActions } from './useSidePanelTabActions'

/**
 * strip 尾部 sticky 区的「+」菜单(Codex `Or`;aria/title 按 target 取
 * "Open side panel tab" / "Open bottom panel tab" —— i18n id
 * thread.sidePanel.openTab / thread.bottomPanel.openTab)。
 * 内容与 launcher 空态是同一组 actions(Codex 同一个 `In` hook)。
 *
 * 实测细节:
 * - **右面板没有 tab 时按钮不渲染**(`if (n === 'right' && u === 0) return null`;
 *   底部面板无此限制)。
 * - trigger 用 **title 属性**(不是 aria-label);类 = 共享按钮基类 +
 *   `outline-hidden cursor-interaction data-[state=open]:!bg-token-foreground/5
 *   data-[state=open]:!text-token-foreground`(菜单开着时 trigger 保持高亮)。
 * - `deferSelectionUntilDropdownClose` 的 action(open-file/browser):
 *   选中时先存起来,菜单 onCloseAutoFocus 才执行(Codex `f`/`h` 两个闭包)。
 * - 菜单卡片实测类:no-drag z-50 m-px … bg-token-dropdown-background/90
 *   rounded-xl ring-[0.5px] shadow-xl-spread backdrop-blur-sm w-[280px];
 *   align=start(Codex `D` 的 props)。
 */
export function OpenSidePanelTabMenu({
  target
}: {
  target: 'right' | 'bottom'
}): React.JSX.Element | null {
  const { rightPanelController, bottomPanelController } = useAppShell()
  const controller: AppShellTabPanelController =
    target === 'right' ? rightPanelController : bottomPanelController
  const actions = useSidePanelTabActions(controller)
  /** defer 标记的 action 暂存(Codex `d.current`) */
  const deferredRef = useRef<(() => void) | null>(null)

  if (target === 'right' && controller.tabs.length === 0) return null

  const title = target === 'right' ? 'Open side panel tab' : 'Open bottom panel tab'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title={title}
          className={`${APP_SHELL_BUTTON_CLASS} outline-hidden cursor-interaction data-[state=open]:!bg-token-foreground/5 data-[state=open]:!text-token-foreground`}
        >
          <PlusIcon className="icon-xs" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          onCloseAutoFocus={(e) => {
            // Codex:菜单关完再跑 defer 的 action(preventDefault 拦住默认聚焦回 trigger)
            const deferred = deferredRef.current
            if (deferred != null) {
              deferredRef.current = null
              e.preventDefault()
              deferred()
            }
          }}
          className="no-drag z-50 m-px flex select-none flex-col overflow-y-auto px-1 py-1 bg-token-dropdown-background/90 text-token-foreground ring-token-border rounded-xl ring-[0.5px] shadow-xl-spread backdrop-blur-sm w-[280px]"
          style={{
            maxWidth: 'min(var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))',
            maxHeight:
              'min(var(--radix-dropdown-menu-content-available-height), calc(100vh - 16px))'
          }}
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.id}
              onSelect={() => {
                if (action.deferSelectionUntilDropdownClose === true) {
                  deferredRef.current = action.onSelect
                  return
                }
                action.onSelect()
              }}
              className="no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col"
            >
              <div className="flex w-full items-center gap-1.5">
                <action.Icon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
                <span className="flex-1 min-w-0 truncate">{action.title}</span>
                {action.keyboardShortcut != null && (
                  <span className="ms-2 shrink-0 text-xs text-token-description-foreground">
                    {action.keyboardShortcut}
                  </span>
                )}
              </div>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
