/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { workspaceService } from '../services'
import type { Project, Suggestion, TaskItem, WorkspaceData } from '../services/workspace/types'

interface WorkspaceContextValue {
  loading: boolean
  projects: Project[]
  pinnedTasks: TaskItem[]
  currentProject: Project | undefined
  suggestions: Suggestion[]
  /** 项目展开状态（UI 态，不下发给服务层） */
  projectExpanded: Record<string, boolean>
  toggleProject(id: string): void
  collapseAllProjects(): void
  refresh(): Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [projectExpanded, setProjectExpanded] = useState<Record<string, boolean>>({})

  const load = async (): Promise<void> => {
    const d = await workspaceService.getWorkspaceData()
    setData(d)
    setProjectExpanded((prev) => {
      const next = { ...prev }
      for (const p of d.projects) {
        if (!(p.id in next)) next[p.id] = p.defaultExpanded ?? true
      }
      return next
    })
  }

  useEffect(() => {
    // 异步加载服务数据，setState 发生在 await 之后（非同步级联渲染）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      loading: data === null,
      projects: data?.projects ?? [],
      pinnedTasks: data?.pinnedTasks ?? [],
      currentProject: data?.projects.find((p) => p.id === data.currentProjectId),
      suggestions: data?.suggestions ?? [],
      projectExpanded,
      toggleProject: (id) => setProjectExpanded((prev) => ({ ...prev, [id]: !prev[id] })),
      collapseAllProjects: () =>
        setProjectExpanded((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, false]))),
      refresh: load
    }),
    [data, projectExpanded]
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
