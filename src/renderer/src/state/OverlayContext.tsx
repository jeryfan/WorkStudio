/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * 浮层统一出口的状态 —— ⌘K 命令面板 / 新建项目对话框。
 *
 * 下拉菜单**不在这里**:Codex 的菜单都是触发器本地的 Radix DropdownMenu
 *(触发器上的 data-state/aria-expanded 由 Radix 自动同步,菜单内容 portal
 * 到 body)。之前集中在这里的 menu/anchor 通道已经拆掉(见
 * components/menu/CodexMenu.tsx)。
 */
interface OverlayContextValue {
  commandOpen: boolean
  createProjectOpen: boolean
  toggleCommand(): void
  setCommandOpen(open: boolean): void
  setCreateProjectOpen(open: boolean): void
  /** Escape / 点击遮罩时统一关闭 */
  closeAll(): void
}

const OverlayContext = createContext<OverlayContextValue | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [commandOpen, setCommandOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)

  const closeAll = useCallback((): void => {
    setCommandOpen(false)
    setCreateProjectOpen(false)
  }, [])

  const value = useMemo<OverlayContextValue>(
    () => ({
      commandOpen,
      createProjectOpen,
      toggleCommand: () => setCommandOpen((v) => !v),
      setCommandOpen,
      setCreateProjectOpen,
      closeAll
    }),
    [commandOpen, createProjectOpen, closeAll]
  )

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext)
  if (!ctx) throw new Error('useOverlay must be used within OverlayProvider')
  return ctx
}
