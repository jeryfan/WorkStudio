import { useMemo } from 'react'
import type { AppShellTabPanelController } from '../../state/AppShellContext'
import { BrowserGlobeIcon, FilesFolderIcon } from '../icons'
import { createBrowserTabDescriptor } from './browserTabDescriptor'
import { createFilesTabDescriptor } from './filesTabDescriptor'

/**
 * 右面板新 tab 动作 —— launcher 空态与 strip 尾部「+」菜单共用同一组
 * (Codex 实测两处内容一致;bundle 侧是同一个 actions hook)。
 *
 * Codex 完整动作表(git workspace 下):review ⌃⇧G / terminal / browser ⌘T / open-file ⌘P。
 * Review 与 Terminal 本轮未实现(各缺 git diff 数据源与 PTY),先不出现在列表里 ——
 * 属于「条件不满足」,与 Codex 的条件组装语义一致,不是删减结构。
 * 命令 id 证据(i18n):thread.sidePanel.openReviewTab / openBrowserTab / openFile。
 */
export interface SidePanelTabAction {
  id: string
  title: string
  Icon: (props: { className?: string }) => React.JSX.Element
  keyboardShortcut?: string
  onSelect(): void
}

export function useSidePanelTabActions(
  controller: AppShellTabPanelController
): SidePanelTabAction[] {
  return useMemo(
    () => [
      {
        id: 'browser',
        title: 'Browser',
        Icon: BrowserGlobeIcon,
        keyboardShortcut: '⌘T',
        onSelect: () => controller.openTab(createBrowserTabDescriptor())
      },
      {
        id: 'open-file',
        title: 'Files',
        Icon: FilesFolderIcon,
        keyboardShortcut: '⌘P',
        onSelect: () => controller.openTab(createFilesTabDescriptor())
      }
    ],
    [controller]
  )
}
