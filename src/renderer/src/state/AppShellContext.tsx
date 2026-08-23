/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

/**
 * AppShell 状态 —— Codex 侧没有对应名的 React Context(它的状态是自研 signals store),
 * 本文件是 React 移植。命名与心智模型对齐 bundle 实证:
 *
 * - **appShellTabPanelController**(app-initial:184520):右/底两个 controller,
 *   `d1n({panelId: 'right'|'bottom', panelOpen$, setPanelOpen})` 工厂产出,方法表实测为
 *   openTab / closeTab / closeActiveTab / activateTab / pinTab / reorderTab / updateTab /
 *   updateTabState / tabStateById$ / tabs$ / activeTab$ / panelId(184274-184300)。
 *   这里对应 rightPanelController / bottomPanelController 两个对象。
 * - **Tab 描述符**:Codex 的 tab 是 `{tabId, dndId, title, icon, isClosable, isPreview,
 *   tooltip, requiresWorkspaceReady, defaultState, props, renderPanel}`。
 *   renderPanel 收到的 props(app-initial:184300 N 函数):
 *   `{...props, onClose, tabId, isActive, tabState, setTabState}`。
 * - **槽位注册**(KP,app-initial:228814):RightPanelTabsEmptyState 等组件渲染 null,
 *   用 useLayoutEffect 把 children 写进 scope 的 slot atom,卸载时写回 null。
 *   这里对应 slots registry + useRegisterAppShellSlot。
 *
 * 宽度/折叠规则全部是 Codex 实测逆向(见 docs/codex-right-panel-spec.md),不要按直觉改。
 */

/* ==================== 侧栏宽度(实测) ==================== */

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

/* ==================== 右面板宽度(Codex 公式逆向) ====================
 *
 * Codex 把宽度存成 **ratio**(0..1,localStorage `app-shell:right-panel-width:v3`),
 * 实际像素每次由 ratio × 当前可用区间解出。区间:
 *
 *   regular 模式 [min(320, max), max(320, main-352)]   —— 352 = 主区最小保留宽(HHn)
 *   full    模式 [320,            max(320, main)]       —— Expand panel 后不扣 352
 *
 * 拖拽语义(setSize):目标 < 160(=320*0.5,WHn)直接关闭面板;
 * 160..320 是死区,钉在 320;其余 clamp 进区间。onResizeEnd 时才持久化 ratio。
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

/* ==================== Tab 描述符与 controller(对齐 Codex appShellTabPanelController) ==================== */

/** 面板停靠位置:右侧 / 底部(Codex panelId: 'right' | 'bottom') */
export type PanelDock = 'right' | 'bottom'

/** renderPanel 收到的 props(Codex app-initial:184300 实测) */
export interface AppShellTabRenderProps<S = unknown> {
  tabId: string
  isActive: boolean
  onClose(): void
  tabState: S
  setTabState(next: S | ((prev: S) => S)): void
}

/**
 * Tab 描述符 —— 对齐 Codex 的 tab descriptor。
 * renderPanel 是面板内容的渲染入口(Codex 里是被 N() 包成 createElement 的组件)。
 */
export interface AppShellTabDescriptor<S = unknown> {
  /** Codex 实测:review=`diff`;file=`file:local:<path>`(空 path 时为 `file:local:`);browser=随机 UUID */
  tabId: string
  /** dnd 用的稳定 id(Codex `dndId`),默认同 tabId */
  dndId: string
  title: string
  icon?: ReactNode
  /** 预览 tab:斜体标题;再开别的预览 tab 会替换它;双击 tab 或在面板内交互即 pin 转正 */
  isPreview: boolean
  isClosable: boolean
  tooltip?: string
  requiresWorkspaceReady?: boolean
  /** tabState 初始值(Codex `defaultState`) */
  defaultState?: () => S
  renderPanel(props: AppShellTabRenderProps<S>): ReactNode
}

/** openTab 的输入:tabId/dndId/isPreview/isClosable 可省(按 Codex 规则补默认) */
export type AppShellTabDescriptorInput<S = unknown> = Omit<
  AppShellTabDescriptor<S>,
  'tabId' | 'dndId' | 'isPreview' | 'isClosable'
> & {
  tabId?: string
  dndId?: string
  isPreview?: boolean
  isClosable?: boolean
}

/** tabState 条目:Codex 是 {key, value},reset 时 key 自增(app-initial:184252 A 函数) */
interface TabStateEntry {
  key: number
  value: unknown
}

interface DockState {
  tabs: AppShellTabDescriptor[]
  activeTabId: string | null
  tabStateById: Record<string, TabStateEntry>
}

