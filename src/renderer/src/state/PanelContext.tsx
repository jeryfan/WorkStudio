/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { usePanelRef, type PanelImperativeHandle } from 'react-resizable-panels'

/** 面板停靠位置：右侧 / 底部（PanelShell 同一组件，两种停靠） */
export type PanelDock = 'right' | 'bottom'

/**
 * Tab 类型：本期支持 file（项目文件树 + 预览）与 browser（内嵌浏览器），
 * 后续可通过 registry 扩展 terminal / diff 等。
 */
export type PanelTabKind = 'file' | 'browser'

export interface PanelTab {
  id: string
  kind: PanelTabKind
  title: string
  payload: {
    /** kind=file：项目 id（文件树根） */
    projectId?: string
    /** kind=file：项目内当前预览的文件路径（空 = 未选择） */
    path?: string
    /** kind=browser：目标 URL */
    url?: string
  }
  /** 预留：编辑未保存标记 */
  dirty?: boolean
}

interface DockState {
  tabs: PanelTab[]
  activeTabId: string | null
}

/** 三个可折叠面板的 id（onResize 上报用） */
export type CollapsiblePanelId = 'sidebar' | 'right' | 'bottom'

interface PanelContextValue {
  sidebarOpen: boolean
  rightPanelOpen: boolean
  bottomPanelOpen: boolean
  /** 右侧面板最大化：隐藏内容区，tab panel 占满整个 content-row */
  panelMaximized: boolean
  toggleSidebar(): void
  toggleRightPanel(): void
  toggleBottomPanel(): void
  togglePanelMaximized(): void
  /** Panel 的 panelRef（命令式 collapse/expand/isCollapsed） */
  sidebarRef: React.RefObject<PanelImperativeHandle | null>
  rightRef: React.RefObject<PanelImperativeHandle | null>
  bottomRef: React.RefObject<PanelImperativeHandle | null>
  /** Panel onResize 上报（像素 > 1 视为打开），同步 open 布尔态 */
  reportPanelSize(id: CollapsiblePanelId, inPixels: number): void
  docks: Record<PanelDock, DockState>
  /** 打开 tab（同 path/url 去重并激活），返回 tab id；同时展开目标面板 */
  openTab(dock: PanelDock, tab: Omit<PanelTab, 'id'>): string
  closeTab(dock: PanelDock, id: string): void
  activateTab(dock: PanelDock, id: string): void
  /** 更新 tab 元信息（BrowserTab 同步网页标题用） */
  updateTab(dock: PanelDock, id: string, patch: Partial<Omit<PanelTab, 'id'>>): void
}

const PanelContext = createContext<PanelContextValue | null>(null)

let tabSeq = 0
const nextTabId = (): string => `tab-${++tabSeq}`

export function PanelProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)
  const [panelMaximized, setPanelMaximized] = useState(false)
  const [docks, setDocks] = useState<Record<PanelDock, DockState>>({
    right: { tabs: [], activeTabId: null },
    bottom: { tabs: [], activeTabId: null }
  })

  const sidebarRef = usePanelRef()
  const rightRef = usePanelRef()
  const bottomRef = usePanelRef()

  const togglePanel = useCallback((ref: React.RefObject<PanelImperativeHandle | null>): void => {
    const panel = ref.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])

  const toggleSidebar = useCallback(() => togglePanel(sidebarRef), [togglePanel, sidebarRef])
  const toggleRightPanel = useCallback(() => togglePanel(rightRef), [togglePanel, rightRef])
  const toggleBottomPanel = useCallback(() => togglePanel(bottomRef), [togglePanel, bottomRef])

  const togglePanelMaximized = useCallback((): void => {
    setPanelMaximized((v) => {
      if (!v) rightRef.current?.expand() // 最大化前确保右面板展开
      return !v
    })
  }, [rightRef])

  const reportPanelSize = useCallback((id: CollapsiblePanelId, inPixels: number): void => {
    const open = inPixels > 1
    if (id === 'sidebar') setSidebarOpen((prev) => (prev === open ? prev : open))
    else if (id === 'right') {
      setRightPanelOpen((prev) => (prev === open ? prev : open))
      // 最大化状态下把右面板拖到 0：自动退出最大化，避免内容区空无一物
      if (!open) setPanelMaximized(false)
    } else setBottomPanelOpen((prev) => (prev === open ? prev : open))
  }, [])

  const openTab = useCallback(
    (dock: PanelDock, tab: Omit<PanelTab, 'id'>): string => {
      // 打开 tab 时确保目标面板展开
      if (dock === 'right') rightRef.current?.expand()
      else bottomRef.current?.expand()

      let resultId = ''
      setDocks((prev) => {
        const state = prev[dock]
        const existing = state.tabs.find(
          (t) =>
            t.kind === tab.kind &&
            t.payload.projectId === tab.payload.projectId &&
            t.payload.path === tab.payload.path &&
            t.payload.url === tab.payload.url
        )
        if (existing) {
          resultId = existing.id
          return { ...prev, [dock]: { ...state, activeTabId: existing.id } }
        }
        const id = nextTabId()
        resultId = id
        return {
          ...prev,
          [dock]: { tabs: [...state.tabs, { ...tab, id }], activeTabId: id }
        }
      })
      return resultId
    },
    [rightRef, bottomRef]
  )

  const closeTab = useCallback((dock: PanelDock, id: string): void => {
    setDocks((prev) => {
      const state = prev[dock]
      const tabs = state.tabs.filter((t) => t.id !== id)
      const activeTabId =
        state.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId
      return { ...prev, [dock]: { tabs, activeTabId } }
    })
  }, [])

  const activateTab = useCallback((dock: PanelDock, id: string): void => {
    setDocks((prev) => ({ ...prev, [dock]: { ...prev[dock], activeTabId: id } }))
  }, [])

  const updateTab = useCallback(
    (dock: PanelDock, id: string, patch: Partial<Omit<PanelTab, 'id'>>): void => {
      setDocks((prev) => ({
        ...prev,
        [dock]: {
          ...prev[dock],
          tabs: prev[dock].tabs.map((t) => (t.id === id ? { ...t, ...patch } : t))
        }
      }))
    },
    []
  )

  const value = useMemo<PanelContextValue>(
    () => ({
      sidebarOpen,
      rightPanelOpen,
      bottomPanelOpen,
      panelMaximized,
      toggleSidebar,
      toggleRightPanel,
      toggleBottomPanel,
      togglePanelMaximized,
      sidebarRef,
      rightRef,
      bottomRef,
      reportPanelSize,
      docks,
      openTab,
      closeTab,
      activateTab,
      updateTab
    }),
    [
      sidebarOpen,
      rightPanelOpen,
      bottomPanelOpen,
      panelMaximized,
      toggleSidebar,
      toggleRightPanel,
      toggleBottomPanel,
      togglePanelMaximized,
      sidebarRef,
      rightRef,
      bottomRef,
      reportPanelSize,
      docks,
      openTab,
      closeTab,
      activateTab,
      updateTab
    ]
  )

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function usePanels(): PanelContextValue {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanels must be used within PanelProvider')
  return ctx
}
