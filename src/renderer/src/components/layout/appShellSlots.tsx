/* eslint-disable react-refresh/only-export-components -- Codex `$P` 是一个注册器对象（Header/HeaderAction/HeaderToolbar 同表），拆成三个文件会把这层对应关系拆散 */
import { useLayoutEffect, type ReactNode } from 'react'
import {
  useAppShell,
  useRegisterAppShellSlot,
  type HeaderActionEntry
} from '../../state/AppShellContext'

/**
 * app shell 的插槽注册器 —— Codex `$P` 那一组(app-initial:229388)里与 header
 * 相关的三个成员。
 *
 * Codex 的 `$P` 完整成员表(逐字):
 *   Root, LeftPanel, Content, Header, HeaderAction, HeaderContextMenuItem,
 *   HeaderToolbar, MainContentLayout, BottomPanel, BottomPanelTabs,
 *   BottomPanelTabsEmptyState, BottomPanelTabListAfter,
 *   BottomPanelTabListAfterSticky, BottomPanelOutlet, RightPanel,
 *   RightPanelTabs, RightPanelTabsEmptyState, RightPanelTabListAfter,
 *   RightPanelTabListAfterSticky, RightPanelTabListBefore, RightPanelOutlet,
 *   DetailPanel, DetailPanelLoading, DetailPanelOutlet
 *
 * 本项目的对应关系：
 * - `Root` = `components/layout/AppShell`（渲染 shell 本体，不是注册器）
 * - `LeftPanel` / `Content` / `MainContentLayout` / `*Panel*` 已经是各自的组件，
 *   面板类槽位（RightPanelTabsEmptyState 等）走 `useRegisterAppShellSlot`
 * - 这里补的是 header 那三个：`Header`(内容) / `HeaderAction`(动作) /
 *   `HeaderToolbar`(纯样式容器)
 * - **`HeaderContextMenuItem` 没接**：它注册的是 header 表面的右键菜单项
 *   (Codex `MUn` → 由 `gv` 包在 header 外层消费)，本项目还没有 header 右键菜单，
 *   接一个没有消费者的注册表没意义。
 */

/**
 * Codex `ZYr`：把 children 写进 header 中段的槽，自身渲染 null。
 *
 * `inline` 为真时不注册、直接原地渲染（Codex 用它在没有 app shell 的
 * 环境里复用同一段 header 内容）。
 */
function Header({
  children,
  className,
  inline = false
}: {
  children: ReactNode
  className?: string
  inline?: boolean
}): React.JSX.Element | null {
  useRegisterAppShellSlot('header', inline ? null : children)
  return inline ? <div className={className}>{children}</div> : null
}

/**
 * Codex `QYr`：把一个动作按 actionId 注册进 header 中段，自身渲染 null。
 *
 * 卸载时从注册表里摘掉（Codex 是把 byId 写 null 再从 ids$ 里过滤掉，
 * 效果等价于删键）。注册在 layout effect 里做，与 Codex 一致 ——
 * header 先渲染一帧空的再补上动作会闪。
 *
 * `slotPosition` 只支持 center（Codex 的 left/right 槽在本项目还是写死的，
 * 见 AppShellContext 里 HeaderActionEntry 的说明）。
 */
function HeaderAction({
  actionId,
  align = 'start',
  order = 0,
  children
}: {
  actionId: string
  align?: HeaderActionEntry['align']
  order?: number
  children: ReactNode
}): null {
  const { registerHeaderAction, unregisterHeaderAction } = useAppShell()
  useLayoutEffect(() => {
    registerHeaderAction({ actionId, align, order, node: children })
  }, [actionId, align, order, children, registerHeaderAction])
  useLayoutEffect(() => {
    return () => unregisterHeaderAction(actionId)
  }, [actionId, unregisterHeaderAction])
  return null
}

/**
 * Codex `jXr`：header 里的工具条容器（纯样式，无注册）。
 * `inset` 默认真 → `px-2`。
 */
function HeaderToolbar({
  children,
  inset = true
}: {
  children: ReactNode
  inset?: boolean
}): React.JSX.Element {
  return (
    <div
      className={`draggable flex w-full min-w-0 items-center justify-between gap-2 electron:h-toolbar extension:py-row-y ${
        inset ? 'px-2' : ''
      }`}
    >
      {children}
    </div>
  )
}

export const AppShellSlots = { Header, HeaderAction, HeaderToolbar }
