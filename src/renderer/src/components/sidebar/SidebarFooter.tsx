import { useOverlay } from '../../state/OverlayContext'
import { HelpIcon, SettingsIcon } from '../icons'

/**
 * .side-footer（1.html 第 314-372 行）：Settings / Help，
 * 点击分别弹出 settings / help 下拉菜单（sider/2.html 第 3197-3413 行）。
 *
 * 浮在滚动区之上，因此必须自带不透明底色——否则会话列表会从按钮背后透出来，
 * 文字叠在一起。上方再加一段渐变，让内容是淡出而不是被硬边切断。
 */
export function SidebarFooter(): React.JSX.Element {
  const { openMenu } = useOverlay()

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
      {/* 渐变过渡带：高度略大于底栏，内容滚到这里开始淡出 */}
      <div className="pointer-events-none h-6 bg-gradient-to-t from-app to-transparent" />
      <div className="pointer-events-auto bg-app">
        <div className="relative px-2">
          <div className="absolute inset-x-0 top-0 h-[0.5px] bg-primary/10" />
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
    </div>
  )
}
