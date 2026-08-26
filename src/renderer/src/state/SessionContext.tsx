/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import { modelService } from '../services'
import type { ModelOption } from '../services/model/types'
import {
  applyAgentMode,
  defaultAgentMode,
  resolvePermissions,
  setHomeRoots,
  subscribePermissionSelection,
  type AgentMode
} from './permissionSelection'
import { useChatRuntime } from './ChatRuntimeContext'
import { useWorkspace } from './WorkspaceContext'
import {
  applySelection,
  loadConfigDefault,
  resolveSelection,
  subscribeModelSelection
} from './modelSelection'

/**
 * 会话上下文 —— 设计文档 §5.2 的 SessionContext。
 *
 * 当前先承载 Composer 的每轮覆盖项（模型 / effort / 权限策略），
 * 这些取值随 turn/start 下发；entriesByTask、turnStateByTask、
 * 审批队列等会话运行时状态在 M4 接入时加入本文件。
 */
interface SessionContextValue {
  /** 可用模型目录（挂载时 model/list 拉取，失败用兜底目录） */
  models: ModelOption[]
  /** 当前选中模型；目录加载完成前为 null */
  model: ModelOption | null
  /**
   * 当前 effort，**协议值**（`xhigh`）。
   * 切模型时若新模型不支持当前档，回落到新模型的默认档。
   */
  effort: string | null
  selectModel(id: string): void
  selectEffort(effort: string): void
  /**
   * 当前权限档（Codex 的 agent mode）。真值在 permissionSelection 里按线程解析
   *（线程 pending → 线程 latest → host 档 → config 派生默认）。
   */
  agentMode: AgentMode
  /** 菜单第一行（"Ask for approval"）对应的档位：有项目 auto、无项目 granular */
  defaultMode: AgentMode
  setAgentMode(mode: AgentMode): void
  /**
   * 运行中收到 follow-up 的默认行为(Codex 设置项 `followUpQueueMode`):
   * 'queue' = 排进队列等当前轮结束;'steer' = 立即转向活动轮。Codex 默认 'queue'。
   */
  followUpQueueMode: 'queue' | 'steer'
  setFollowUpQueueMode(mode: 'queue' | 'steer'): void
}

const SessionContext = createContext<SessionContextValue | null>(null)

/**
 * 目录外模型的展示名 —— Codex 的 `composer.mode.local.model.custom`
 * (defaultMessage `Custom`,description "Custom model from config")。
 * 本项目没有 i18n 层,取 defaultMessage。
 */
const CUSTOM_MODEL_LABEL = 'Custom'

export function SessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [models, setModels] = useState<ModelOption[]>([])
  const [followUpQueueMode, setFollowUpQueueMode] = useState<'queue' | 'steer'>('queue')
  /*
   * 模型与 effort 不在这里持有状态 —— 真值在 modelSelection 里，按活动线程解析
   *（线程 pending → 线程 latest → config 默认）。SessionProvider 必须挂在
   * ChatRuntimeProvider **内部**才能拿到 activeChatId。
   */
  const { activeChatId } = useChatRuntime()
  const { currentProject } = useWorkspace()
  const selection = useSyncExternalStore(subscribeModelSelection, () =>
    resolveSelection(activeChatId)
  )
  /*
   * 权限档同理 —— 真值在 permissionSelection 里按线程解析。
   * 无项目（projectless）会话的默认档是 granular 而不是 auto（Codex `Oti`），
   * 所以解析要带上"有没有项目"。
   */
  const roots = useMemo(() => currentProject?.rootPaths ?? [], [currentProject])
  const projectless = roots.length === 0
  const permissions = useSyncExternalStore(subscribePermissionSelection, () =>
    resolvePermissions(activeChatId, projectless)
  )
  // 首页 composer（还没有线程）用当前项目根展开权限策略
  useEffect(() => {
    setHomeRoots(roots)
  }, [roots])

  // 挂载时拉模型目录 + 读 config 的默认模型/effort（首页 composer 显示的就是后者）
  useEffect(() => {
    let alive = true
    void modelService.listModels().then((list) => {
      if (alive) setModels(list)
    })
    void loadConfigDefault()
    return () => {
      alive = false
    }
  }, [])

  const selectModel = useCallback(
    (id: string): void => {
      // 当前 effort 在新模型上不受支持时，回落到新模型默认档
      const next = models.find((m) => m.id === id)
      const current = resolveSelection(activeChatId).effort
      const effort =
        next == null || (current != null && next.efforts.includes(current))
          ? current
          : next.defaultEffort
      void applySelection(activeChatId, { model: id, effort })
    },
    [models, activeChatId]
  )

  const selectEffort = useCallback(
    (next: string): void => {
      void applySelection(activeChatId, { effort: next })
    },
    [activeChatId]
  )

  const setAgentMode = useCallback(
    (mode: AgentMode): void => {
      applyAgentMode(activeChatId, mode)
    },
    [activeChatId]
  )

  const value = useMemo<SessionContextValue>(() => {
    /*
     * 目录里找不到当前 model id 时**仍以选择为准**（不回落到目录第一项装作没事），
     * 但展示名走 Codex 的固定回落串 `Custom`：
     *
     *     o = oe?.displayName ?? intl.formatMessage({
     *           id: `composer.mode.local.model.custom`, defaultMessage: `Custom`,
     *           description: `Custom model from config` })
     *
     * 自定义 provider（config 里 `model_provider = "custom"`）下 `model/list` 返回
     * 的目录里没有这个 id，Codex 的 pill 就显示 `Custom`——8214 实测:config 是
     * `model = "deepseek-v4-flash"` 时 pill 是 `Custom High`，而菜单行的
     * `aria-label` 仍是 `Model deepseek-v4-flash`（原始 id 只进无障碍名，不进可见文本）。
     *
     * 之前这里把 id 直接当 displayName，于是界面上出现 `gpt-5.5` / `deepseek-v4-flash`
     * 这种裸 slug —— 那不是 Codex 的行为。
     */
    const known = models.find((m) => m.id === selection.model) ?? null
    const model =
      known ??
      (selection.model == null
        ? null
        : {
            id: selection.model,
            displayName: CUSTOM_MODEL_LABEL,
            efforts: [],
            defaultEffort: selection.effort ?? '',
            isDefault: false
          })
    return {
      models,
      model,
      effort: selection.effort,
      selectModel,
      selectEffort,
      agentMode: permissions.mode,
      defaultMode: defaultAgentMode(projectless),
      setAgentMode,
      followUpQueueMode,
      setFollowUpQueueMode
    }
  }, [
    models,
    selection,
    selectModel,
    selectEffort,
    permissions,
    projectless,
    setAgentMode,
    followUpQueueMode
  ])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