/**
 * appShellTabPanelController 的 React 移植。
 * Codex 还有 closeOtherTabs / closeTabsToRight / moveTabTo / activateAdjacentTab /
 * recordTabMoved / receiveMovedTab(tab 右键菜单与跨面板移动用),本轮未接,先不实现。
 */
export interface AppShellTabPanelController {
  panelId: PanelDock
  tabs: AppShellTabDescriptor[]
  activeTabId: string | null
  activeTab: AppShellTabDescriptor | null
  /** 打开 tab(同 tabId 去重并激活;预览 tab 会被新预览 tab 替换);同时展开目标面板 */
  openTab(
    descriptor: AppShellTabDescriptorInput,
    opts?: { activate?: boolean; insertAfterTabId?: string }
  ): string
  closeTab(tabId: string): void
  /** 关闭当前激活 tab(⌘W 系命令走它) */
  closeActiveTab(): void
  activateTab(tabId: string): void
  /** 把预览 tab 转正(双击 / 面板内交互触发) */
  pinTab(tabId: string): void
  /** dnd 重排:把 fromId 插到 toId 的位置(Codex `reorderTab`) */
  reorderTab(fromId: string, toId: string): void
  /** 更新 tab 元信息;允许改 tabId(Files tab 选中文件后 id 跟随路径,实测行为) */
  updateTab(tabId: string, patch: Partial<AppShellTabDescriptor>): void
  tabStateById: Record<string, TabStateEntry>
  setTabState(tabId: string, next: unknown | ((prev: unknown) => unknown)): void
}

/* ==================== 槽位注册(Codex `KP`,app-initial:228814) ==================== */

/**
 * RightPanelTabsEmptyState 等组件本身渲染 null,把 children 写进这里,
 * AppShellTabs 渲染时读出。slot key 以 Codex 的组件名命名(atom 名 hUn/dUn/… 是压缩名)。
 */
export type AppShellSlotKey =
  | 'rightPanelTabsEmptyState'
  | 'rightPanelOutlet'
  | 'rightPanelTabListBefore'
  | 'rightPanelTabListAfter'
  | 'rightPanelTabListAfterSticky'
  | 'bottomPanelTabsEmptyState'
  | 'bottomPanelOutlet'
  | 'bottomPanelTabListBefore'
  | 'bottomPanelTabListAfter'
  | 'bottomPanelTabListAfterSticky'

/* ==================== Context ==================== */

