/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useMotionValue, type MotionValue } from 'framer-motion'
import { usePanelReveal } from '../utils/usePanelReveal'
import type { AppContextMenuItem } from '../components/menu/AppContextMenu'

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
 * renderPanel 是面板内容的渲染入口(Codex 里是被 N() 包成 createElement 的组件,
 * N 还会把描述符的 props 展开进面板 props;WS 用闭包捕获等价表达,不单列 props 字段)。
 *
 * 泛型 S 默认 any:Codex 的 store 是无类型的,一个 dock 里混放不同 state 形状的 tab,
 * 严格 unknown 泛型会被 TS 逆变卡住;边界上放弃这层静态安全(store 值本来就是 unknown)。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 见上方注释
export interface AppShellTabDescriptor<S = any> {
  /** Codex 实测:review=`diff`;file=`file:local:<path>`(空 path 时为 `file:local:`);browser=随机 UUID */
  tabId: string
  /** dnd 用的稳定 id(Codex `dndId`),默认同 tabId;preview 被替换时新 tab 继承它 */
  dndId: string
  /**
   * Codex `kind`(如 `workspaceFile:local`):activeTabReactKey 的基底 ——
   * key = `${kind ?? tabId}-${stateKey}`,同 kind 的 tab 之间切换**不重挂载**面板。
   */
  kind?: string
  title: string
  icon?: ReactNode
  /** 预览 tab:斜体标题;再开别的预览 tab 会替换它;双击 tab 或在面板内交互即 pin 转正 */
  isPreview: boolean
  isClosable: boolean
  tooltip?: string
  requiresWorkspaceReady?: boolean
  /** tabState 初始值(Codex `defaultState`) */
  defaultState?: () => S
  /** Codex `resetState`:resetTabState 时在现有值上收敛(如清滚动位置);没有则回 defaultState */
  resetState?: (prev: S) => S
  /**
   * Codex `contextMenuItems`:tab 右键菜单里描述符自带的项(在 Close 组之前);
   * 可以直接给数组,也可以返回 Promise(如文件 tab 需要先取 open targets)。
   */
  contextMenuItems?: () => AppContextMenuItem[] | Promise<AppContextMenuItem[]>
  /**
   * Codex `onBeforeClose`:关闭前否决钩子 —— 返回 false 阻止关闭
   * (side chat 的关闭确认弹窗用它:否决 → 弹窗 → 确认后清掉钩子再关)。
   */
  onBeforeClose?: () => boolean
  /** Codex `onClose`:tab 被关闭后回调(side chat 用它丢弃会话) */
  onClose?: () => void
  renderPanel(props: AppShellTabRenderProps<S>): ReactNode
}

/** openTab 的输入:tabId/dndId/isPreview/isClosable 可省(按 Codex 规则补默认) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同 AppShellTabDescriptor
export type AppShellTabDescriptorInput<S = any> = Omit<
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
 * recordTabMoved / receiveMovedTab(tab 右键菜单与跨面板移动用;右键菜单触发点未取证),
 * 本轮未接,先不实现。
 */
