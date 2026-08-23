/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

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

/* ==================== 右面板宽度(Codex 公式逆向,见 docs/codex-right-panel-spec.md) ====================
 *
 * Codex 把宽度存成 **ratio**(0..1,localStorage `app-shell:right-panel-width:v3`),
 * 实际像素每次由 ratio × 当前可用区间解出。区间:
 *
 *   regular 模式 [min(320, max), max(320, main-352)]   —— 352 = 主区最小保留宽(HHn)
 *   full    模式 [320,            max(320, main)]       —— Expand panel 后不扣 352
 *
 * 拖拽语义(setSize):目标 < 160(=320*0.5,WHn)直接关闭面板;
 * 160..320 是死区,钉在 320;其余 clamp 进区间。onResizeEnd 时才持久化 ratio。
 *
 * 默认宽(config defaultWidth 600 是哨兵值):
 *   max(320, min(shellHeight*1.6, main-500), min(640, main-352))
 */
export const RIGHT_PANEL_MIN_WIDTH = 320
/** 折叠阈值 = MIN * 0.5(Codex `WHn(320)`,JHn=0.5) */
export const RIGHT_PANEL_COLLAPSE_AT = RIGHT_PANEL_MIN_WIDTH * 0.5
/** regular 模式给主区保留的最小宽度(Codex `HHn`) */
const RIGHT_PANEL_MAIN_MIN = 352
const RIGHT_PANEL_WIDTH_STORAGE_KEY = 'app-shell:right-panel-width:v3'

/** Codex `FHn`:当前模式下的最大宽 */
export function rightPanelMaxWidth(mainContentWidth: number, mode: 'regular' | 'full'): number {
  return mode === 'full'
    ? Math.max(RIGHT_PANEL_MIN_WIDTH, mainContentWidth)
    : Math.max(RIGHT_PANEL_MIN_WIDTH, mainContentWidth - RIGHT_PANEL_MAIN_MIN)
}

/** Codex `AHn`:把任意像素宽 clamp 进当前区间 */
export function clampRightPanelWidth(
  desired: number,
  mainContentWidth: number,
  mode: 'regular' | 'full'
): number {
  const max = rightPanelMaxWidth(mainContentWidth, mode)
  return Math.max(Math.min(RIGHT_PANEL_MIN_WIDTH, max), Math.min(desired, max))
}

/** Codex `NHn`:像素宽 → ratio(持久化用) */
function rightPanelWidthToRatio(
  width: number,
  mainContentWidth: number,
  mode: 'regular' | 'full'
): number {
  const max = rightPanelMaxWidth(mainContentWidth, mode)
  const min = Math.min(RIGHT_PANEL_MIN_WIDTH, max)
  const range = max - min
  if (range === 0) return 0
  return Math.max(
    0,
    Math.min(1, (clampRightPanelWidth(width, mainContentWidth, mode) - min) / range)
  )
}

/** Codex `PHn`:ratio → 像素宽 */
function rightPanelRatioToWidth(
  ratio: number,
  mainContentWidth: number,
  mode: 'regular' | 'full'
): number {
  const max = rightPanelMaxWidth(mainContentWidth, mode)
  const min = Math.min(RIGHT_PANEL_MIN_WIDTH, max)
  return clampRightPanelWidth(
    min + Math.max(0, Math.min(1, ratio)) * (max - min),
    mainContentWidth,
    mode
  )
}

/** Codex `kHn`:默认宽(defaultWidth=600 是配置哨兵,走窗口尺寸公式) */
function defaultRightPanelWidth(mainContentWidth: number, shellHeight: number): number {
  return Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    Math.min(shellHeight * 1.6, mainContentWidth - 500),
    Math.min(640, mainContentWidth - RIGHT_PANEL_MAIN_MIN)
  )
}

/** 拖拽目标宽 → 实际宽;返回 0 表示拖过折叠阈值,直接关闭 */
export function resolveRightPanelDrag(
  desired: number,
  mainContentWidth: number,
  mode: 'regular' | 'full'
): number {
  if (desired < RIGHT_PANEL_COLLAPSE_AT) return 0
  return clampRightPanelWidth(desired, mainContentWidth, mode)
}

