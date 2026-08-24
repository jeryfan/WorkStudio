import { useEffect, useState } from 'react'
import { BranchCreateIcon, BranchItemIcon, MenuCheckIcon, SearchIcon } from '../../icons'
import {
  checkoutBranch,
  createAndCheckoutBranch,
  listBranches,
  type BranchInfo
} from '../../../services/workspace/gitBranchService'

/** Codex 菜单项基类(与运行时逐项一致) */
const MENU_ITEM_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col'

interface BranchDropdownProps {
  /** 项目根(git -C 的目标) */
  root: string
  /** 项目名(搜索框占位:"Search <project> branches") */
  projectName: string
  /** checkout/create 成功后回调(刷新 pill 等) */
  onBranchChange(name: string): void
  onClose(): void
}

/**
 * 分支下拉(Codex 运行时实测):
 *
 *   div[role=menu]
 *   └ div.flex.w-72.flex-col.gap-1-5.overflow-hidden
 *     ├ div.flex.w-full.items-center.gap-1-5.px-row-x.py-row-y
 *     │   > [search svg] + input[placeholder="Search <project> branches"]
 *     ├ div.vertical-scroll-fade-mask.flex.h-[200px].flex-col.gap-1-5.overflow-y-auto
 *     │   ├ div "Branches"
 *     │   └ menuitem(每分支):[branch svg] + div.flex-col
 *     │       > span(名称)+ span("Uncommitted: N files",仅当前分支) + (当前)[check]
 *     ├ divider
 *     └ menuitem "Create and checkout new branch…"
 *
 * 数据走 gitBranchService(协议 command/exec 执行 git)。
 * "Create and checkout new branch…" 的具体交互 Codex 未逐字确认,这里按
 * 搜索框文本建分支(空文本时只聚焦搜索框),已记录的近似。
 */
export function BranchDropdown({
  root,
  projectName,
  onBranchChange,
  onClose
}: BranchDropdownProps): React.JSX.Element {
  const [branches, setBranches] = useState<BranchInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let alive = true
    listBranches(root)
      .then((list) => {
        if (alive) setBranches(list)
      })
      .catch(() => {
        if (alive) setBranches([])
      })
    return () => {
      alive = false
    }
  }, [root])

  const filtered =
    query.trim().length > 0
      ? (branches ?? []).filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
      : (branches ?? [])

  const checkout = (name: string): void => {
    if (pending) return
    setPending(true)
    void checkoutBranch(root, name)
      .then(() => {
        onBranchChange(name)
        onClose()
      })
      .catch((err: unknown) => {
        console.error('[branch] checkout failed:', err)
        setPending(false)
      })
  }

  const createBranch = (): void => {
    const name = query.trim()
    if (name.length === 0 || pending) return
    setPending(true)
    void createAndCheckoutBranch(root, name)
      .then(() => {
        onBranchChange(name)
        onClose()
      })
      .catch((err: unknown) => {
        console.error('[branch] create failed:', err)
        setPending(false)
      })
  }

  return (
    <div className="flex w-72 flex-col gap-1.5 overflow-hidden">
      <div className="flex w-full items-center gap-1.5 px-[var(--padding-row-x)] py-[var(--padding-row-y)]">
        <SearchIcon className="icon-xs shrink-0 text-token-description-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${projectName} branches`}
          className="w-full min-w-0 rounded-sm border border-none px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm !outline-none !w-auto flex-1 appearance-none !rounded-none !border-none bg-transparent !px-0 !py-0 text-token-foreground placeholder:text-token-input-placeholder-foreground"
        />
      </div>
      <div className="vertical-scroll-fade-mask flex h-[200px] flex-col gap-1.5 overflow-y-auto">
        <div className="px-[var(--padding-row-x)] py-1 text-sm text-token-description-foreground">
          Branches
        </div>
        <div className="flex flex-col">
          {filtered.map((branch) => (
            <div
              key={branch.name}
              role="menuitem"
              data-state="closed"
              tabIndex={-1}
              onClick={() => !branch.current && checkout(branch.name)}
              className={MENU_ITEM_CLASS}
            >
              <div className="flex w-full items-center gap-3">
                <BranchItemIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span data-tooltip-overflow-target="" className="min-w-0 truncate">
                    {branch.name}
                  </span>
                  {branch.uncommittedFiles != null && (
                    <span className="min-w-0 whitespace-normal">
                      <span className="inline-flex items-center gap-1 text-xs text-token-input-placeholder-foreground">
                        Uncommitted: {branch.uncommittedFiles} files
                      </span>
                    </span>
                  )}
                </div>
                {branch.current && (
                  <MenuCheckIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
                )}
              </div>
            </div>
          ))}
          {branches != null && filtered.length === 0 && (
            <div className="px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-input-placeholder-foreground">
              No branches found
            </div>
          )}
        </div>
      </div>
      <div className="w-full px-[var(--padding-row-x)] py-1">
        <div className="h-[1px] w-full bg-token-menu-border" />
      </div>
      <div role="menuitem" tabIndex={-1} onClick={createBranch} className={MENU_ITEM_CLASS}>
        <div className="flex w-full items-center gap-1.5">
          <BranchCreateIcon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
          <span className="flex-1 min-w-0 truncate">Create and checkout new branch…</span>
        </div>
      </div>
    </div>
  )
}