export interface AppShellTabPanelController {
  panelId: PanelDock
  tabs: AppShellTabDescriptor[]
  activeTabId: string | null
  activeTab: AppShellTabDescriptor | null
  /**
   * Codex `activeTabReactKey$` = `${kind ?? tabId}-${tabState.key}`:
   * 用作 tabpanel 的 React key —— resetTabState 或跨 kind/tabId 切换时重挂载,
   * 同 kind 的 tab 之间切换保持挂载(文件树选中不丢滚动等内部状态就靠这个)。
   */
  activeTabReactKey: string | null
  /**
   * 打开 tab(同 tabId 去重并激活;预览 tab 会被新预览 tab 替换)。
   * **仅当 activate !== false 时才展开目标面板**(Codex openTab 里 `s && n(t, !0)`)。
   */
  openTab(
    descriptor: AppShellTabDescriptorInput,
    opts?: { activate?: boolean; insertAfterTabId?: string }
  ): string
  closeTab(tabId: string): void
  /** 关闭当前激活 tab(⌘W 系命令走它);面板关闭中或 tab 不可关时不动作(Codex `T`) */
  closeActiveTab(): void
  activateTab(tabId: string): void
  /** 把预览 tab 转正(双击 / 面板内交互触发) */
  pinTab(tabId: string): void
  /** dnd 重排:把 fromId 插到 toId 的位置(Codex `reorderTab`) */
  reorderTab(fromId: string, toId: string): void
  /** 更新 tab 元信息;允许改 tabId(Files tab 选中文件后 id 跟随路径,实测行为) */
  updateTab(tabId: string, patch: Partial<AppShellTabDescriptor>): void
  /** Codex `closeOtherTabs`:关闭除指定 tab 外所有可关 tab */
  closeOtherTabs(tabId: string): void
  /** Codex `closeTabsToRight`:关闭指定 tab 右侧所有可关 tab */
  closeTabsToRight(tabId: string): void
  /** Codex `resetTabState`:key 自增(触发 tabpanel 重挂载)+ 值收敛 */
  resetTabState(tabId: string): void
  tabStateById: Record<string, TabStateEntry>
  setTabState(tabId: string, next: unknown | ((prev: unknown) => unknown)): void
}

/* ==================== 文件树(右面板 Files/Review 共用,Codex `dD`/`CWn`) ====================
 *
 * Codex:树的开合是**全局持久化 boolean**(localStorage `app-shell-file-tree-open`,
 * 默认 false;`tWn`),宽度是全局内存值(默认 250,`CWn`)——不跟 tab 走。
 * 拖拽/开合规则见 WorkspaceTreePane(Codex `hyo`)。
 */
export const FILE_TREE_DEFAULT_WIDTH = 250
/** Codex `byo` —— 最小宽 */
export const FILE_TREE_MIN_WIDTH = 200
/** Codex `WHn(200)` —— 拖过此宽度直接收起 */
export const FILE_TREE_COLLAPSE_AT = FILE_TREE_MIN_WIDTH * 0.5
/** Codex `yyo` —— 最大宽 = 面板宽的比例上限 */
export const FILE_TREE_MAX_RATIO = 0.6
const FILE_TREE_OPEN_STORAGE_KEY = 'app-shell-file-tree-open'

