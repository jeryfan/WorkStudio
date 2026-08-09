import { useOverlay } from '../../state/OverlayContext'
import { HelpIcon, SettingsIcon } from '../icons'

/**
 * .side-footer（1.html 第 314-372 行）：Settings / Help，
 * 点击分别弹出 settings / help 下拉菜单（sider/2.html 第 3197-3413 行）。
 */
export function SidebarFooter(): React.JSX.Element {
  const { openMenu } = useOverlay()

  return (
    <div className="absolute inset-x-0 bottom-0 z-20">
      <div className="relative px-2">
        <div className="absolute inset-x-2 top-0 h-px bg-primary/10" />
        <div className="flex h-[46px] items-center gap-2">
          <button
            type="button"
            aria-label="Open profile menu"
            onClick={(e) =>
              openMenu({ id: 'settings', anchor: e.currentTarget.getBoundingClientRect() })
            }
            className="flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-row px-2 text-left text-sm text-primary hover:bg-hover"
          >
            <SettingsIcon className="size-5 shrink-0" />
            <span>Settings</span>
          </button>
          <button
            type="button"
            aria-label="Open help menu"
            onClick={(e) =>
              openMenu({ id: 'help', anchor: e.currentTarget.getBoundingClientRect() })
            }
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-tertiary hover:bg-hover hover:text-primary"
          >
            <HelpIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
