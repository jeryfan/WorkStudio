import {
  ChangelogIcon,
  ChromeIcon,
  HelpIcon,
  HelpLifeRingIcon,
  KeyboardIcon,
  PetIcon,
  SettingsIcon
} from '../icons'
import { useAppShell } from '../../state/AppShellContext'
import { runCommand } from '../../state/commands'
import {
  CodexMenu,
  CodexMenuItem,
  CodexMenuSeparator,
  type CodexMenuItemDef
} from '../menu/CodexMenu'

/**
 * 侧栏底栏 —— 层级与类名逐字对齐 Codex 实测值。
 *
 * Codex 的形态(定位层由 LeftPanel 给,这里从它的第一个子元素开始):
 *
 *   div.relative.z-20.[&>*>*]:px-row-x.[&>*>*]:pb-2      ← 上方插槽(常空)
 *   div.[container-type:inline-size].relative.w-full.shrink-0
 *     div…h-[0.5px].bg-token-foreground/10               ← 发丝线
 *     div.flex.h-toolbar.items-center.gap-2.px-row-x.browser:h-16
 *       div.min-w-0.flex-1
 *         div.flex.min-w-0.flex-1.items-center.gap-0.sidebar-item   ← sidebar-item 在**这层**
 *           button…h-[var(--height-token-row)]…sidebar-item
 *
 * 菜单全是 **Radix DropdownMenu**(Codex 原生就是:触发器上的
 * aria-haspopup/aria-expanded/data-state 由 Radix 自动同步):
 * - profile 菜单:**向上开**(side=top),宽度 = 内联 style
 *   `calc(<侧栏宽>px - 2 * var(--padding-row-cell-x, var(--padding-row-x)))` ——
 *   跟着侧栏宽度走,不是固定值。内容:账户名(禁用项)/ 分隔线 / Show pet /
 *   Settings ⌘,。注意:**没有 Log out**,账户项就是纯文本。
 * - help 菜单:同样向上开,`w-50`。内容:What's new 标签 + Full changelog +
 *   分隔线 + Set up Chrome extension / Keyboard shortcuts / Help。
 *   (Codex 还会异步拉取更新日志条目插在 What's new 下面 —— 那是远端数据,
 *   WS 没有对应数据源,不伪造。)
 *
 * 链接打开走 `window.open` —— Electron 主进程的 setWindowOpenHandler 会转成
 * `shell.openExternal`(与 Codex 的 open_in_browser_bridge 同效)。
 *
 * 不加底色:Codex 的 footer 两层实测都是 rgba(0,0,0,0) 且没有 backdrop-filter,
 * 靠滚动区的 codex-headerFadeMask 把内容淡出来避免相撞,而不是用不透明底色遮挡。
 */
export function SidebarFooter({
  accountName = 'deepseek'
}: {
  accountName?: string
}): React.JSX.Element {
  const { sidebarWidth } = useAppShell()
  const iconCls = 'icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100'

  const profileItems: CodexMenuItemDef[] = [
    { id: 'account', label: accountName, disabled: true },
    { id: 'show-pet', label: 'Show pet', icon: <PetIcon className={iconCls} /> },
    {
      id: 'settings',
      label: 'Settings',
      icon: <SettingsIcon className={iconCls} />,
      shortcut: '⌘,',
      onSelect: () => runCommand('settings')
    }
  ]
  const helpItems: CodexMenuItemDef[] = [
    {
      id: 'changelog',
      label: 'Full changelog',
      icon: <ChangelogIcon className={iconCls} />,
      onSelect: () => window.open('https://developers.openai.com/codex/changelog')
    },
    {
      id: 'chrome-ext',
      label: 'Set up Chrome extension',
      icon: <ChromeIcon className={iconCls} />,
      onSelect: () =>
        window.open(
          'https://chromewebstore.google.com/detail/codex/lfkehkpjohcoelkpembgemeipeppanef'
        )
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: <KeyboardIcon className={iconCls} />
      /* Codex 会弹出快捷键总览层 —— WS 还没有这个浮层,行为待落地 */
    },
    {
      id: 'help',
      label: 'Help',
      icon: <HelpLifeRingIcon className={iconCls} />,
      onSelect: () => window.open('https://learn.chatgpt.com/docs/quickstart')
    }
  ]

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
              <CodexMenu
                side="top"
                contentStyle={{
                  width: `calc(${sidebarWidth}px - 2 * var(--padding-row-cell-x, var(--padding-row-x)))`
                }}
                trigger={
                  <button
                    type="button"
                    aria-label="Open profile menu"
                    className="outline-hidden cursor-interaction flex h-[var(--height-token-row)] min-w-0 flex-1 cursor-interaction items-center gap-2 sidebar-item px-[var(--padding-row-cell-x,var(--padding-row-x))] text-start text-base text-token-foreground outline-none hover:bg-token-list-hover-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-token-border browser:h-12 browser:gap-3"
                  >
                    <SettingsIcon className="icon-xs shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{accountName}</span>
                  </button>
                }
              >
                {/* Codex 实测:内容外面还套一层 div.flex.w-full.min-w-0.flex-col */}
                <div className="flex w-full min-w-0 flex-col">
                  <CodexMenuItem item={profileItems[0]} />
                  <CodexMenuSeparator />
                  <CodexMenuItem item={profileItems[1]} />
                  <CodexMenuItem item={profileItems[2]} />
                </div>
              </CodexMenu>
            </div>
          </div>
          <CodexMenu
            side="top"
            contentClassName="w-50"
            trigger={
              <button
                type="button"
                aria-label="Open help menu"
                className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent electron:p-1 flex items-center justify-center p-0.5 aspect-square shrink-0 items-center justify-center !px-0 outline-hidden cursor-interaction size-8 shrink-0"
              >
                <HelpIcon className="icon-sm" />
              </button>
            }
          >
            <div className="px-[var(--padding-row-x)] py-1 text-sm text-token-description-foreground">
              What&apos;s new
            </div>
            <CodexMenuItem item={helpItems[0]} />
            <CodexMenuSeparator />
            <CodexMenuItem item={helpItems[1]} />
            <CodexMenuItem item={helpItems[2]} />
            <CodexMenuItem item={helpItems[3]} />
          </CodexMenu>
        </div>
      </div>
    </>
  )
}
