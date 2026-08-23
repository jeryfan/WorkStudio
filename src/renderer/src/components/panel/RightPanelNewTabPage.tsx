import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { useAppShell } from '../../state/AppShellContext'
import { useSidePanelTabActions } from './useSidePanelTabActions'

/**
 * 右面板空态(launcher)—— Codex 的 "new tab page"
 * (i18n 命名空间 thread.sidePanel.newTab.*;bundle 组件 = thread-app-shell-chrome 的 `hr`)。
 * 由 RightPanelTabsEmptyState 槽位注入,DOM 逐层实测(2026-08-23):
 *
 *   div.flex.h-full.min-h-0.flex-col.overflow-x-hidden.overflow-y-auto.bg-token-main-surface-primary.p-2.select-none
 *   └ motion.div.flex.w-full.flex-1.flex-col.justify-center        ← 容器 variants xr
 *     └ div.sticky.top-0.z-10.flex.flex-col.gap-6.bg-token-main-surface-primary
 *       └ motion.ul.mx-auto.flex.w-full.max-w-xl.flex-col.gap-1.px-panel   ← variants Sr
 *         └ motion.li.w-full(variants Cr)> button…(图标 + 标题 + kbd 快捷键)
 *
 * 动画(bundle `xr`/`Sr`/`Cr`,ease 统一 `Te.ease` = [0.19, 1, 0.22,1]):
 * 容器 y:-8→0 / 0.09s(beforeChildren),ul staggerChildren 0.016 + delayChildren 0.012,
 * li y:-6→0 / 0.075s;关闭态容器 0.06s(afterChildren)、li 0.045s、ul 反向 stagger 0.008。
 * 容器 `initial={false}`(挂载不播入场);reduced-motion(`Ym`)时 variants/animate 全撤。
 *
 * 无任何可用动作时(Codex `thread.sidePanel.newTab.empty`):
 * 一个 bordered 盒子 + "No tabs are available for this chat"。
 * (Codex 还有 Suggested artifacts 区 —— 需要 output artifacts 数据源,未实现。)
 */

/** Codex `Te.ease`(bundle `Qj`,207010) */
const EASE = [0.19, 1, 0.22, 1] as const

/** Codex `xr` —— 容器 */
const containerVariants: Variants = {
  closed: { opacity: 0, y: -8, transition: { duration: 0.06, ease: EASE, when: 'afterChildren' } },
  open: { opacity: 1, y: 0, transition: { duration: 0.09, ease: EASE, when: 'beforeChildren' } }
}

/** Codex `Sr` —— ul */
const listVariants: Variants = {
  closed: { transition: { staggerChildren: 0.008, staggerDirection: -1 } },
  open: { transition: { delayChildren: 0.012, staggerChildren: 0.016 } }
}

/** Codex `Cr` —— li */
const itemVariants: Variants = {
  closed: { opacity: 0, y: -6, transition: { duration: 0.045, ease: EASE } },
  open: { opacity: 1, y: 0, transition: { duration: 0.075, ease: EASE } }
}

export function RightPanelNewTabPage(): React.JSX.Element {
  const { rightPanelController } = useAppShell()
  const actions = useSidePanelTabActions(rightPanelController)
  // Codex `mn` = Ym:reduced-motion 时 variants/animate 传 undefined,动画全禁
  const reducedMotion = useReducedMotion() === true

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-token-main-surface-primary p-2 select-none">
      <motion.div
        className="flex w-full flex-1 flex-col justify-center"
        initial={false}
        animate={reducedMotion ? undefined : 'open'}
        variants={reducedMotion ? undefined : containerVariants}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-6 bg-token-main-surface-primary">
          {actions.length === 0 ? (
            <div className="mx-auto w-full max-w-xl rounded-lg border border-token-border-default p-3 text-sm text-token-text-secondary">
              No tabs are available for this chat
            </div>
          ) : (
            <motion.ul
              className="mx-auto flex w-full max-w-xl flex-col gap-1 px-panel"
              variants={reducedMotion ? undefined : listVariants}
            >
              {actions.map((action) => (
                <motion.li
                  key={action.id}
                  className="w-full"
                  variants={reducedMotion ? undefined : itemVariants}
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
            </motion.ul>
          )}
        </div>
      </motion.div>
    </div>
  )
}
