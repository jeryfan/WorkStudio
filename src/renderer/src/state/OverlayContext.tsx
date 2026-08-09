/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/** 下拉菜单身份：对应 sider/2.html 的四个菜单 */
export type MenuId = 'project-options' | 'project-actions' | 'settings' | 'help'

export interface MenuState {
  id: MenuId
  /** 触发元素的 getBoundingClientRect()，用于 fixed 定位 */
  anchor: DOMRect
  /** project-actions 菜单需要知道作用于哪个项目 */
  projectId?: string
}

interface OverlayContextValue {
  menu: MenuState | null
  commandOpen: boolean
  createProjectOpen: boolean
  openMenu(state: MenuState): void
  closeMenu(): void
  toggleCommand(): void
  setCommandOpen(open: boolean): void
  setCreateProjectOpen(open: boolean): void
  /** Escape / 点击遮罩时统一关闭 */
  closeAll(): void
}

const OverlayContext = createContext<OverlayContextValue | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)

  const closeAll = useCallback((): void => {
    setMenu(null)
    setCommandOpen(false)
    setCreateProjectOpen(false)
  }, [])

  const value = useMemo<OverlayContextValue>(
    () => ({
      menu,
      commandOpen,
      createProjectOpen,
      openMenu: setMenu,
      closeMenu: () => setMenu(null),
      toggleCommand: () => setCommandOpen((v) => !v),
      setCommandOpen,
      setCreateProjectOpen,
      closeAll
    }),
    [menu, commandOpen, createProjectOpen, closeAll]
  )

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext)
  if (!ctx) throw new Error('useOverlay must be used within OverlayProvider')
  return ctx
}
