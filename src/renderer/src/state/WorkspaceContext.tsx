/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { chatService, workspaceService } from '../services'
import { rpc } from '../rpc/client'
import type { ChatStatus } from '@shared/protocol/entities'
import type { Project, Suggestion } from '../services/workspace/types'
import type { ChatSummary } from '../services/chat/types'
import {
  parseItemKey,
  projectItemKey,
  threadItemKey,
  type CreateProjectInput,
  type ProjectSelection,
  type WorkspaceSnapshot
} from '@shared/workspace/types'

/**
 * Pinned 分节的一项 —— 项目和会话在这里是**同一种东西**的两个形态。
 *
 * Codex 的侧栏状态里 Pinned 存的是一个混合的 itemKey 数组,渲染时按顺序
 * 逐项判断是项目还是会话;WS 之前把两者拆成 pinnedProjects / pinnedChats
 * 两个列表分别渲染,DOM 上就永远是「项目全在前、会话全在后」,拖不到一起。
 */
export type PinnedItem =
  | { key: string; kind: 'project'; project: Project }
  | { key: string; kind: 'thread'; chat: ChatSummary }

/** 侧栏分节 id（WS 命名：pinned / projects / recents） */
export type SidebarSectionId = 'pinned' | 'projects' | 'recents'

/** Codex `sidebar-organize-mode-v1`：按项目分组 ⇄ 平铺成一个列表 */
export type SidebarOrganizeMode = 'project' | 'list'

/**
 * Codex 的排序档（`sidebarElectron.sortMenu.*`）：
 * - `priority` —— 「需要关注的排前」（运行中 / 报错 / 未读），其余按更新时间
 * - `updated_at` —— 纯按更新时间倒序
 * - `manual` —— 手工拖拽顺序（没有手工记录的项回落到更新时间序）
 */
export type SidebarSortMode = 'priority' | 'updated_at' | 'manual'

