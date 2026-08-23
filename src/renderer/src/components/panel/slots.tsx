import type { ReactNode } from 'react'
import { useRegisterAppShellSlot } from '../../state/AppShellContext'

/**
 * 槽位注册组件 —— Codex AppShell 模块导出词表(app-initial:229403 实测):
 * RightPanelTabsEmptyState / RightPanelOutlet / RightPanelTabListAfter{,Sticky} /
 * RightPanelTabListBefore,以及 BottomPanel* 同组。
 *
 * 它们本身**渲染 null**,靠 KP(app-initial:228814)把 children 写进 scope 的
 * slot atom;RightPanelTabs(uDr)/ BottomPanelTabs(ewr)渲染时读出。
 * 这里 `useRegisterAppShellSlot` 就是 KP 的移植(useLayoutEffect 写入、卸载写 null)。
 */

export function RightPanelTabsEmptyState({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('rightPanelTabsEmptyState', children)
  return null
}

export function RightPanelOutlet({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('rightPanelOutlet', children)
  return null
}

export function RightPanelTabListBefore({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('rightPanelTabListBefore', children)
  return null
}

export function RightPanelTabListAfter({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('rightPanelTabListAfter', children)
  return null
}

export function RightPanelTabListAfterSticky({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('rightPanelTabListAfterSticky', children)
  return null
}

export function BottomPanelTabsEmptyState({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('bottomPanelTabsEmptyState', children)
  return null
}

export function BottomPanelOutlet({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('bottomPanelOutlet', children)
  return null
}

export function BottomPanelTabListBefore({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('bottomPanelTabListBefore', children)
  return null
}

export function BottomPanelTabListAfter({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('bottomPanelTabListAfter', children)
  return null
}

export function BottomPanelTabListAfterSticky({ children }: { children: ReactNode }): null {
  useRegisterAppShellSlot('bottomPanelTabListAfterSticky', children)
  return null
}
