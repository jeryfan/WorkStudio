import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CopyIcon, DotsIcon } from '../../icons'
import { WordWrapEnabledIcon, WordWrapDisabledIcon } from '../../icons/extracted/WordWrapIcons'
import { fileService } from '../../../services'
import { toggleWordWrap, useWordWrap } from '../../../state/fileViewerPrefs'
import { APP_SHELL_BUTTON_CLASS } from '../appShellButtonClass'

/**
 * File viewer options 菜单 —— Codex `NSo`(app-initial:425592)。
 *
 * 实测项(纯文本文件,.gitignore):
 *   Copy path / Copy file contents / Enable word wrap
 * 条件项(WS 未接对应能力,不渲染):
 *   Enable rich view(markdown 富预览 —— WS 无 pierre 编辑器)
 *   Show git blame(特性开关在 Codex 本构建关闭,实测也不出现)
 *
 * trigger:th ghost + toolbar + uniform(APP_SHELL_BUTTON_CLASS)+ DotsIcon(icon-xs),
 * aria-label "File viewer options";菜单 align=end,卡片类与「+」菜单同族。
 * 每项:hH.Item 结构(content flex gap-1.5 + LeftIcon shrink-0 opacity-75 + label)。
 */
export function FileViewerOptionsMenu({ path }: { path: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wordWrap = useWordWrap()

  const closeAnd = (action: () => void) => (e: Event) => {
    // Codex NSo:e.preventDefault()(菜单不关成默认)+ 手动 h(!1) —— 行为等价于直接关
    e.preventDefault()
    action()
    setOpen(false)
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="File viewer options" className={APP_SHELL_BUTTON_CLASS}>
          <DotsIcon className="icon-xs" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="no-drag z-50 m-px flex select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background/90 px-1 py-1 text-token-foreground ring-[0.5px] ring-token-border shadow-xl-spread backdrop-blur-sm"
          style={{
            maxWidth: 'min(var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))',
            maxHeight:
              'min(var(--radix-dropdown-menu-content-available-height), calc(100vh - 16px))'
          }}
        >
          <OptionsMenuItem
            LeftIcon={CopyIcon}
            onSelect={closeAnd(() => void navigator.clipboard.writeText(path))}
          >
            Copy path
          </OptionsMenuItem>
          <OptionsMenuItem
            LeftIcon={CopyIcon}
            onSelect={closeAnd(() => {
              void fileService
                .readFile(path)
                .then((content) => navigator.clipboard.writeText(content))
            })}
          >
            Copy file contents
          </OptionsMenuItem>
          <OptionsMenuItem
            LeftIcon={wordWrap ? WordWrapEnabledIcon : WordWrapDisabledIcon}
            onSelect={closeAnd(toggleWordWrap)}
          >
            {wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          </OptionsMenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** hH.Item 的实测结构(content flex w-full gap-1.5 + icon slot + label) */
function OptionsMenuItem({
  LeftIcon,
  onSelect,
  children
}: {
  LeftIcon: (props: { className?: string }) => React.JSX.Element
  onSelect: (e: Event) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col"
    >
      <div className="flex w-full items-center gap-1.5">
        <span className="inline-flex shrink-0 items-center justify-center leading-none icon-xs opacity-75 group-focus:opacity-100 group-hover:opacity-100">
          <LeftIcon className="icon-xs" />
        </span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </div>
    </DropdownMenu.Item>
  )
}
