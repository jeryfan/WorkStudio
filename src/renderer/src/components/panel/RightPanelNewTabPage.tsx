import { motion } from 'framer-motion'
import { useAppShell } from '../../state/AppShellContext'
import { useSidePanelTabActions } from './useSidePanelTabActions'

/**
 * 右面板空态(launcher)—— Codex 的 "new tab page"
 * (i18n 命名空间 thread.sidePanel.newTab.*;bundle 组件在 thread-app-shell-chrome)。
 * 由 RightPanelTabsEmptyState 槽位注入,DOM 逐层实测(2026-08-23):
 *
 *   div.flex.h-full.min-h-0.flex-col.overflow-x-hidden.overflow-y-auto.bg-token-main-surface-primary.p-2.select-none
 *   └ motion.div.flex.w-full.flex-1.flex-col.justify-center        ← stagger 容器
 *     └ div.sticky.top-0.z-10.flex.flex-col.gap-6.bg-token-main-surface-primary
 *       └ ul.mx-auto.flex.w-full.max-w-xl.flex-col.gap-1.px-panel
 *         └ motion.li.w-full > button…(图标 + 标题 + kbd 快捷键)
 *
 * 无任何可用动作时(Codex `thread.sidePanel.newTab.empty`):
 * 一个 bordered 盒子 + "No tabs are available for this chat"。
 */
export function RightPanelNewTabPage(): React.JSX.Element {
  const { rightPanelController } = useAppShell()
  const actions = useSidePanelTabActions(rightPanelController)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-token-main-surface-primary p-2 select-none">
      <motion.div
        className="flex w-full flex-1 flex-col justify-center"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.03 } } }}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-6 bg-token-main-surface-primary">
          {actions.length === 0 ? (
            <div className="mx-auto w-full max-w-xl rounded-lg border border-token-border-default p-3 text-sm text-token-text-secondary">
              No tabs are available for this chat
            </div>
          ) : (
            <ul className="mx-auto flex w-full max-w-xl flex-col gap-1 px-panel">
              {actions.map((action) => (
                <motion.li
                  key={action.id}
                  className="w-full"
                  variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}
                  transition={{ type: 'spring', duration: 0.5, bounce: 0.1 }}
                >
                  <button
                    type="button"
                    onClick={action.onSelect}
                    className="cursor-interaction flex min-h-10 w-full items-center gap-2 rounded-md bg-token-bg-fog px-2.5 py-2 text-start hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-2"
                  >
                    <span className="icon-xs flex shrink-0 items-center justify-center text-token-text-secondary">
                      <action.Icon className="icon-xs" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-normal text-token-text-primary">
                      {action.title}
                    </span>
                    {action.keyboardShortcut != null && (
                      <span className="ms-auto shrink-0 ps-2 text-token-text-secondary">
                        <kbd className="inline-flex !rounded-md !border-0 !bg-current/10 !font-sans !text-xs !text-current !shadow-none !px-1.5 !py-0.5 !leading-none">
                          {action.keyboardShortcut}
                        </kbd>
                      </span>
                    )}
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  )
}