function readStoredRatio(): number | null {
  try {
    const raw = localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeStoredRatio(ratio: number): void {
  try {
    localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(ratio))
  } catch {
    /* 隐私模式等场景下静默 */
  }
}

/** 面板停靠位置：右侧 / 底部(AppShellTabs 同一组件,两种停靠) */
export type PanelDock = 'right' | 'bottom'

/**
 * Tab 类型 —— 对齐 Codex 右面板的四种:review/terminal/browser/files。
 * 本轮落地 file 与 browser;review(diff)/ terminal 下一轮(见 spec 文档第九节)。
 */
export type PanelTabKind = 'file' | 'browser'

export interface PanelTabPayload {
  /** kind=file：项目 id(文件树根) */
  projectId?: string
  /** kind=file：项目内当前预览的文件路径(空 = 未选择,标题 "Open file") */
  path?: string
  /** kind=browser：目标 URL(空 = 新标签页 "New tab") */
  url?: string
}

/**
 * Tab 描述符 —— 对齐 Codex 的 tab descriptor:
 * `{tabId, dndId, title, isPreview, isClosable, …, renderPanel}`。
 * renderPanel 在 WS 不挂到对象上,由 AppShellTabs 按 kind 注册表渲染(DOM 无差异)。
 *
 * tabId 规则(Codex 实测):review=`diff`;file=`file:local:<path>`;browser/terminal=随机 UUID。
 */
export interface PanelTab {
  tabId: string
  kind: PanelTabKind
  title: string
  /**
   * 预览 tab(VSCode 语义,Codex 一致):斜体标题;再开别的预览 tab 会替换它;
   * 双击 tab 或在面板内交互(排除 data-tab-preview-pin-exempt 子树)即 pin 成正式 tab。
   */
  isPreview: boolean
  payload: PanelTabPayload
}

interface DockState {
  tabs: PanelTab[]
  activeTabId: string | null
}

interface PanelContextValue {
  sidebarOpen: boolean
  rightPanelOpen: boolean
  bottomPanelOpen: boolean
  /** Codex `widthMode`:'full' = Expand panel 后的全宽模式(主区挤到 0) */
  rightPanelWidthMode: 'regular' | 'full'
  toggleSidebar(): void
  toggleRightPanel(): void
  toggleBottomPanel(): void
  /** Expand panel / Restore panel width(Codex `toggleMaximizeSidePanel`) */
  toggleRightPanelFullWidth(): void
  /** 侧栏当前宽度(px)。0 = 折叠 —— Codex 就是用宽度表达折叠,没有单独的 collapsed 标志 */
  sidebarWidth: number
  rightPanelWidth: number
  /** 拖拽中调用:传目标宽度,内部按 Codex 的规则(死区/折叠/clamp)收敛 */
  setSidebarWidth(desired: number): void
  /** 右面板拖拽;返回实际应用的宽度(0 = 已拖关),AppShell 据此关面板 */
  setRightPanelWidth(desired: number): void
  /** 拖拽结束:按当前宽度持久化 ratio(Codex `MHn`) */
  commitRightPanelWidth(): void
  /** 主内容区可用宽(shell − sidebar),右面板 max 公式的输入 */
  mainContentWidth: number
  docks: Record<PanelDock, DockState>
  /** 打开 tab(同 tabId 去重并激活;预览 tab 会被新预览 tab 替换);同时展开目标面板 */
  openTab(
    dock: PanelDock,
    tab: Omit<PanelTab, 'tabId' | 'isPreview'> & { tabId?: string; isPreview?: boolean }
  ): string
  closeTab(dock: PanelDock, tabId: string): void
  /** 关闭当前激活 tab(Codex `closeActiveTab`,⌘W 系命令走它) */
  closeActiveTab(dock: PanelDock): void
  activateTab(dock: PanelDock, tabId: string): void
  /** 把预览 tab 转正(双击 / 面板内交互触发) */
  pinTab(dock: PanelDock, tabId: string): void
  /** dnd 重排:把 fromId 插到 toId 的位置 */
  moveTab(dock: PanelDock, fromId: string, toId: string): void
  /** 更新 tab 元信息(BrowserTab 同步网页标题、FileTab 同步选中文件用) */
  updateTab(dock: PanelDock, tabId: string, patch: Partial<Omit<PanelTab, 'tabId'>>): void
}

const PanelContext = createContext<PanelContextValue | null>(null)

/** Codex tabId 规则 */
export function fileTabId(path: string): string {
  return `file:local:${path}`
}
export function newBrowserTabId(): string {
  return crypto.randomUUID()
}

export function PanelProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)
  const [rightPanelWidthMode, setRightPanelWidthMode] = useState<'regular' | 'full'>('regular')
  const [docks, setDocks] = useState<Record<PanelDock, DockState>>({
    right: { tabs: [], activeTabId: null },
    bottom: { tabs: [], activeTabId: null }
  })

  const [sidebarWidth, setSidebarWidthState] = useState(SIDEBAR_DEFAULT_WIDTH)
  // 折叠前的宽度,再次展开时恢复(Codex 也是恢复到折叠前那一档,不是回默认值)
  const [lastSidebarWidth, setLastSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)

  /*
   * 右面板宽度:初始值按 Codex 的优先级 —— 持久化 ratio > 默认公式。
   * mainContentWidth = 窗口宽 − 侧栏宽(Codex 的 mainContentWidth 由 motion value
   * 追踪,这里同源计算;窗口 resize 时 max 公式跟着变,宽度本身不主动重解,
   * Codex 也是 ratio 不变、像素随窗口动 —— 我们用 ratio 重解达到同样效果)。
   */
  const [shellSize, setShellSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight
  }))
  const mainContentWidth = Math.max(0, shellSize.w - sidebarWidth)

  const [rightPanelRatio, setRightPanelRatio] = useState<number>(() => readStoredRatio() ?? -1)
  const rightPanelWidth =
    rightPanelRatio >= 0
      ? rightPanelRatioToWidth(rightPanelRatio, mainContentWidth, rightPanelWidthMode)
      : defaultRightPanelWidth(mainContentWidth, shellSize.h)

  // 窗口尺寸跟踪(mainContentWidth / 默认宽公式的输入)
  useEffect(() => {
    const onResize = (): void => setShellSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const setSidebarWidth = useCallback((desired: number): void => {
    const next = resolveSidebarWidth(desired)
    setSidebarWidthState(next)
    if (next > 0) setLastSidebarWidth(next)
    setSidebarOpen(next > 0)
  }, [])

  const setRightPanelWidth = useCallback(
    (desired: number): void => {
      const main = Math.max(0, window.innerWidth - sidebarWidth)
      const next = resolveRightPanelDrag(desired, main, rightPanelWidthMode)
      if (next === 0) {
        // 拖过折叠阈值 = 关闭面板(Codex setSize 里 t=false 分支);ratio 保留,重开恢复
        setRightPanelOpen(false)
        setRightPanelWidthMode('regular')
        return
      }
      // 走 rightPanelWidthToRatio(Codex `NHn`)而不是就地再算一遍 ——
      // 它多了 clamp 与 0..1 收敛,两份实现容易漂
      setRightPanelRatio(rightPanelWidthToRatio(next, main, rightPanelWidthMode))
    },
    [sidebarWidth, rightPanelWidthMode]
  )

  const commitRightPanelWidth = useCallback((): void => {
    setRightPanelRatio((ratio) => {
      if (ratio >= 0) writeStoredRatio(ratio)
      return ratio
    })
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
      if (v) setRightPanelWidthMode('regular')
      return !v
    })
  }, [])

  const toggleBottomPanel = useCallback(() => setBottomPanelOpen((v) => !v), [])

  const toggleRightPanelFullWidth = useCallback((): void => {
    setRightPanelWidthMode((m) => (m === 'full' ? 'regular' : 'full'))
    setRightPanelOpen(true)
  }, [])

  const openTab = useCallback(
    (
      dock: PanelDock,
      tab: Omit<PanelTab, 'tabId' | 'isPreview'> & { tabId?: string; isPreview?: boolean }
    ): string => {
      // 打开 tab 时确保目标面板展开
      if (dock === 'right') setRightPanelOpen(true)
      else setBottomPanelOpen(true)

      const tabId =
        tab.tabId ?? (tab.kind === 'file' ? fileTabId(tab.payload.path ?? '') : newBrowserTabId())
      const isPreview = tab.isPreview ?? tab.kind === 'file'

      setDocks((prev) => {
        const state = prev[dock]
        const existing = state.tabs.find((t) => t.tabId === tabId)
        if (existing) {
          return { ...prev, [dock]: { ...state, activeTabId: existing.tabId } }
        }
        const descriptor: PanelTab = { ...tab, tabId, isPreview }
        let tabs = state.tabs
        if (isPreview) {
          // Codex/VSCode 预览语义:同时只有一个预览 tab,新预览替换旧预览
          const previewIdx = tabs.findIndex((t) => t.isPreview)
          tabs =
            previewIdx >= 0
              ? tabs.map((t, i) => (i === previewIdx ? descriptor : t))
              : [...tabs, descriptor]
        } else {
          tabs = [...tabs, descriptor]
        }
        return { ...prev, [dock]: { tabs, activeTabId: tabId } }
      })
      return tabId
    },
    []
  )

  const closeTab = useCallback((dock: PanelDock, tabId: string): void => {
    setDocks((prev) => {
      const state = prev[dock]
      const tabs = state.tabs.filter((t) => t.tabId !== tabId)
      const activeTabId =
        state.activeTabId === tabId ? (tabs[tabs.length - 1]?.tabId ?? null) : state.activeTabId
      return { ...prev, [dock]: { tabs, activeTabId } }
    })
  }, [])

  const closeActiveTab = useCallback(
    (dock: PanelDock): void => {
      const active = docks[dock].activeTabId
      if (active != null) closeTab(dock, active)
    },
    [docks, closeTab]
  )

  const activateTab = useCallback((dock: PanelDock, tabId: string): void => {
    setDocks((prev) => ({ ...prev, [dock]: { ...prev[dock], activeTabId: tabId } }))
  }, [])

  const pinTab = useCallback((dock: PanelDock, tabId: string): void => {
    setDocks((prev) => ({
      ...prev,
      [dock]: {
        ...prev[dock],
        tabs: prev[dock].tabs.map((t) => (t.tabId === tabId ? { ...t, isPreview: false } : t))
      }
    }))
  }, [])

  const moveTab = useCallback((dock: PanelDock, fromId: string, toId: string): void => {
    setDocks((prev) => {
      const state = prev[dock]
      const from = state.tabs.findIndex((t) => t.tabId === fromId)
      const to = state.tabs.findIndex((t) => t.tabId === toId)
      if (from < 0 || to < 0 || from === to) return prev
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved)
      return { ...prev, [dock]: { ...state, tabs } }
    })
  }, [])

  const updateTab = useCallback(
    (dock: PanelDock, tabId: string, patch: Partial<Omit<PanelTab, 'tabId'>>): void => {
      setDocks((prev) => ({
        ...prev,
        [dock]: {
          ...prev[dock],
          tabs: prev[dock].tabs.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t))
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
      rightPanelWidthMode,
      toggleSidebar,
      toggleRightPanel,
      toggleBottomPanel,
      toggleRightPanelFullWidth,
      sidebarWidth,
      rightPanelWidth,
      setSidebarWidth,
      setRightPanelWidth,
      commitRightPanelWidth,
      mainContentWidth,
      docks,
      openTab,
      closeTab,
      closeActiveTab,
      activateTab,
      pinTab,
      moveTab,
      updateTab
    }),
    [
      sidebarOpen,
      rightPanelOpen,
      bottomPanelOpen,
      rightPanelWidthMode,
      toggleSidebar,
      toggleRightPanel,
      toggleBottomPanel,
      toggleRightPanelFullWidth,
      sidebarWidth,
      rightPanelWidth,
      setSidebarWidth,
      setRightPanelWidth,
      commitRightPanelWidth,
      mainContentWidth,
      docks,
      openTab,
      closeTab,
      closeActiveTab,
      activateTab,
      pinTab,
      moveTab,
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
