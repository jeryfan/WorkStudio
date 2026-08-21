/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * 侧栏宽度约束 —— 全部实测自 Codex(真实鼠标拖到极限,逐步逼近确认)。
 *
 *   默认 340   最小 240   最大 520(固定值,与视口无关)
 *
 * **死区**是关键:指针从 240 一路收到约 140,宽度都锁在 240 不动 ——
 * 这是防误触折叠的缓冲带;只有越过 ~100 才整体折叠。
 * react-resizable-panels 的 collapsible 是"低于 minSize 立即折叠",没有死区,
 * 所以换库前比 Codex 容易误折。
 */
export const SIDEBAR_DEFAULT_WIDTH = 340
export const SIDEBAR_MIN_WIDTH = 240
export const SIDEBAR_MAX_WIDTH = 520
export const SIDEBAR_COLLAPSE_AT = 100

/** 把拖拽出的目标宽度收敛到 Codex 的档位;返回 0 表示折叠 */
export function resolveSidebarWidth(desired: number): number {
  if (desired <= SIDEBAR_COLLAPSE_AT) return 0
  if (desired < SIDEBAR_MIN_WIDTH) return SIDEBAR_MIN_WIDTH
  return Math.min(desired, SIDEBAR_MAX_WIDTH)
}

/** 右面板:Codex 实测最小 240,最大由可用宽度决定(留给主区至少 320) */
export const RIGHT_PANEL_DEFAULT_WIDTH = 320
export const RIGHT_PANEL_MIN_WIDTH = 240

/** 面板停靠位置：右侧 / 底部（AppShellTabPanel 同一组件，两种停靠） */
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
  /** 侧栏当前宽度(px)。0 = 折叠 —— Codex 就是用宽度表达折叠,没有单独的 collapsed 标志 */
  sidebarWidth: number
  rightPanelWidth: number
  /** 拖拽中调用:传目标宽度,内部按 Codex 的档位/死区收敛 */
  setSidebarWidth(desired: number): void
  setRightPanelWidth(desired: number): void
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

  const [sidebarWidth, setSidebarWidthState] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [rightPanelWidth, setRightPanelWidthState] = useState(RIGHT_PANEL_DEFAULT_WIDTH)
  // 折叠前的宽度,再次展开时恢复(Codex 也是恢复到折叠前那一档,不是回默认值)
  const [lastSidebarWidth, setLastSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)

  const setSidebarWidth = useCallback((desired: number): void => {
    const next = resolveSidebarWidth(desired)
    setSidebarWidthState(next)
    if (next > 0) setLastSidebarWidth(next)
    setSidebarOpen(next > 0)
  }, [])

  const setRightPanelWidth = useCallback((desired: number): void => {
    const next = Math.max(desired, RIGHT_PANEL_MIN_WIDTH)
    setRightPanelWidthState(next)
  }, [])

  const toggleSidebar = useCallback((): void => {
    setSidebarWidthState((w) => {
      const opening = w === 0
      setSidebarOpen(opening)
      return opening ? lastSidebarWidth : 0
    })
  }, [lastSidebarWidth])

  const toggleRightPanel = useCallback((): void => {
    setRightPanelOpen((v) => {
      if (v) setPanelMaximized(false)
      return !v
    })
  }, [])

  const toggleBottomPanel = useCallback(() => setBottomPanelOpen((v) => !v), [])

  const togglePanelMaximized = useCallback((): void => {
    setPanelMaximized((v) => {
      if (!v) setRightPanelOpen(true) // 最大化前确保右面板展开
      return !v
    })
  }, [])

  const openTab = useCallback((dock: PanelDock, tab: Omit<PanelTab, 'id'>): string => {
    // 打开 tab 时确保目标面板展开
    if (dock === 'right') setRightPanelOpen(true)
    else setBottomPanelOpen(true)

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
  }, [])

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
      sidebarWidth,
      rightPanelWidth,
      setSidebarWidth,
      setRightPanelWidth,
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
      sidebarWidth,
      rightPanelWidth,
      setSidebarWidth,
      setRightPanelWidth,
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