function readStoredFileTreeOpen(): boolean {
  try {
    return localStorage.getItem(FILE_TREE_OPEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeStoredFileTreeOpen(open: boolean): void {
  try {
    localStorage.setItem(FILE_TREE_OPEN_STORAGE_KEY, String(open))
  } catch {
    /* 静默 */
  }
}

/* ==================== 底部面板高度(Codex `LPr`/`BPr`/`VPr`) ====================
 *
 * 默认 280(BPr);clamp:max(160, min(h, mainContentHeight * 0.5))(LPr);
 * 拖过 WHn(160) = 80 直接关面板;onResizeEnd 持久化(zPr)。
 * 持久化 key 不版本化:`app-shell:bottom-panel-height`,存像素(Codex 同)。
 */
export const BOTTOM_PANEL_DEFAULT_HEIGHT = 280
export const BOTTOM_PANEL_MIN_HEIGHT = 160
export const BOTTOM_PANEL_COLLAPSE_AT = BOTTOM_PANEL_MIN_HEIGHT * 0.5
const BOTTOM_PANEL_HEIGHT_STORAGE_KEY = 'app-shell:bottom-panel-height'

/** Codex `LPr`:高度 clamp */
export function clampBottomPanelHeight(desired: number, mainContentHeight: number): number {
  if (!Number.isFinite(desired)) return BOTTOM_PANEL_DEFAULT_HEIGHT
  return Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.min(desired, mainContentHeight * 0.5))
}

function readStoredBottomHeight(): number | null {
  try {
    const raw = localStorage.getItem(BOTTOM_PANEL_HEIGHT_STORAGE_KEY)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeStoredBottomHeight(height: number): void {
  try {
    localStorage.setItem(BOTTOM_PANEL_HEIGHT_STORAGE_KEY, String(height))
  } catch {
    /* 静默 */
  }
}

/* ==================== 槽位注册(Codex `KP`,app-initial:228814) ==================== */

/**
 * RightPanelTabsEmptyState 等组件本身渲染 null,把 children 写进这里,
 * AppShellTabs 渲染时读出。slot key 以 Codex 的组件名命名(atom 名 hUn/dUn/… 是压缩名)。
 */
export type AppShellSlotKey =
  /**
   * header 中段的内容(Codex `$P.Header` → atom `CUn`)。
   * 单节点、后写覆盖:同时只有一个路由在渲染 header 内容。
   */
  | 'header'
  | 'rightPanelTabsEmptyState'
  | 'rightPanelOutlet'
  | 'rightPanelTabListBefore'
  | 'rightPanelTabListAfter'
  | 'rightPanelTabListAfterSticky'
  | 'bottomPanelTabsEmptyState'
  | 'bottomPanelOutlet'
  | 'bottomPanelTabListAfter'
  | 'bottomPanelTabListAfterSticky'

/* ==================== header 动作注册表(Codex `$P.HeaderAction`) ==================== */

/**
 * 一条 header 动作(Codex `QYr` 写进 `LUn[slotPosition]` 的那个 map)。
 *
 * Codex 有三份注册表(`LUn = {center: kUn, left: AUn, right: jUn}`):
 * center 是 header 中段(围着 Header 内容排),left/right 是两侧的固定槽。
 * 本项目只接 center —— 两侧槽的按钮(侧栏开关/前进后退/面板开关)现在还是
 * AppShellHeader 里写死的,改成注册制是独立一步。
 *
 * `align` 决定落在中段的哪一组(Codex 的 `h`/`g`/`_` 三组:
 * start 贴着 Header 内容右侧、center 是横跨整宽居中的一层、end 靠右)。
 */
export interface HeaderActionEntry {
  actionId: string
  align: 'start' | 'center' | 'end'
  /** 同组内升序(Codex `sort((a,b) => a.order - b.order)`) */
  order: number
  node: ReactNode
}

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
  /** 底部面板高度(Codex `bottomPanelHeight` 语义;拖拽中实时) */
  bottomPanelHeight: number
  /** 底部面板拖拽;拖过折叠阈值(80)直接关面板 */
  setBottomPanelHeight(desired: number): void
  /** 拖拽结束:持久化高度(Codex `zPr`) */
  commitBottomPanelHeight(): void
  /**
   * header 左右槽的**内容自然宽**(Codex `headerLeftWidth`/`headerRightWidth`,
   * 都是 MotionValue)。AppShellHeader 的不可见测量副本量出来直接 `.set()`,
   * 不过 React —— 它每帧都可能变(字体加载、按钮增减),走 state 会白白重渲染整棵树。
   *
   * 消费方:header 槽的 `min-width`、右面板 tab strip 两端的 header 让位 spacer。
   */
  headerLeftWidth: MotionValue<number>
  headerRightWidth: MotionValue<number>
  /**
   * 两个面板的**动画宽度**(Codex `leftPanelAnimatedWidth`/`rightPanelAnimatedWidth`)。
   * = clamp01(开合 progress) × 目标宽度,折叠时为 0。
   *
   * 这两个值是 header 槽 `width` 的唯一来源 —— Codex 的 header 是 `fixed inset-x-0`
   * 横跨整窗,靠两端槽各自预留一个面板的宽度,中段(标题 + 三点菜单)才落在
   * 两个面板之间的净跨度里。少了这一步标题就从侧栏上方开始。
   */
  leftPanelAnimatedWidth: MotionValue<number>
  rightPanelAnimatedWidth: MotionValue<number>
  /**
   * 侧栏宽度的原始 MotionValue(Codex `leftPanelWidth`)。
   * 拖拽中由 LeftPanelFrame 直写,不过 React;收手才提交一次 state。
   */
  leftPanelWidth: MotionValue<number>
  /** 右面板开合 progress(Codex `hWn`):aside 的 opacity 直接用它 */
  rightPanelProgress: MotionValue<number>
  /** 右面板是否仍需挂载(关闭动画播完才 false,Codex `UPr` 的 isMounted) */
  rightPanelMounted: boolean
  rightPanelController: AppShellTabPanelController
  bottomPanelController: AppShellTabPanelController
  /** Codex `dD`:文件树全局开合(持久化) */
  fileTreeOpen: boolean
  /** Codex `CWn`:文件树宽度(内存值,默认 250) */
  fileTreeWidth: number
  /** Codex `$Un(scope, !w)`:开合切换(Toggle file tree 按钮 / ⌘⇧E) */
  toggleFileTree(): void
  /** Codex `$Un(scope, open, {animate})`:直接设开合(开空文件 tab 时强制展开树) */
  setFileTreeOpen(open: boolean): void
  /** 拖拽设置宽度(Codex hyo 的 setSize:低于折叠阈值收起,否则 clamp) */
  setFileTreeWidth(desired: number, containerWidth: number): void
  slots: Partial<Record<AppShellSlotKey, ReactNode>>
  registerSlot(key: AppShellSlotKey, node: ReactNode): void
  unregisterSlot(key: AppShellSlotKey): void
  /** header 中段的动作,已按 order 升序 */
  headerActions: HeaderActionEntry[]
  registerHeaderAction(entry: HeaderActionEntry): void
  unregisterHeaderAction(actionId: string): void
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
  // Codex `dD`/`CWn`:文件树开合(持久化,默认 false)与宽度(内存,默认 250)
  const [fileTreeOpen, setFileTreeOpenState] = useState(readStoredFileTreeOpen)
  const [fileTreeWidth, setFileTreeWidthState] = useState(FILE_TREE_DEFAULT_WIDTH)
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

  /*
   * 右面板宽度(kJr,app-initial:226886):
   * **full 模式 = mainContentWidth 全宽**(`n ? t : PHn(r, t, u)` —— 不读 ratio);
   * regular 模式 = 持久化 ratio 重解 > 默认公式。
   */
  const [rightPanelRatio, setRightPanelRatio] = useState<number>(() => readStoredRatio() ?? -1)
  const rightPanelWidth =
    rightPanelWidthMode === 'full'
      ? mainContentWidth
      : rightPanelRatio >= 0
        ? rightPanelRatioToWidth(rightPanelRatio, mainContentWidth, rightPanelWidthMode)
        : defaultRightPanelWidth(mainContentWidth, shellSize.h)

  // header 槽实测宽(Codex 的 headerLeftWidth/headerRightWidth —— MotionValue,不进 state)
  const headerLeftWidth = useMotionValue(0)
  const headerRightWidth = useMotionValue(0)

  /*
   * 面板几何的 MotionValue 层 —— 对齐 Codex app shell 根(`AYr`)持有的那几个值:
   *
   *   I  = leftPanelWidth            原始宽度(拖拽中直写)
   *   B  = leftPanelAnimatedWidth    = UPr({size: I, isVisible}).animatedSize
   *   oe = rightPanelAnimatedWidth   = kJr(...) 里的 clamp01(progress) × width
   *
   * **折叠时 size 必须仍是折叠前的宽度**:`sidebarWidth` 折叠即变 0,直接喂给
   * usePanelReveal 会让关闭动画瞬间跳完(progress 还在 1,size 已经 0)。
   * 所以这里用 `sidebarOpen ? sidebarWidth : lastSidebarWidth` —— 与 Codex 的
   * `I`(持久化宽度,折叠只翻 `oD` 布尔而不写宽度)语义一致。
   */
  const sidebarVisibleWidth = sidebarOpen ? sidebarWidth : lastSidebarWidth
  const leftPanelWidth = useMotionValue(sidebarVisibleWidth)
  const rightPanelWidthMV = useMotionValue(rightPanelWidth)
  useEffect(() => {
    // 拖拽期间 state 不变,所以这个 effect 不会把手动写进去的值冲掉
    leftPanelWidth.set(sidebarVisibleWidth)
  }, [sidebarVisibleWidth, leftPanelWidth])
  useEffect(() => {
    rightPanelWidthMV.set(rightPanelWidth)
  }, [rightPanelWidth, rightPanelWidthMV])

  const { animatedSize: leftPanelAnimatedWidth } = usePanelReveal({
    size: leftPanelWidth,
    isVisible: sidebarOpen
  })
  const {
    progress: rightPanelProgress,
    animatedSize: rightPanelAnimatedWidth,
    isMounted: rightPanelMounted
  } = usePanelReveal({ size: rightPanelWidthMV, isVisible: rightPanelOpen })

  // 底部面板高度:持久化像素 > 默认 280;clamp 随窗口高度走(Codex LPr 的 r = mainContentHeight)
  const [bottomPanelHeight, setBottomPanelHeightState] = useState(() =>
    clampBottomPanelHeight(
      readStoredBottomHeight() ?? BOTTOM_PANEL_DEFAULT_HEIGHT,
      window.innerHeight
    )
  )
  const setBottomPanelHeight = useCallback((desired: number): void => {
    // Codex setSize:t < WHn(160) → rD(a, !1) 直接关面板
    if (desired < BOTTOM_PANEL_COLLAPSE_AT) {
      setBottomPanelOpen(false)
      return
    }
    setBottomPanelHeightState(clampBottomPanelHeight(desired, window.innerHeight))
  }, [])
  const commitBottomPanelHeight = useCallback((): void => {
    setBottomPanelHeightState((h) => {
      writeStoredBottomHeight(clampBottomPanelHeight(h, window.innerHeight))
      return h
    })
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

  /*
   * header 动作注册表(Codex `kUn` 的 ids$ + byId 两个 atom 合成一份数组)。
   * 注册顺序不决定渲染顺序 —— 渲染前按 order 升序排。
   */
  const [headerActionMap, setHeaderActionMap] = useState<Record<string, HeaderActionEntry>>({})
  const registerHeaderAction = useCallback((entry: HeaderActionEntry): void => {
    setHeaderActionMap((prev) => ({ ...prev, [entry.actionId]: entry }))
  }, [])
  const unregisterHeaderAction = useCallback((actionId: string): void => {
    setHeaderActionMap((prev) => {
      if (prev[actionId] == null) return prev
      const next = { ...prev }
      delete next[actionId]
      return next
    })
  }, [])
  const headerActions = useMemo(
    () => Object.values(headerActionMap).sort((a, b) => a.order - b.order),
    [headerActionMap]
  )

  /*
   * 窗口尺寸跟踪 + 断点联动(app-initial:228173-228189):窗口 ≤720(HYr)自动收右面板
   * 并记下「是自动收的」,回宽 >720 时自动恢复(用户手动关过就不恢复);
   * ≤960(VYr)联动的是侧栏,不在本轮范围。
   * 全部在 resize 事件回调里做(外部系统同步),effect body 里不放 setState。
   */
  const rightPanelAutoClosedRef = useRef(false)
  useEffect(() => {
    const onResize = (): void => {
      setShellSize({ w: window.innerWidth, h: window.innerHeight })
      if (window.innerWidth <= 720) {
        if (rightPanelOpen) {
          setRightPanelOpen(false)
          setRightPanelWidthMode('regular')
          rightPanelAutoClosedRef.current = true
        }
      } else if (rightPanelAutoClosedRef.current) {
        rightPanelAutoClosedRef.current = false
        setRightPanelOpen(true)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [rightPanelOpen])

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
    // 手动开关后不再参与「窗口变宽自动恢复」
    rightPanelAutoClosedRef.current = false
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

  // Codex `hyo` 的 setSize:`e < WHn(byo)` → 收起;否则 clamp(200, max(200, 容器*0.6))
  const setFileTreeWidth = useCallback((desired: number, containerWidth: number): void => {
    if (desired < FILE_TREE_COLLAPSE_AT) {
      setFileTreeOpenState(false)
      writeStoredFileTreeOpen(false)
      return
    }
    const max = Math.max(FILE_TREE_MIN_WIDTH, containerWidth * FILE_TREE_MAX_RATIO)
    setFileTreeWidthState(Math.min(Math.max(desired, FILE_TREE_MIN_WIDTH), max))
  }, [])

  const toggleFileTree = useCallback((): void => {
    setFileTreeOpenState((open) => {
      writeStoredFileTreeOpen(!open)
      return !open
    })
  }, [])

  const setFileTreeOpen = useCallback((open: boolean): void => {
    writeStoredFileTreeOpen(open)
    setFileTreeOpenState(open)
  }, [])

  /* ---------- controller 方法(写 docks state;两个 dock 共用一套) ---------- */

  /** 关闭面板(right/bottom 各走各的;Codex iD(e,false):$E=false 退出全宽) */
  const closePanel = useCallback((dock: PanelDock): void => {
    if (dock === 'right') {
      setRightPanelOpen(false)
      setRightPanelWidthMode('regular')
    } else {
      setBottomPanelOpen(false)
    }
  }, [])

  const openTab = useCallback(
    (
      dock: PanelDock,
      descriptor: AppShellTabDescriptorInput,
      opts?: { activate?: boolean; insertAfterTabId?: string }
    ): string => {
      const activate = opts?.activate ?? true
      // Codex openTab:只有激活时才展开面板(`s && (g(t, R, P), n(t, !0), …)`)
      if (activate) {
        if (dock === 'right') setRightPanelOpen(true)
        else setBottomPanelOpen(true)
      }

      const tabId = descriptor.tabId ?? newBrowserTabId()
      const full: AppShellTabDescriptor = {
        isPreview: false,
        isClosable: true,
        ...descriptor,
        tabId,
        dndId: descriptor.dndId ?? tabId
      }

      setDocks((prev) => {
        const state = prev[dock]
        const existing = state.tabs.find((t) => t.tabId === tabId)
        if (existing) {
          // 幂等:已存在且已是 active → 返回 prev(不产生新 state,
          // 避免树选中回调 → openTab → 重渲染 → 再回调的嵌套更新风暴)
          if (state.activeTabId === existing.tabId) return prev
          return activate ? { ...prev, [dock]: { ...state, activeTabId: existing.tabId } } : prev
        }
        let tabs = state.tabs
        let tabStateById = state.tabStateById
        if (full.isPreview) {
          // Codex/VSCode 预览语义:同时只有一个预览 tab,新预览替换旧预览(Codex `h`)
          const previewIdx = tabs.findIndex((t) => t.isPreview)
          if (previewIdx >= 0) {
            const replaced = tabs[previewIdx]
            // 新 tab **继承被替换 tab 的 dndId**(Codex:`c = s == null ? o : { ...o, dndId: s.dndId }`),
            // 位置与拖拽身份都不变;旧 tab 的 state 一并清掉(Codex `w` 里 set(o, tabId, null))
            const descriptor2 = { ...full, dndId: replaced.dndId }
            tabs = tabs.map((t, i) => (i === previewIdx ? descriptor2 : t))
            tabStateById = { ...tabStateById }
            delete tabStateById[replaced.tabId]
          } else {
            tabs = [...tabs, full]
          }
        } else if (opts?.insertAfterTabId != null) {
          const at = tabs.findIndex((t) => t.tabId === opts.insertAfterTabId)
          tabs = at >= 0 ? [...tabs.slice(0, at + 1), full, ...tabs.slice(at + 1)] : [...tabs, full]
        } else {
          tabs = [...tabs, full]
        }
        return {
          ...prev,
          [dock]: {
            ...state,
            tabs,
            tabStateById,
            activeTabId: activate ? tabId : state.activeTabId
          }
        }
      })
      return tabId
    },
    []
  )

  const closeTab = useCallback(
    (dock: PanelDock, tabId: string): void => {
      // Codex:tab 描述符可挂 onBeforeClose 否决关闭(返回 false)
      const tab = docks[dock].tabs.find((t) => t.tabId === tabId)
      if (tab?.onBeforeClose != null && tab.onBeforeClose() === false) return
      let closedLast = false
      setDocks((prev) => {
        const state = prev[dock]
        const closedIndex = state.tabs.findIndex((t) => t.tabId === tabId)
        if (closedIndex === -1) return prev
        const tabs = state.tabs.filter((t) => t.tabId !== tabId)
        const tabStateById = { ...state.tabStateById }
        delete tabStateById[tabId]
        // 下一个激活 tab(Codex `f1n` = opener 链 ?? `p1n`):p1n = **右邻居优先**,否则左邻居
        const activeTabId =
          state.activeTabId === tabId
            ? (state.tabs[closedIndex + 1]?.tabId ?? state.tabs[closedIndex - 1]?.tabId ?? null)
            : state.activeTabId
        // Codex `S`:h.length === 0 && setPanelOpen(false) —— 关掉最后一个 tab 会连面板一起关
        closedLast = tabs.length === 0
        return { ...prev, [dock]: { ...state, tabs, activeTabId, tabStateById } }
      })
      // Codex:tab 描述符的 onClose 在关闭后调用(丢弃资源等)
      tab?.onClose?.()
      if (closedLast) closePanel(dock)
    },
    [closePanel, docks]
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
        const current = state.tabs.find((t) => t.tabId === tabId)
        if (current == null) return prev
        // Codex `p`:patch 带 isPreview:true 而 tab 已非 preview 时强制剥掉 —— updateTab 不能反 pin
        const safePatch =
          patch.isPreview === true && !current.isPreview ? { ...patch, isPreview: false } : patch
        const nextId = safePatch.tabId ?? tabId
        // tabId 变更(Files tab 选中文件后 id 跟随路径 —— 实测行为):
        // 若新 id 已被别的 tab 占用,先收掉那个(去重语义与 openTab 一致;此分支实测不到,属推断)
        let tabs = state.tabs.filter((t) => t.tabId === tabId || t.tabId !== nextId)
        tabs = tabs.map((t) => (t.tabId === tabId ? { ...t, ...safePatch, tabId: nextId } : t))
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

  /** Codex `A`:resetTabState —— key 自增 + 值收敛(resetState ?? defaultState) */
  const resetTabState = useCallback((dock: PanelDock, tabId: string): void => {
    setDocks((prev) => {
      const state = prev[dock]
      const tab = state.tabs.find((t) => t.tabId === tabId)
      if (!tab) return prev
      const entry = state.tabStateById[tabId]
      const value =
        entry != null && tab.resetState != null
          ? tab.resetState(entry.value as never)
          : (tab.defaultState?.() ?? null)
      return {
        ...prev,
        [dock]: {
          ...state,
          tabStateById: {
            ...state.tabStateById,
            [tabId]: { key: (entry?.key ?? 0) + 1, value }
          }
        }
      }
    })
  }, [])

  const closeActiveTab = useCallback(
    (dock: PanelDock): void => {
      // Codex `T`:面板未开 / 无 active / active 不可关 → 不动作
      const open = dock === 'right' ? rightPanelOpen : bottomPanelOpen
      const active = docks[dock].tabs.find((t) => t.tabId === docks[dock].activeTabId)
      if (!open || active == null || !active.isClosable) return
      closeTab(dock, active.tabId)
    },
    [docks, closeTab, rightPanelOpen, bottomPanelOpen]
  )

  /* Codex `closeOtherTabs`/`closeTabsToRight`(app-initial:184276-184278 的方法表):
     批量关闭时按顺序走 closeTab 的同一条路径(最后一个关掉时连面板一起关)。 */
  const closeOtherTabs = useCallback(
    (dock: PanelDock, tabId: string): void => {
      const others = docks[dock].tabs.filter((t) => t.tabId !== tabId && t.isClosable)
      for (const t of others) closeTab(dock, t.tabId)
    },
    [docks, closeTab]
  )

  const closeTabsToRight = useCallback(
    (dock: PanelDock, tabId: string): void => {
      const tabs = docks[dock].tabs
      const index = tabs.findIndex((t) => t.tabId === tabId)
      if (index === -1) return
      for (const t of tabs.slice(index + 1)) {
        if (t.isClosable) closeTab(dock, t.tabId)
      }
    },
    [docks, closeTab]
  )

  /** 组装单个 dock 的 controller(Codex `d1n` 工厂的产物) */
  const buildController = useCallback(
    (dock: PanelDock): AppShellTabPanelController => {
      const state = docks[dock]
      const activeTab = state.tabs.find((t) => t.tabId === state.activeTabId) ?? null
      // Codex activeTabReactKey$ = `${kind ?? tabId}-${tabState.key ?? null}`
      const activeTabReactKey =
        activeTab == null
          ? null
          : `${activeTab.kind ?? activeTab.tabId}-${state.tabStateById[activeTab.tabId]?.key ?? null}`
      return {
        panelId: dock,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        activeTab,
        activeTabReactKey,
        openTab: (descriptor, opts) => openTab(dock, descriptor, opts),
        closeTab: (tabId) => closeTab(dock, tabId),
        closeActiveTab: () => closeActiveTab(dock),
        activateTab: (tabId) => activateTab(dock, tabId),
        pinTab: (tabId) => pinTab(dock, tabId),
        reorderTab: (fromId, toId) => reorderTab(dock, fromId, toId),
        updateTab: (tabId, patch) => updateTab(dock, tabId, patch),
        closeOtherTabs: (tabId) => closeOtherTabs(dock, tabId),
        closeTabsToRight: (tabId) => closeTabsToRight(dock, tabId),
        resetTabState: (tabId) => resetTabState(dock, tabId),
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
      closeOtherTabs,
      closeTabsToRight,
      resetTabState,
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
      bottomPanelHeight,
      setBottomPanelHeight,
      commitBottomPanelHeight,
      headerLeftWidth,
      headerRightWidth,
      leftPanelAnimatedWidth,
      rightPanelAnimatedWidth,
      leftPanelWidth,
      rightPanelProgress,
      rightPanelMounted,
      rightPanelController,
      bottomPanelController,
      fileTreeOpen,
      fileTreeWidth,
      toggleFileTree,
      setFileTreeOpen,
      setFileTreeWidth,
      slots,
      registerSlot,
      unregisterSlot,
      headerActions,
      registerHeaderAction,
      unregisterHeaderAction
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
      bottomPanelHeight,
      setBottomPanelHeight,
      commitBottomPanelHeight,
      headerLeftWidth,
      headerRightWidth,
      leftPanelAnimatedWidth,
      rightPanelAnimatedWidth,
      leftPanelWidth,
      rightPanelProgress,
      rightPanelMounted,
      rightPanelController,
      bottomPanelController,
      fileTreeOpen,
      fileTreeWidth,
      toggleFileTree,
      setFileTreeOpen,
      setFileTreeWidth,
      slots,
      registerSlot,
      unregisterSlot,
      headerActions,
      registerHeaderAction,
      unregisterHeaderAction
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
