import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAppShell } from '../../state/AppShellContext'
import { PlusIcon } from '../icons'
import { APP_SHELL_BUTTON_CLASS } from './appShellButtonClass'
import { useSidePanelTabActions } from './useSidePanelTabActions'

/**
 * strip 尾部 sticky 区的「+」菜单(Codex aria-label "Open side panel tab")。
 * 内容与 launcher 空态是同一组 actions;Radix DropdownMenu(Codex 菜单就是 Radix,
 * portal / role=menu / data-state 这些 DOM 特征由 Radix 给出)。
 *
 * 实测:**没有 tab 时这个按钮不渲染**(sticky 区只剩空的 w-max 容器)。
 * 菜单卡片实测类:no-drag z-50 m-px … rounded-xl ring-[0.5px] shadow-xl-spread
 * backdrop-blur-sm w-[280px];menuitem 为 rounded-lg px-[var(--padding-row-x)]
 * py-[var(--padding-row-y)] text-sm。
 */
export function OpenSidePanelTabMenu(): React.JSX.Element | null {
  const { rightPanelController } = useAppShell()
  const actions = useSidePanelTabActions(rightPanelController)

  if (rightPanelController.tabs.length === 0) return null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="Open side panel tab" className={APP_SHELL_BUTTON_CLASS}>
          <PlusIcon className="icon-xs" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
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
              onSelect={action.onSelect}
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
