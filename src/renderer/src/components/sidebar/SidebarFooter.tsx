import { useOverlay } from '../../state/OverlayContext'
import { HelpIcon, SettingsIcon } from '../icons'

/**
 * 侧栏底栏 —— 层级与类名逐字对齐 Codex 实测值。
 *
 * Codex 的形态(定位层由 Sidebar 给,这里从它的第一个子元素开始):
 *
 *   div.relative.z-20.[&>*>*]:px-row-x.[&>*>*]:pb-2      ← 上方插槽(常空)
 *   div.[container-type:inline-size].relative.w-full.shrink-0
 *     div…h-[0.5px].bg-token-foreground/10               ← 发丝线
 *     div.flex.h-toolbar.items-center.gap-2.px-row-x.browser:h-16
 *       div.min-w-0.flex-1
 *         div.flex.min-w-0.flex-1.items-center.gap-0.sidebar-item   ← sidebar-item 在**这层**
 *           button…h-[var(--height-token-row)]…sidebar-item
 *
 * 几个反直觉但必须照做的点:
 *
 * 1. **上方插槽是独立兄弟**,不是包装层。它的 padding 用 [&>*>*] 推给孙子,
 *    自己不吃 —— 插进来的横幅才能自己控制左右留白。之前把它写成
 *    `div.pointer-events-none > div.…` 的嵌套,插槽就没了。
 * 2. 行高用 `h-toolbar`(46px),不是 h-[46px] —— 和 header、aside 的
 *    padding-top 共用同一个 token,改窗口尺寸时不会各走各的。
 * 3. `px-row-x` 在这一行上,漏了横向内边距就归零。
 * 4. 发丝线用 `bg-token-foreground/10`,不是 token-text-primary/10
 *    (后者 Codex 全站不用),并且带 aria-hidden。
 * 5. 主按钮显示的是**账户名**,不是 "Settings" —— Settings 在它的下拉菜单里。
 * 6. 图标是 icon-xs(16px)/ icon-sm(18px),不是 size-5(20px)。
 *
 * 不加底色:Codex 的 footer 两层实测都是 rgba(0,0,0,0) 且没有 backdrop-filter,
 * 靠滚动区的 codex-headerFadeMask 把内容淡出来避免相撞,而不是用不透明底色遮挡。
 */
export function SidebarFooter({
  accountName = 'deepseek'
}: {
  accountName?: string
}): React.JSX.Element {
  const { openMenu } = useOverlay()

  return (
    <>
      {/* 上方插槽 —— Codex 常态为空(升级提示 / 用量告警会插到这里) */}
      <div className="relative z-20 [&>*>*]:px-row-x [&>*>*]:pb-2" />
      <div className="[container-type:inline-size] relative w-full shrink-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[0.5px] bg-token-foreground/10"
        />
        <div className="flex h-toolbar items-center gap-2 px-row-x browser:h-16">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-1 items-center gap-0 sidebar-item">
              <button
                type="button"
                aria-label="Open profile menu"
                onClick={(e) =>
                  openMenu({ id: 'settings', anchor: e.currentTarget.getBoundingClientRect() })
                }
                className="outline-hidden cursor-interaction flex h-[var(--height-token-row)] min-w-0 flex-1 cursor-interaction items-center gap-2 sidebar-item px-[var(--padding-row-cell-x,var(--padding-row-x))] text-start text-base text-token-foreground outline-none hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-token-border browser:h-12 browser:gap-3"
              >
                <SettingsIcon className="icon-xs shrink-0" />
                <span className="min-w-0 flex-1 truncate">{accountName}</span>
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Open help menu"
            onClick={(e) =>
              openMenu({ id: 'help', anchor: e.currentTarget.getBoundingClientRect() })
            }
            className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent electron:p-1 flex items-center justify-center p-0.5 aspect-square shrink-0 items-center justify-center !px-0 outline-hidden cursor-interaction size-8 shrink-0"
          >
            <HelpIcon className="icon-sm" />
          </button>
        </div>
      </div>
    </>
  )
}
