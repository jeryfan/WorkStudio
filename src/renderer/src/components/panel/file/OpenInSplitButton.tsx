import { useMemo, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDownIcon } from '../../icons'
import {
  appIconUrl,
  openInTarget,
  readPreferredTarget,
  resolvePrimaryTarget,
  useOpenTargets,
  type OpenTarget
} from './openTargets'

/**
 * "Open in" 分割按钮 —— Codex `Sia`(app-initial:325077)的移植。
 *
 * 实测 DOM(2026-08-24):
 *   div.inline-flex.self-start.items-stretch.overflow-hidden.rounded-lg.shrink-0
 *   ├ span.inline-flex.min-w-0[data-state] > button[aria-label="Open in VS Code"]
 *   │   (outline 变体 + rounded-e-none border-e-0 pe-1)
 *   │   └ span.flex.items-center.gap-1.5 > img.icon-sm(src=/apps/<app>.png)+ "Open"
 *   └ span.inline-flex.outline-hidden.cursor-interaction[type=button][aria-haspopup=menu]
 *       > button[aria-label="Open options"](同变体 + gap-0 rounded-s-none border-s-0
 *       ps-0.5 pe-1.5)> chevron icon-2xs opacity-50
 *
 * 菜单项(实测):首选目标置顶的编辑器/终端列表 → separator → Open in folder →
 * (Save as…,宿主 saveCopy 能力)。Codex 还有 Open in GitHub(需 git remote
 * 探测,WS 暂无)与 Google Drive 连接行(connector,不适用)。
 *
 * 点击主按钮:首选目标打开(persistPreferred);主按钮无图标且无目标时
 * 退化为 "Open in folder"(Codex onClick 的 r==null 分支)。
 */

/** Codex th 按钮 outline 变体(实测类) */
const OPEN_IN_BUTTON_BASE =
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-lg border-token-border bg-token-bg-fog enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background h-token-button-composer px-2 py-0 text-base leading-[18px]'

export function OpenInSplitButton({
  absolutePath,
  fileName
}: {
  /** 文件的绝对路径(主进程打开用) */
  absolutePath: string
  fileName: string
}): React.JSX.Element | null {
  const { targets, isLoading } = useOpenTargets()
  const [, forceRender] = useState(0)
  // 首选目标变化(菜单里选过后)重渲染主按钮
  const preferred = readPreferredTarget()
  void preferred
  const primaryTarget = useMemo(() => resolvePrimaryTarget(targets), [targets])

  const openWith = (target: OpenTarget, persist: boolean): void => {
    openInTarget(target, absolutePath, { persistPreferred: persist })
    forceRender((n) => n + 1)
  }

  const openInFolder = (): void => {
    openInTarget({ target: 'fileManager' }, absolutePath)
  }

  if (!isLoading && targets.length === 0) return null

  return (
    <div className="inline-flex shrink-0 items-stretch self-start overflow-hidden rounded-lg">
      <span className="inline-flex min-w-0" data-state="closed">
        <button
          type="button"
          aria-label={primaryTarget ? `Open in ${primaryTarget.label}` : 'Open in folder'}
          className={`${OPEN_IN_BUTTON_BASE} rounded-e-none border-e-0 pe-1`}
          onClick={() => {
            if (primaryTarget == null) {
              openInFolder()
              return
            }
            openWith(primaryTarget, true)
          }}
        >
          <span className="flex items-center gap-1.5">
            {primaryTarget != null && (
              <img alt="" className="icon-sm" src={appIconUrl(primaryTarget.iconFile)} />
            )}
            <span className="whitespace-nowrap">Open</span>
          </span>
        </button>
      </span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <span className="inline-flex cursor-interaction outline-hidden" data-state="closed">
            <button
              type="button"
              aria-label="Open options"
              className={`${OPEN_IN_BUTTON_BASE} gap-0 rounded-s-none border-s-0 ps-0.5 pe-1.5`}
            >
              <ChevronDownIcon className="icon-2xs opacity-50" />
            </button>
          </span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="no-drag z-50 m-px flex select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background/90 px-1 py-1 text-token-foreground ring-[0.5px] ring-token-border shadow-xl-spread backdrop-blur-sm"
          >
            <div className="flex min-w-[160px] flex-col gap-0.5">
              {isLoading && (
                <div className="px-[var(--padding-row-x)] text-sm text-token-description-foreground">
                  Loading available apps…
                </div>
              )}
              {targets.map((target) => (
                <DropdownMenu.Item
                  key={target.target}
                  onSelect={() => openWith(target, true)}
                  className="no-drag rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground outline-hidden hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction"
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="inline-flex shrink-0 items-center justify-center leading-none icon-sm">
                      <img alt="" className="icon-sm" src={appIconUrl(target.iconFile)} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{target.label}</span>
                  </div>
                </DropdownMenu.Item>
              ))}
              {/* Codex 实测:"Default app"(systemDefault,file-explorer 图标) */}
              <DropdownMenu.Item
                onSelect={() => openInTarget({ target: 'systemDefault' }, absolutePath)}
                className="no-drag rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground outline-hidden hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction"
              >
                <div className="flex w-full items-center gap-1.5">
                  <span className="inline-flex shrink-0 items-center justify-center leading-none icon-sm">
                    <img alt="" className="icon-sm" src={appIconUrl('file-explorer.png')} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">Default app</span>
                </div>
              </DropdownMenu.Item>
              {targets.length > 0 && (
                <div className="mx-1 my-1 border-t border-token-border/60" role="separator" />
              )}
              <DropdownMenu.Item
                onSelect={openInFolder}
                className="no-drag rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground outline-hidden hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction"
              >
                Open in folder
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => void window.codexBridge.openIn.saveCopy(absolutePath, fileName)}
                className="no-drag rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground outline-hidden hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction"
              >
                Save as…
              </DropdownMenu.Item>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
