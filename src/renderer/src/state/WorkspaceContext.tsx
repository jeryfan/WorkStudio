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
import type {
  CreateProjectInput,
  ProjectSelection,
  WorkspaceSnapshot
} from '@shared/workspace/types'

interface WorkspaceContextValue {
  projects: Project[]
  selection: ProjectSelection
  currentProject: Project | undefined
  /** 会话加载中（首帧为 true，快照里不含会话数据） */
  chatsLoading: boolean
  /** Recents 分区：无项目归属，或所属项目未作为分区显示 */
  recentChats: ChatSummary[]
  /** 置顶会话。落入 Pinned 分区，且不在其他分区重复出现 */
  pinnedChats: ChatSummary[]
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

  const value = useMemo<WorkspaceContextValue>(() => {
    const { projects, selection } = snapshot

    // 侧栏三分区是一次划分而不是三个视图：置顶优先，其次按项目，剩下的落
    // Recents。判定顺序决定了同一会话不会在两个分区里重复出现。
    const shownProjectIds = new Set(projects.map((p) => p.id))
    const pinnedChats: ChatSummary[] = []
    const byProject = new Map<string, ChatSummary[]>()
    const recentChats: ChatSummary[] = []

    for (const chat of chats) {
      if (chat.pinned) {
        pinnedChats.push(chat)
      } else if (chat.projectId && shownProjectIds.has(chat.projectId)) {
        const list = byProject.get(chat.projectId)
        if (list) list.push(chat)
        else byProject.set(chat.projectId, [chat])
      } else {
        // 无归属，或所属项目未作为分区显示——后者不能让会话凭空消失
        recentChats.push(chat)
      }
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
      recentChats,
      chatsOfProject: (projectId) => byProject.get(projectId) ?? [],
      suggestions: [],
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
    setChatPinned,
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
