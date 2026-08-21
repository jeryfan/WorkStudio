import { useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import type { Project } from '../../services/workspace/types'
import { useWorkspace } from '../../state/WorkspaceContext'

/**
 * 项目排序的 dnd-kit id 前缀。
 *
 * Codex 的 aria-live 播报里是 `codex:project:<uuid>` —— 带命名空间前缀,
 * 说明同一个 DnD 上下文里还有别的类型(会话应该是 codex:thread:<id>)。
 * 沿用同样的格式,将来把会话也纳入同一个上下文时不会撞 id。
 */
export const projectDragId = (projectId: string): string => `codex:project:${projectId}`
const projectIdFromDragId = (dragId: string): string => dragId.replace(/^codex:project:/, '')

interface SortableProjectsProps {
  projects: Project[]
  /** 渲染单个项目分组(行 + 其下会话) */
  children: (project: Project) => ReactNode
}

/**
 * 项目列表的拖拽排序 —— 与 Codex 同款 dnd-kit。
 *
 * 用同一个库而不是自己写,是因为 Codex 这套的 DOM 形态和无障碍行为都由库决定:
 * DragOverlay 与原位分离、aria-roledescription="sortable"、DndDescribedBy 描述节点、
 * aria-live 实时播报、键盘拖拽 —— 自己实现能做到"能拖",但这些细节会散。
 *
 * 实测 Codex 的拖拽形态:body 下挂 `div.pointer-events-none.fixed.z-[60]` 全屏层,
 * 里面是被拖项的副本(252×164 —— **项目连同其下展开的会话一起**),靠 translateY
 * 跟随指针;原来的行留在原地。dnd-kit 的 DragOverlay 默认就是这个形态。
 *
 * 激活距离 4px:不设的话点击项目行会被当成拖拽起手,行本身的点击就失灵了。
 */
export function SortableProjects({ projects, children }: SortableProjectsProps): React.JSX.Element {
  const { reorderProjects } = useWorkspace()
  const [dragging, setDragging] = useState<Project | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const ids = projects.map((p) => projectDragId(p.id))

  const onDragStart = (e: DragStartEvent): void => {
    const id = projectIdFromDragId(String(e.active.id))
    setDragging(projects.find((p) => p.id === id) ?? null)
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setDragging(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(projects, from, to).map((p) => p.id)
    void reorderProjects(next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {projects.map((p) => children(p))}
      </SortableContext>

      {/* 拖拽副本:Codex 里是整组(行 + 子会话),不是单行 */}
      <DragOverlay dropAnimation={null}>
        {dragging ? <div className="pointer-events-none">{children(dragging)}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}
