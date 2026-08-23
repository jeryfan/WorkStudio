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

interface WorkspaceContextValue {
  projects: Project[]
  selection: ProjectSelection
  currentProject: Project | undefined
  /** 会话加载中（首帧为 true，快照里不含会话数据） */
  chatsLoading: boolean
  /** Recents 分区：无项目归属，或所属项目未作为分区显示 */
  recentChats: ChatSummary[]
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
  /** 项目展开状态（纯 UI 态，不进注册表） */
  projectExpanded: Record<string, boolean>
  toggleProject(id: string): void
  collapseAllProjects(): void
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

export function WorkspaceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // preload 已同步取好首屏快照，首帧即有真实项目列表，不出现空列表闪烁
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(
    () => window.bootstrap.get().workspace
  )
  const [projectExpanded, setProjectExpanded] = useState<Record<string, boolean>>({})
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [chatsLoading, setChatsLoading] = useState(true)

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
   */
  useEffect(() => {
    const offStatus = rpc.on('thread/status/changed', (p) => {
      const { threadId, status } = p as { threadId: string; status: ChatStatus }
      setChats((prev) =>
        prev.some((c) => c.id === threadId)
          ? prev.map((c) => (c.id === threadId ? { ...c, status } : c))
          : prev
      )
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
      const manual = projectThreadOrder[projectId]
      if (manual == null || manual.length === 0) return list
      const rank = new Map(manual.map((id, i) => [id, i]))
      const known = list
        .filter((c) => rank.has(c.id))
        .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
      const rest = list.filter((c) => !rank.has(c.id))
      return [...known, ...rest]
    }

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
      recentChats,
      pinnedItems,
      reorderPinnedItems,
      reorderProjectThreads,
      assignChatToProject,
      chatsOfProject: orderedChatsOfProject,
      suggestions: HOME_SUGGESTIONS,
      projectExpanded,
      toggleProject: (id) => setProjectExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) })),
      collapseAllProjects: () =>
        setProjectExpanded(Object.fromEntries(projects.map((p) => [p.id, false]))),
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
