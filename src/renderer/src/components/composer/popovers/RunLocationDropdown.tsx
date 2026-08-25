import {
  MenuCheckIcon,
  RunlocConnectExternalIcon,
  RunlocConnectIcon,
  RunlocLocalIcon,
  RunlocSendCloudIcon
} from '../../icons'
import { hostServices } from '../../../host/appHost'

/** Codex 菜单项基类(与运行时逐项一致) */
const MENU_ITEM_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col'

/**
 * 运行位置下拉(Codex `local-remote-dropdown`,运行时实测):
 *
 *   div[role=menu]
 *   └ div.flex.max-w-78.flex-col.w-52
 *     ├ div[header] "Work in"
 *     ├ menuitem: [Local 图标] + Local + [check]        ← 当前(唯一)运行位置
 *     ├ menuitem: New worktree                          ← 未实现(worktree 流程缺失,见 docs)
 *     ├ a[role=menuitem]: Connect Codex web + [外链图标] → chatgpt.com/codex/cloud
 *     └ menuitem[aria-disabled]: Send to cloud          ← 无云连接,禁用(Codex 实测同)
 *
 * 触发按钮是 utility bar 的 "Local"(home 宽处 "Work locally")。
 */
export function RunLocationDropdown(): React.JSX.Element {
  return (
    <div className="flex max-w-78 flex-col w-52">
      <div className="text-token-description-foreground flex min-h-6 items-center truncate px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm leading-4">
        Work in
      </div>
      <div role="menuitem" data-state="closed" tabIndex={-1} className={MENU_ITEM_CLASS}>
        <div className="flex w-full items-center gap-1.5">
          <span className="inline-flex items-center justify-center leading-none icon-sm shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100">
            <RunlocLocalIcon className="icon-xs" />
          </span>
          <span className="flex-1 min-w-0 truncate">Local</span>
          <MenuCheckIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
        </div>
      </div>
      {/* Codex 第二项是 "New worktree" —— worktree 流程未接入,暂不渲染(docs 标记) */}
      <a
        role="menuitem"
        tabIndex={-1}
        href="https://chatgpt.com/codex/cloud"
        onClick={(e) => {
          e.preventDefault()
          void hostServices?.chromiumBrowser.openUrl('https://chatgpt.com/codex/cloud')
        }}
        className={MENU_ITEM_CLASS}
      >
        <div className="flex w-full items-center gap-1.5">
          <RunlocConnectIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
          <span className="flex-1 min-w-0 truncate">Connect Codex web</span>
          <RunlocConnectExternalIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
        </div>
      </a>
      <div
        role="menuitem"
        aria-disabled="true"
        data-disabled=""
        tabIndex={-1}
        className="no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground cursor-default opacity-50 cursor-not-allowed flex flex-col"
      >
        <div className="flex w-full items-center gap-1.5">
          <RunlocSendCloudIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
          <span className="flex-1 min-w-0 truncate">
            <span className="truncate">Send to cloud</span>
          </span>
        </div>
      </div>
    </div>
  )
}