interface WorkspaceContextValue {
  projects: Project[]
  selection: ProjectSelection
  currentProject: Project | undefined
  /** 会话加载中（首帧为 true，快照里不含会话数据） */
  chatsLoading: boolean
  /** Recents 分区：无项目归属，或所属项目未作为分区显示 */
  recentChats: ChatSummary[]
  /** 平铺模式（organize=list）下 Recents 的全量未置顶会话 */
  flatChats: ChatSummary[]
  /** 置顶会话。落入 Pinned 分区，并从原分区移走（置顶是移动，不是复制） */
  pinnedChats: ChatSummary[]
  /** 置顶项目，按置顶顺序。落入 Pinned 分区，并从 Projects **移走** */
  pinnedProjects: Project[]
  /** 未置顶项目 —— Projects 分区渲染这个，不是 projects 全量 */
  unpinnedProjects: Project[]
  /** Pinned 分区按混合顺序展开的项(项目与会话同级) */
  pinnedItems: PinnedItem[]
  /** Pinned 分区拖拽排序后持久化混合顺序 */
  reorderPinnedItems(itemKeys: string[]): Promise<void>
  /** 项目内会话拖拽排序后持久化顺序 */
  reorderProjectThreads(projectId: string, chatIds: string[]): Promise<void>
  /** 会话改项目归属(拖进项目 / 拖回 Recents),projectId 传 null = 无归属 */
  assignChatToProject(chatId: string, projectId: string | null): Promise<void>
  /** 项目置顶开关 */
  setProjectPinned(projectId: string, pinned: boolean): Promise<void>
  /** 全部会话，供命令面板等跨分区消费 */
  chats: ChatSummary[]
  /** 按项目 id 取该项目下的会话 */
  chatsOfProject(projectId: string): ChatSummary[]
  suggestions: Suggestion[]
  /** 项目展开状态（持久化 —— Codex `sidebar-project-expanded-v1-*`） */
  projectExpanded: Record<string, boolean>
  toggleProject(id: string): void
  collapseAllProjects(): void
  /** 分节折叠状态（持久化 —— Codex `sidebar-collapsed-sections-v1`） */
  collapsedSections: Record<SidebarSectionId, boolean>
  toggleSection(id: SidebarSectionId): void
  /** 组织模式：按项目分组 ⇄ 平铺（持久化 —— Codex `sidebar-organize-mode-v1`） */
  organizeMode: SidebarOrganizeMode
  setOrganizeMode(mode: SidebarOrganizeMode): void
  /** Recents 排序档（持久化；Codex 实测默认 priority） */
  chatSortMode: SidebarSortMode
  setChatSortMode(mode: SidebarSortMode): void
  /** Projects 排序档（持久化；Codex 实测默认 manual） */
  projectSortMode: SidebarSortMode
  setProjectSortMode(mode: SidebarSortMode): void
  /**
   * 未读会话（蓝点的数据源 —— Codex 的 `hasUnreadTurn`）。
   * 后台会话的轮次完成（active → idle/systemError）时标记，打开即清除。
   */
  unreadChatIds: ReadonlySet<string>
  /** 打开/查看会话时清掉未读 —— ChatRuntimeProvider 在 activeChatId 变化时调 */
  markChatRead(chatId: string): void
  /** 同步「当前打开的会话」给未读判定（ChatRuntimeProvider 的 effect 调） */
  noteActiveChat(chatId: string | null): void
  refresh(): Promise<void>
  /** 打开系统目录选择框；用户取消时返回空数组 */
  pickDirectories(): Promise<string[]>
  createProject(input: CreateProjectInput): Promise<void>
  renameProject(projectId: string, name: string): Promise<void>
  /** 拖拽排序后持久化项目顺序 */
  reorderProjects(projectIds: string[]): Promise<void>
  removeProject(projectId: string): Promise<void>
  selectProject(selection: ProjectSelection): Promise<void>
  setChatPinned(chatId: string, pinned: boolean): Promise<void>
  renameChat(chatId: string, name: string): Promise<void>
  archiveChat(chatId: string): Promise<void>
  removeChat(chatId: string): Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

/**
 * 首页建议卡 —— 文案/顺序/配色取自 Codex 实测(4 张,固定不随项目变)。
 * 颜色映射到 --color-token-charts-{blue,purple,green,orange}。
 */
const HOME_SUGGESTIONS: Suggestion[] = [
  { id: 'explore', label: 'Explore and understand code', color: 'blue' },
  { id: 'build', label: 'Build a new feature, app, or tool', color: 'purple' },
  { id: 'review', label: 'Review code and suggest changes', color: 'green' },
  { id: 'fix', label: 'Fix issues and failures', color: 'orange' }
]

/** 宿主不在（预览页）时的空工作区：首帧不至于崩，侧栏显示空态 */
const EMPTY_WORKSPACE: WorkspaceSnapshot = {
  projects: [],
  selection: { type: 'unassigned' },
  pinnedChatIds: [],
  pinnedProjectIds: [],
  pinnedItemKeys: [],
  projectThreadOrder: {},
  chatAssignments: {}
}

/*
 * Codex 侧栏的 UI 态全是持久化 atom（`Th(key, default)`），重载/重启不丢。
 * 键名与 Codex 同名,数据形状按 WS 的 id 体系。
 */
const SIDEBAR_COLLAPSED_SECTIONS_KEY = 'sidebar-collapsed-sections-v1'
const SIDEBAR_PROJECT_EXPANDED_KEY = 'sidebar-project-expanded-v1'
const SIDEBAR_ORGANIZE_MODE_KEY = 'sidebar-organize-mode-v1'
const SIDEBAR_CHAT_SORT_KEY = 'sidebar-chat-sort-mode-v1'
const SIDEBAR_PROJECT_SORT_KEY = 'sidebar-project-sort-mode-v1'
const SIDEBAR_UNREAD_CHATS_KEY = 'sidebar-unread-chats-v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 静默 */
  }
}

/**
 * priority 档的「需要关注」判定 —— 运行中 / 报错 / 未读 的会话排前,
 * 其余按 updatedAt 倒序（「prioritizes tasks needing attention」的直接解读）。
 */
function attentionRank(chat: ChatSummary, unreadChatIds: ReadonlySet<string>): number {
  return chat.status.type === 'active' ||
    chat.status.type === 'systemError' ||
    unreadChatIds.has(chat.id)
    ? 1
    : 0
}

