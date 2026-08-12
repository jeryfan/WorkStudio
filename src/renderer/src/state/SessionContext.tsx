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
import { modelService } from '../services'
import type { ModelOption } from '../services/model/types'
import { ACCESS_POLICIES, type AccessPolicy } from '../services/chat/types'

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
  /** 当前 effort；切模型时若不受支持则回落到新模型默认档 */
  effort: string | null
  selectModel(id: string): void
  selectEffort(effort: string): void
  /** 权限 pill 当前策略 */
  access: AccessPolicy
  setAccess(policy: AccessPolicy): void
}

const SessionContext = createContext<SessionContextValue | null>(null)

const DEFAULT_ACCESS = ACCESS_POLICIES.find((p) => p.id === 'full') ?? ACCESS_POLICIES[0]

export function SessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelId, setModelId] = useState<string | null>(null)
  const [effort, setEffort] = useState<string | null>(null)
  const [access, setAccess] = useState<AccessPolicy>(DEFAULT_ACCESS)

  // 挂载时拉取模型目录（设计文档 §5.4），失败由 service 内部回退兜底目录
  useEffect(() => {
    let alive = true
    void modelService.listModels().then((list) => {
      if (alive) setModels(list)
    })
    return () => {
      alive = false
    }
  }, [])

  // 目录到达后初始化选中项：默认模型 + 默认 effort
  useEffect(() => {
    if (models.length === 0 || modelId !== null) return
    const def = models.find((m) => m.isDefault) ?? models[0]
    // setState 发生在目录异步到达之后，不是同步级联渲染
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModelId(def.id)
    setEffort(def.defaultEffort)
  }, [models, modelId])

  const selectModel = useCallback(
    (id: string): void => {
      setModelId(id)
      // 当前 effort 在新模型上不受支持时，回落到新模型默认档
      setEffort((prev) => {
        const next = models.find((m) => m.id === id)
        if (!next) return prev
        return prev && next.efforts.includes(prev) ? prev : next.defaultEffort
      })
    },
    [models]
  )

  const selectEffort = useCallback((next: string): void => {
    setEffort(next)
  }, [])

  const value = useMemo<SessionContextValue>(() => {
    const model = models.find((m) => m.id === modelId) ?? null
    return { models, model, effort, selectModel, selectEffort, access, setAccess }
  }, [models, modelId, effort, selectModel, selectEffort, access])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