interface AppShellContextValue {
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
  /** 右面板拖拽;拖过折叠阈值会直接关面板(Codex setSize 的 t=false 分支) */
  setRightPanelWidth(desired: number): void
  /** 拖拽结束:按当前宽度持久化 ratio(Codex `MHn`) */
  commitRightPanelWidth(): void
  /** 主内容区可用宽(shell − sidebar),右面板 max 公式的输入 */
  mainContentWidth: number
  /** header 左右槽的实测宽(Codex `headerLeftWidth`/`headerRightWidth`),AppShellHeader 量了写进来 */
  headerLeftWidth: number
  headerRightWidth: number
  setHeaderSlotWidth(side: 'start' | 'end', width: number): void
  rightPanelController: AppShellTabPanelController
  bottomPanelController: AppShellTabPanelController
  slots: Partial<Record<AppShellSlotKey, ReactNode>>
  registerSlot(key: AppShellSlotKey, node: ReactNode): void
  unregisterSlot(key: AppShellSlotKey): void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

/** Codex tabId 规则 */
export function fileTabId(path: string): string {
  return `file:local:${path}`
}
export function newBrowserTabId(): string {
  return crypto.randomUUID()
}

function emptyDock(): DockState {
  return { tabs: [], activeTabId: null, tabStateById: {} }
}

export function AppShellProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)
  const [rightPanelWidthMode, setRightPanelWidthMode] = useState<'regular' | 'full'>('regular')
  const [docks, setDocks] = useState<Record<PanelDock, DockState>>({
    right: emptyDock(),
    bottom: emptyDock()
  })

  const [sidebarWidth, setSidebarWidthState] = useState(SIDEBAR_DEFAULT_WIDTH)
  // 折叠前的宽度,再次展开时恢复(Codex 也是恢复到折叠前那一档,不是回默认值)
  const [lastSidebarWidth, setLastSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)

  /*
   * 右面板宽度:初始值按 Codex 的优先级 —— 持久化 ratio > 默认公式。
   * ratio 不变、像素随窗口重解,与 Codex 的 motion value 追踪同效。
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

  // header 槽实测宽(Codex 的 headerLeftWidth/headerRightWidth)
  const [headerSlotWidths, setHeaderSlotWidths] = useState({ start: 0, end: 0 })
  const setHeaderSlotWidth = useCallback((side: 'start' | 'end', width: number): void => {
    setHeaderSlotWidths((prev) => (prev[side] === width ? prev : { ...prev, [side]: width }))
  }, [])

  // 槽位注册表
  const [slots, setSlots] = useState<Partial<Record<AppShellSlotKey, ReactNode>>>({})
  const registerSlot = useCallback((key: AppShellSlotKey, node: ReactNode): void => {
    setSlots((prev) => ({ ...prev, [key]: node }))
  }, [])
  const unregisterSlot = useCallback((key: AppShellSlotKey): void => {
    // Codex 的 KP 卸载时写回 null(不是删 key)
    setSlots((prev) => ({ ...prev, [key]: null }))
  }, [])

  // 窗口尺寸跟踪(mainContentWidth / 默认宽公式的输入)
  useEffect(() => {
    const onResize = (): void => setShellSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /*
   * 窗口断点(app-initial:228173-228189):窗口 ≤720(HYr)自动收右面板,
   * 并记下「是自动收的」;回宽到 >720 时自动恢复。用户手动关过就不恢复。
   * ≤960(VYr)联动的是侧栏,不属于本文件本轮范围。
   */
  const [rightPanelAutoClosed, setRightPanelAutoClosed] = useState(false)
  useEffect(() => {
    if (shellSize.w <= 720) {
      if (rightPanelOpen) {
        setRightPanelOpen(false)
        setRightPanelWidthMode('regular')
        setRightPanelAutoClosed(true)
      }
    } else if (rightPanelAutoClosed) {
      setRightPanelAutoClosed(false)
      setRightPanelOpen(true)
    }
  }, [shellSize.w, rightPanelOpen, rightPanelAutoClosed])

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
        // 拖过折叠阈值 = 关闭面板;ratio 保留,重开恢复
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
    setRightPanelAutoClosed(false)
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

  /* ---------- controller 方法(写 docks state;两个 dock 共用一套) ---------- */

  const openTab = useCallback(
    (
      dock: PanelDock,
      descriptor: AppShellTabDescriptorInput,
      opts?: { activate?: boolean; insertAfterTabId?: string }
    ): string => {
      // 打开 tab 时确保目标面板展开(Codex:openTab 配 panelOpen$/setPanelOpen)
      if (dock === 'right') setRightPanelOpen(true)
      else setBottomPanelOpen(true)

      const tabId = descriptor.tabId ?? newBrowserTabId()
      const full: AppShellTabDescriptor = {
        isPreview: false,
        isClosable: true,
        ...descriptor,
        tabId,
        dndId: descriptor.dndId ?? tabId
      }
      const activate = opts?.activate ?? true

      setDocks((prev) => {
        const state = prev[dock]
        const existing = state.tabs.find((t) => t.tabId === tabId)
        if (existing) {
          return activate ? { ...prev, [dock]: { ...state, activeTabId: existing.tabId } } : prev
        }
        let tabs = state.tabs
        if (full.isPreview) {
          // Codex/VSCode 预览语义:同时只有一个预览 tab,新预览替换旧预览
          const previewIdx = tabs.findIndex((t) => t.isPreview)
          tabs =
            previewIdx >= 0 ? tabs.map((t, i) => (i === previewIdx ? full : t)) : [...tabs, full]
        } else if (opts?.insertAfterTabId != null) {
          const at = tabs.findIndex((t) => t.tabId === opts.insertAfterTabId)
          tabs = at >= 0 ? [...tabs.slice(0, at + 1), full, ...tabs.slice(at + 1)] : [...tabs, full]
        } else {
          tabs = [...tabs, full]
        }
        return {
          ...prev,
          [dock]: { ...state, tabs, activeTabId: activate ? tabId : state.activeTabId }
        }
      })
      return tabId
    },
    []
  )

  const closeTab = useCallback((dock: PanelDock, tabId: string): void => {
    setDocks((prev) => {
      const state = prev[dock]
      const tabs = state.tabs.filter((t) => t.tabId !== tabId)
      const tabStateById = { ...state.tabStateById }
      delete tabStateById[tabId]
      const activeTabId =
        state.activeTabId === tabId ? (tabs[tabs.length - 1]?.tabId ?? null) : state.activeTabId
      return { ...prev, [dock]: { ...state, tabs, activeTabId, tabStateById } }
    })
  }, [])

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

  const reorderTab = useCallback((dock: PanelDock, fromId: string, toId: string): void => {
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
    (dock: PanelDock, tabId: string, patch: Partial<AppShellTabDescriptor>): void => {
      setDocks((prev) => {
        const state = prev[dock]
        const nextId = patch.tabId ?? tabId
        // tabId 变更(Files tab 选中文件后 id 跟随路径 —— 实测行为):
        // 若新 id 已被别的 tab 占用,先收掉那个(去重语义与 openTab 一致;此分支实测不到,属推断)
        let tabs = state.tabs.filter((t) => t.tabId === tabId || t.tabId !== nextId)
        tabs = tabs.map((t) => (t.tabId === tabId ? { ...t, ...patch, tabId: nextId } : t))
        const tabStateById = { ...state.tabStateById }
        if (nextId !== tabId && tabStateById[tabId]) {
          tabStateById[nextId] = tabStateById[tabId]
          delete tabStateById[tabId]
        }
        return {
          ...prev,
          [dock]: {
            ...state,
            tabs,
            tabStateById,
            activeTabId: state.activeTabId === tabId ? nextId : state.activeTabId
          }
        }
      })
    },
    []
  )

  const setTabState = useCallback(
    (dock: PanelDock, tabId: string, next: unknown | ((prev: unknown) => unknown)): void => {
      setDocks((prev) => {
        const state = prev[dock]
        const tab = state.tabs.find((t) => t.tabId === tabId)
        if (!tab) return prev
        const entry = state.tabStateById[tabId]
        const prevValue = entry == null ? tab.defaultState?.() : entry.value
        const value =
          typeof next === 'function' ? (next as (p: unknown) => unknown)(prevValue) : next
        if (Object.is(value, prevValue) && entry != null) return prev
        return {
          ...prev,
          [dock]: {
            ...state,
            tabStateById: {
              ...state.tabStateById,
              [tabId]: { key: entry?.key ?? 0, value }
            }
          }
        }
      })
    },
    []
  )

  const closeActiveTab = useCallback(
    (dock: PanelDock): void => {
      const active = docks[dock].activeTabId
      if (active != null) closeTab(dock, active)
    },
    [docks, closeTab]
  )

  /** 组装单个 dock 的 controller(Codex `d1n` 工厂的产物) */
  const buildController = useCallback(
    (dock: PanelDock): AppShellTabPanelController => {
      const state = docks[dock]
      return {
        panelId: dock,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        activeTab: state.tabs.find((t) => t.tabId === state.activeTabId) ?? null,
        openTab: (descriptor, opts) => openTab(dock, descriptor, opts),
        closeTab: (tabId) => closeTab(dock, tabId),
        closeActiveTab: () => closeActiveTab(dock),
        activateTab: (tabId) => activateTab(dock, tabId),
        pinTab: (tabId) => pinTab(dock, tabId),
        reorderTab: (fromId, toId) => reorderTab(dock, fromId, toId),
        updateTab: (tabId, patch) => updateTab(dock, tabId, patch),
        tabStateById: state.tabStateById,
        setTabState: (tabId, next) => setTabState(dock, tabId, next)
      }
    },
    [
      docks,
      openTab,
      closeTab,
      closeActiveTab,
      activateTab,
      pinTab,
      reorderTab,
      updateTab,
      setTabState
    ]
  )

  const rightPanelController = useMemo(() => buildController('right'), [buildController])
  const bottomPanelController = useMemo(() => buildController('bottom'), [buildController])

  const value = useMemo<AppShellContextValue>(
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
      headerLeftWidth: headerSlotWidths.start,
      headerRightWidth: headerSlotWidths.end,
      setHeaderSlotWidth,
      rightPanelController,
      bottomPanelController,
      slots,
      registerSlot,
      unregisterSlot
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
      headerSlotWidths,
      setHeaderSlotWidth,
      rightPanelController,
      bottomPanelController,
      slots,
      registerSlot,
      unregisterSlot
    ]
  )

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext)
  if (!ctx) throw new Error('useAppShell must be used within AppShellProvider')
  return ctx
}

/**
 * Codex `KP`(app-initial:228814)的移植:把 children 注册进槽位,
 * 本组件渲染 null;卸载时槽位写回 null。必须在 layout effect 里写,
 * 与 Codex 一致(避免面板先读到空槽闪一帧)。
 */
export function useRegisterAppShellSlot(key: AppShellSlotKey, node: ReactNode): void {
  const { registerSlot, unregisterSlot } = useAppShell()
  useLayoutEffect(() => {
    registerSlot(key, node)
  }, [key, node, registerSlot])
  useLayoutEffect(() => {
    return () => unregisterSlot(key)
  }, [key, unregisterSlot])
}

/** 读槽位内容(AppShellTabs 用) */
export function useAppShellSlot(key: AppShellSlotKey): ReactNode {
  return useAppShell().slots[key] ?? null
}