function sortChats(
  list: ChatSummary[],
  mode: SidebarSortMode,
  unreadChatIds: ReadonlySet<string>,
  manualIds?: string[]
): ChatSummary[] {
  if (mode === 'priority') {
    return [...list].sort(
      (a, b) =>
        attentionRank(b, unreadChatIds) - attentionRank(a, unreadChatIds) ||
        b.updatedAt - a.updatedAt
    )
  }
  if (mode === 'manual' && manualIds != null && manualIds.length > 0) {
    const rank = new Map(manualIds.map((id, i) => [id, i]))
    const known = list
      .filter((c) => rank.has(c.id))
      .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
    return [...known, ...list.filter((c) => !rank.has(c.id))]
  }
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function WorkspaceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // preload 已同步取好首屏快照，首帧即有真实项目列表，不出现空列表闪烁
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(
    () => window.electronBridge?.getInitialSidebarBootstrap().workspace ?? EMPTY_WORKSPACE
  )
  const [projectExpanded, setProjectExpanded] = useState<Record<string, boolean>>(() =>
    readJson(SIDEBAR_PROJECT_EXPANDED_KEY, {})
  )
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [chatsLoading, setChatsLoading] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState<Record<SidebarSectionId, boolean>>(
    () =>
      readJson(SIDEBAR_COLLAPSED_SECTIONS_KEY, { pinned: false, projects: false, recents: false })
  )
  const [organizeMode, setOrganizeModeState] = useState<SidebarOrganizeMode>(() =>
    readJson(SIDEBAR_ORGANIZE_MODE_KEY, 'project')
  )
  const [chatSortMode, setChatSortModeState] = useState<SidebarSortMode>(() =>
    readJson(SIDEBAR_CHAT_SORT_KEY, 'priority')
  )
  const [projectSortMode, setProjectSortModeState] = useState<SidebarSortMode>(() =>
    readJson(SIDEBAR_PROJECT_SORT_KEY, 'manual')
  )
  const [unreadChatIds, setUnreadChatIds] = useState<ReadonlySet<string>>(
    () => new Set(readJson<string[]>(SIDEBAR_UNREAD_CHATS_KEY, []))
  )
  /**
   * 当前打开的会话 id —— 由 ChatRuntimeProvider 反向同步进来（noteActiveChat）。
   * 未读判定要用它:正在看的会话轮次完成不算未读。
   */
  const activeChatIdRef = useRef<string | null>(null)

  /**
   * 会话列表随快照重新投影。
   *
   * 置顶与项目归属存在本地注册表里，快照一变（改名/删项目/置顶）都会影响
   * 会话的分区归属，所以这里以快照为输入重新拉取而不是各自维护。
   */
  const loadChats = useCallback(async (current: WorkspaceSnapshot): Promise<void> => {
    try {
      const page = await chatService.listChats(current)
      setChats(page.chats)
    } catch (err) {
      console.error('[workspace] failed to load chats:', err)
    } finally {
      setChatsLoading(false)
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setSnapshot(await workspaceService.getSnapshot())
  }, [])

  // 通知回调里要用最新的快照重拉列表，但订阅本身不该随快照重建
  const loadChatsRef = useRef<(() => Promise<void>) | null>(null)
  // 拖拽落点回调里要按 id 反查会话的 cwd，但回调不该随会话列表重建
  const chatsRef = useRef<ChatSummary[]>(chats)
  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  // 快照取自 preload 阶段，到组件挂载之间主进程状态可能已变（例如从其他窗口
  // 改了项目）。挂载后拉一次权威状态做校正——首帧仍用快照，不会闪。
  useEffect(() => {
    // setState 发生在 await 之后，不是同步级联渲染
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  // 快照变化时重新投影会话列表（归属与置顶都取自快照）
  useEffect(() => {
    loadChatsRef.current = () => loadChats(snapshot)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChats(snapshot)
  }, [snapshot, loadChats])

  /**
   * 运行状态由通知驱动，不轮询。
   *
   * 列表是拉一次的快照，会话跑起来/停下来只会发通知；不订阅的话侧栏的
   * 进行态指示会一直停在拉取那一刻的值。
   *
   * 未读标记也在这里：后台会话的轮次**完成**（active → idle/systemError）时
   * 打上未读 —— 对应 Codex 的 `hasUnreadTurn`。正在打开的会话不算未读。
   */
  useEffect(() => {
    const offStatus = rpc.on('thread/status/changed', (p) => {
      const { threadId, status } = p as { threadId: string; status: ChatStatus }
      const prev = chatsRef.current.find((c) => c.id === threadId)
      setChats((prevList) =>
        prevList.some((c) => c.id === threadId)
          ? prevList.map((c) => (c.id === threadId ? { ...c, status } : c))
          : prevList
      )
      const wasActive = prev?.status.type === 'active'
      const settled = status.type === 'idle' || status.type === 'systemError'
      if (wasActive && settled && threadId !== activeChatIdRef.current) {
        setUnreadChatIds((prevSet) => {
          if (prevSet.has(threadId)) return prevSet
          const next = new Set(prevSet)
          next.add(threadId)
          writeJson(SIDEBAR_UNREAD_CHATS_KEY, [...next])
          return next
        })
      }
    })
    /**
     * 新会话补拉。
     *
     * 只听 thread/started 不够：那一刻会话还没有任何用户消息，preview 为空，
     * 而服务端的列表查询会过滤掉空 preview 的会话——补拉回来仍然看不到它。
     * 真正让会话"够格"出现在侧栏的是第一条用户消息落库，所以也听
     * item/completed。短时间内的多次触发合并成一次，避免连发时反复拉列表。
     */
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = (): void => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void loadChatsRef.current?.()
      }, 250)
    }
    const offStarted = rpc.on('thread/started', scheduleReload)
    const offItem = rpc.on('item/completed', (p) => {
      const { item } = p as { item: { type?: string } }
      if (item?.type === 'userMessage') scheduleReload()
    })
    const offName = rpc.on('thread/name/updated', scheduleReload)
    return () => {
      if (timer) clearTimeout(timer)
      offStatus()
      offStarted()
      offItem()
      offName()
    }
  }, [])

  const setChatPinned = useCallback(async (chatId: string, pinned: boolean): Promise<void> => {
    setSnapshot(await chatService.setPinned(chatId, pinned))
  }, [])

  const toggleProjectPersisted = useCallback((id: string): void => {
    setProjectExpanded((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) }
      writeJson(SIDEBAR_PROJECT_EXPANDED_KEY, next)
      return next
    })
  }, [])

  const toggleSection = useCallback((id: SidebarSectionId): void => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeJson(SIDEBAR_COLLAPSED_SECTIONS_KEY, next)
      return next
    })
  }, [])

  const setOrganizeMode = useCallback((mode: SidebarOrganizeMode): void => {
    setOrganizeModeState(mode)
    writeJson(SIDEBAR_ORGANIZE_MODE_KEY, mode)
  }, [])

  const setChatSortMode = useCallback((mode: SidebarSortMode): void => {
    setChatSortModeState(mode)
    writeJson(SIDEBAR_CHAT_SORT_KEY, mode)
  }, [])

  const setProjectSortMode = useCallback((mode: SidebarSortMode): void => {
    setProjectSortModeState(mode)
    writeJson(SIDEBAR_PROJECT_SORT_KEY, mode)
  }, [])

  const markChatRead = useCallback((chatId: string): void => {
    setUnreadChatIds((prevSet) => {
      if (!prevSet.has(chatId)) return prevSet
      const next = new Set(prevSet)
      next.delete(chatId)
      writeJson(SIDEBAR_UNREAD_CHATS_KEY, [...next])
      return next
    })
  }, [])

  const noteActiveChat = useCallback(
    (chatId: string | null): void => {
      activeChatIdRef.current = chatId
      // 打开即已读 —— Codex 的 hasUnreadTurn 在查看后轮次即清
      if (chatId != null) markChatRead(chatId)
    },
    [markChatRead]
  )

  const setProjectPinned = useCallback(
    async (projectId: string, pinned: boolean): Promise<void> => {
      setSnapshot(await workspaceService.setProjectPinned(projectId, pinned))
    },
    []
  )

  const renameChat = useCallback(
    async (chatId: string, name: string): Promise<void> => {
      await chatService.rename(chatId, name)
      // 标题不在快照里，改完直接重拉会话列表
      await loadChats(snapshot)
    },
    [loadChats, snapshot]
  )

  const archiveChat = useCallback(async (chatId: string): Promise<void> => {
    await chatService.archive(chatId)
    // 归档后会话从默认列表消失，本地乐观移除避免等一次往返
    setChats((prev) => prev.filter((c) => c.id !== chatId))
  }, [])

  const removeChat = useCallback(async (chatId: string): Promise<void> => {
    const next = await chatService.remove(chatId)
    setChats((prev) => prev.filter((c) => c.id !== chatId))
    setSnapshot(next)
  }, [])

  const pickDirectories = useCallback((): Promise<string[]> => {
    return workspaceService.pickDirectories()
  }, [])

  const createProject = useCallback(async (input: CreateProjectInput): Promise<void> => {
    setSnapshot(await workspaceService.createProject(input))
  }, [])

  const renameProject = useCallback(async (projectId: string, name: string): Promise<void> => {
    setSnapshot(await workspaceService.renameProject(projectId, name))
  }, [])

  const removeProject = useCallback(async (projectId: string): Promise<void> => {
    setSnapshot(await workspaceService.removeProject(projectId))
  }, [])

  const reorderProjects = useCallback(async (projectIds: string[]): Promise<void> => {
    setSnapshot(await workspaceService.reorderProjects(projectIds))
  }, [])

  const selectProject = useCallback(async (selection: ProjectSelection): Promise<void> => {
    setSnapshot(await workspaceService.selectProject(selection))
  }, [])

  const reorderPinnedItems = useCallback(async (itemKeys: string[]): Promise<void> => {
    setSnapshot(await workspaceService.reorderPinnedItems(itemKeys))
  }, [])

  const reorderProjectThreads = useCallback(
    async (projectId: string, chatIds: string[]): Promise<void> => {
      setSnapshot(await workspaceService.reorderProjectThreads(projectId, chatIds))
    },
    []
  )

  /**
   * 会话改项目归属。
   *
   * cwd 是归属推导的事实来源,所以指派要把会话当前的 cwd 一起带上 ——
   * 少了它主进程无法在「取消显式指派」后回落到按 cwd 推导。
   */
  const assignChatToProject = useCallback(
    async (chatId: string, projectId: string | null): Promise<void> => {
      const chat = chatsRef.current.find((c) => c.id === chatId)
      if (chat == null) return
      setSnapshot(await chatService.assignToProject(chatId, projectId, chat.cwd))
    },
    []
  )

  const value = useMemo<WorkspaceContextValue>(() => {
    const { projects, selection } = snapshot
    /*
     * 兜底 ?? [] 不是防御性编程,是**必需**的:preload 阶段的快照可能来自
     * 尚未重启的主进程(vite 只热更渲染层,主进程要手动重启),那份数据没有
     * pinnedProjectIds。少了兜底首帧直接崩在 .map 上,整个 WorkspaceProvider 挂掉。
     */
    const pinnedProjectIds = snapshot.pinnedProjectIds ?? []

    /*
     * 侧栏分区 —— Pinned 同时装**置顶项目**和**置顶会话**（项目排前、会话排后），
     * **两者都从原分区移走**（置顶是"移动"而非"复制"），Pinned 为空时整节不渲染。
     *
     * ⚠️ 判定必须用 **id**。我一度以为置顶会话会在 Recents 保留一份，
     * 那是误判：当时看的 Codex 侧栏里有多条**同名**会话（好几个"跟进监控"），
     * 我只比对了标题列表就下了结论。同名不同 id，一条移走、另一条还在，
     * 看起来就像"没移走"。
     */
    const pinnedProjectIdSet = new Set(pinnedProjectIds)
    const pinnedProjects = pinnedProjectIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is Project => p != null)
    const unpinnedProjects = projects.filter((p) => !pinnedProjectIdSet.has(p.id))

    const shownProjectIds = new Set(projects.map((p) => p.id))
    const pinnedChats: ChatSummary[] = []
    const byProject = new Map<string, ChatSummary[]>()
    const recentChats: ChatSummary[] = []

    for (const chat of chats) {
      // 置顶即移走：进了 Pinned 就不再参与项目/Recents 的归类
      if (chat.pinned) {
        pinnedChats.push(chat)
        continue
      }

      if (chat.projectId && shownProjectIds.has(chat.projectId)) {
        const list = byProject.get(chat.projectId)
        if (list) list.push(chat)
        else byProject.set(chat.projectId, [chat])
      } else {
        // 无归属，或所属项目未作为分区显示——后者不能让会话凭空消失
        recentChats.push(chat)
      }
    }

    /*
     * Pinned 的混合顺序。
     *
     * 主进程给的是一个 itemKey 数组;这里只做「解析 + 查实体」,不做排序 ——
     * 顺序的权威在主进程(拖拽后立刻持久化)。快照缺这个字段时(主进程还没重启)
     * 退化成「项目在前、会话在后」,与旧行为一致。
     */
    const pinnedItemKeys =
      snapshot.pinnedItemKeys ??
      ([
        ...pinnedProjectIds.map(projectItemKey),
        ...pinnedChats.map((c) => threadItemKey(c.id))
      ] as string[])
    const pinnedItems: PinnedItem[] = []
    for (const key of pinnedItemKeys) {
      const parsed = parseItemKey(key)
      if (parsed?.kind === 'project') {
        const project = projects.find((p) => p.id === parsed.projectId)
        if (project) pinnedItems.push({ key, kind: 'project', project })
      } else if (parsed?.kind === 'thread') {
        const chat = pinnedChats.find((c) => c.id === parsed.chatId)
        if (chat) pinnedItems.push({ key, kind: 'thread', chat })
      }
    }

    /*
     * 项目内会话顺序:手工拖过的排前(按手工顺序),其余保持原顺序(按 updatedAt)。
     * 全量记录手工顺序的话新会话会莫名跑到末尾 —— 只记被拖过的那些。
     */
    const projectThreadOrder = snapshot.projectThreadOrder ?? {}
    const orderedChatsOfProject = (projectId: string): ChatSummary[] => {
      const list = byProject.get(projectId) ?? []
      // 项目内会话的排序档 —— Codex 的 projectSortMode(「Sort chats by」)
      return sortChats(list, projectSortMode, unreadChatIds, projectThreadOrder[projectId])
    }

    /* Recents 的排序档 —— Codex 的 chatSortMode;manual 没有手工记录时回落到
       时间序(WS 的 Recents 不支持手工重排,与 Codex 的空手工序行为一致)。 */
    const sortedRecentChats = sortChats(recentChats, chatSortMode, unreadChatIds)

    /* 平铺模式(Codex `sidebar-organize-mode-v1` = list):Recents 装**全部**
       未置顶会话,不再按项目分组 —— 项目分组的分节整个不渲染。 */
    const flatChats = sortChats(
      chats.filter((c) => !c.pinned),
      chatSortMode,
      unreadChatIds
    )

    return {
      projects,
      selection,
      currentProject:
        selection.type === 'project'
          ? projects.find((p) => p.id === selection.projectId)
          : undefined,
      chatsLoading,
      chats,
      pinnedChats,
      pinnedProjects,
      unpinnedProjects,
      setProjectPinned,
      recentChats: sortedRecentChats,
      /** 平铺模式下的全量未置顶会话（organize=list 时 Recents 渲染这个） */
      flatChats,
      pinnedItems,
      reorderPinnedItems,
      reorderProjectThreads,
      assignChatToProject,
      chatsOfProject: orderedChatsOfProject,
      suggestions: HOME_SUGGESTIONS,
      projectExpanded,
      toggleProject: toggleProjectPersisted,
      collapseAllProjects: () =>
        setProjectExpanded(() => {
          const next = Object.fromEntries(projects.map((p) => [p.id, false]))
          writeJson(SIDEBAR_PROJECT_EXPANDED_KEY, next)
          return next
        }),
      collapsedSections,
      toggleSection,
      organizeMode,
      setOrganizeMode,
      chatSortMode,
      setChatSortMode,
      projectSortMode,
      setProjectSortMode,
      unreadChatIds,
      markChatRead,
      noteActiveChat,
      refresh,
      pickDirectories,
      createProject,
      renameProject,
      reorderProjects,
      removeProject,
      selectProject,
      setChatPinned,
      renameChat,
      archiveChat,
      removeChat
    }
  }, [
    snapshot,
    chats,
    chatsLoading,
    projectExpanded,
    collapsedSections,
    organizeMode,
    chatSortMode,
    projectSortMode,
    unreadChatIds,
    toggleProjectPersisted,
    toggleSection,
    setOrganizeMode,
    setChatSortMode,
    setProjectSortMode,
    markChatRead,
    noteActiveChat,
    refresh,
    pickDirectories,
    createProject,
    renameProject,
    removeProject,
    selectProject,
    reorderProjects,
    reorderPinnedItems,
    reorderProjectThreads,
    assignChatToProject,
    setChatPinned,
    setProjectPinned,
    renameChat,
    archiveChat,
    removeChat
  ])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
