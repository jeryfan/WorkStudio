/**
 * 侧栏拖拽的**纯逻辑层** —— id 命名、落点规则、缺目录判定、以及两个注册 hook。
 *
 * 与组件分开一个文件不是洁癖:react-refresh 要求组件文件只导出组件,
 * 混着导出函数会让整个文件的热更失效。
 *
 * 实测依据(Codex,CDP 真实鼠标事件 + aria-live 播报):
 * - 侧栏里所有可拖项的 `aria-describedby` 都指向 `DndDescribedBy-0`,
 *   即**一个** DndContext 管全部四类操作。分成多个 context 的话跨列表拖拽
 *   根本收不到 over 事件。
 * - draggable id / droppable id **不同名**:
 *   会话的 draggable id 是 `local:<uuid>`(= `data-app-action-sidebar-thread-id`),
 *   而它作为落点时的 droppable id 是 `codex:thread:local:<uuid>`;
 *   项目是 `codex:project:<uuid>`。播报原文:
 *   「Draggable item local:01a01c7f-… was moved over droppable area codex:thread:local:01a02356-…」
 * - 容器落点 id 是 `sidebar-thread-container:<containerId>`,实测 Recents 的
 *   containerId 就是 `chats`;另有 `pinned` / `project:<id>` / `custom:<id>` / `cloud`
 *   (来自 bundle 里 `Agc` 的分支)。
 *
 * 因为 useSortable 的 droppable id 就是它的 draggable id,这里让**可排序项**
 * 用 itemKey(`codex:*`)注册,**只可拖不可落**的 Recents 行用 useDraggable +
 * 原始 threadKey(`local:*`)注册 —— 两种 id 各自的角色因此与 Codex 一致。
 */
import {
  closestCenter,
  pointerWithin,
  useDraggable,
  type CollisionDetection,
  type DroppableContainer
} from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Project } from '../../services/workspace/types'

export type SidebarContainerId = 'pinned' | 'chats' | `project:${string}`

export const containerDroppableId = (containerId: SidebarContainerId): string =>
  `sidebar-thread-container:${containerId}`

/** 会话的 draggable id —— 与 `data-app-action-sidebar-thread-id` 同值 */
export const threadDragId = (chatId: string): string => `local:${chatId}`
export const chatIdFromDragId = (dragId: string): string => dragId.replace(/^local:/, '')

export interface DragData {
  kind: 'sidebar-group' | 'sidebar-item' | 'sidebar-thread-container'
  containerId: SidebarContainerId
  projectId?: string
  chatId?: string
  /**
   * 会话的**归属**容器(而不是当前渲染所在的容器)。
   *
   * 只有它能回答「这条会话本来就属于 Recents 吗」——`Agc` 判断
   * 「从 Pinned 拖回 chats」是否合法时要用。置顶会把会话从原分区移走,
   * 所以 containerId 会变成 pinned,归属信息只能另外带。
   */
  homeContainerId?: SidebarContainerId
  /**
   * 这个落点是项目行上的图标落区,而不是项目的会话列表。
   *
   * Codex 的 `Ngc` 用它区分两种"落到项目上":图标落区是
   * **保证的容器落点**(`isGuaranteedContainerTarget`)—— 落上去一定是
   * "移进这个项目",不参与行级排序;会话列表则相反,指针落在列表里
   * 优先当"在这个列表里排序"。
   */
  projectDropZone?: 'project-icon'
}

/** 分节级容器(Codex 的 `R8`):Pinned 与自定义分节,**不含**项目容器 */
export function isSectionContainer(id: SidebarContainerId | undefined): boolean {
  return id === 'pinned' || id?.startsWith('custom:') === true
}

export interface SidebarDragBinding {
  attributes: Record<string, unknown>
  listeners: Record<string, unknown>
  setNodeRef(el: HTMLElement | null): void
  style: React.CSSProperties
  isDragging: boolean
}

/** 可排序项(Pinned / Projects 列表、项目内会话) */
export function useSidebarSortable(itemKey: string, data: DragData): SidebarDragBinding {
  const sortable = useSortable({ id: itemKey, data })
  return {
    attributes: sortable.attributes as unknown as Record<string, unknown>,
    listeners: (sortable.listeners ?? {}) as unknown as Record<string, unknown>,
    setNodeRef: sortable.setNodeRef,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
      // 被拖的那一份留在原位淡出,跟手的副本由 DragOverlay 画
      opacity: sortable.isDragging ? 0.4 : undefined
    },
    isDragging: sortable.isDragging
  }
}

/** 只可拖不可落(Recents 的会话行) */
export function useSidebarDraggable(dragId: string, data: DragData): SidebarDragBinding {
  const draggable = useDraggable({ id: dragId, data })
  return {
    attributes: draggable.attributes as unknown as Record<string, unknown>,
    listeners: (draggable.listeners ?? {}) as unknown as Record<string, unknown>,
    setNodeRef: draggable.setNodeRef,
    style: { opacity: draggable.isDragging ? 0.4 : undefined },
    isDragging: draggable.isDragging
  }
}

/** 目标容器是否接受来自 source 的这个会话 —— bundle 的 `Agc` */
export function canMoveThread(
  source: SidebarContainerId,
  target: SidebarContainerId,
  homeContainer: SidebarContainerId
): boolean {
  if (source === target) return true
  if (target === 'pinned') return true
  if (target.startsWith('project:')) return true
  if (target === 'chats') {
    return source.startsWith('project:') || (source === 'pinned' && homeContainer === 'chats')
  }
  return false
}

/**
 * 目标项目缺哪些源目录 —— bundle 的 `LIc`。
 *
 * 判定不是「集合相等」而是「覆盖」:源项目的某个目录只要等于目标项目的某个
 * 目录、或在它之下,就算已覆盖。所以把 `~/a/pkg` 的会话拖进挂了 `~/a` 的项目
 * 不会弹框 —— 目标已经能访问它了。
 */
export function missingProjectSources(source: Project | undefined, target: Project): string[] {
  if (source == null) return []
  if (source.id === target.id) return []
  const covered = target.rootPaths.map((p) => p.replace(/\/+$/, ''))
  return source.rootPaths.filter((raw) => {
    const path = raw.replace(/\/+$/, '')
    return !covered.some((c) => path === c || path.startsWith(`${c}/`))
  })
}

export interface PendingThreadMove {
  chatId: string
  targetProject: Project
  missingSources: string[]
}

const dragData = (c: { data: { current?: unknown } }): DragData | null => {
  const d = c.data.current
  if (typeof d !== 'object' || d == null) return null
  const kind = (d as DragData).kind
  return kind === 'sidebar-group' || kind === 'sidebar-item' || kind === 'sidebar-thread-container'
    ? (d as DragData)
    : null
}

/**
 * 落点判定 —— 照 Codex 的 `oMc` 重写,**不能**用裸 `closestCenter`。
 *
 * 裸 closestCenter 会把「按类型根本不该接住」的落点也算进去,实测后果:
 * 拖项目时落到了另一个项目**下面的会话**上(播报里 over 是
 * `codex:thread:local:…`),于是 onDragEnd 什么也匹配不上,排序静默失效;
 * 把项目内的会话往 Recents 拖会落到某条会话上,被当成跨项目移动并弹确认框。
 * 四类拖拽里三类都错在这一步。
 *
 * 两段式,与 Codex 一致:
 * 1. **先按类型/规则筛掉不合法的落点**
 *    - 拖项目 → 只认同一分节里的其它项目,外加分节级容器/条目
 *      (`isSectionContainer`,即 Pinned 与自定义分节 —— 所以把项目拖进
 *      Pinned 就是置顶,这也是 Codex 的行为)
 *    - 拖会话 → 用 `canMoveThread` 逐个过一遍
 * 2. **三级优先**:先看指针是否落在某个**可落的行**上(那是「插到这一行」),
 *    否则看指针是否落在某个**容器**里(那是「移进这个列表」),
 *    最后才退到「把碰撞盒缩成指针那一个点」再 closestCenter(Codex 的 `lMc`)。
 *
 *    中间那一级是必需的。少了它,把项目里的会话往 Recents 拖会失败 ——
 *    Recents 的行是 `useDraggable`(压根不是落点),行级命中为空,而
 *    closestCenter 比的是**中心距**:Recents 容器很高、中心离指针远,
 *    反而是某个项目里的小会话行赢了,于是被当成跨项目移动、弹出确认框。
 *    实测就是这个现象。
 */
export const sidebarCollisionDetection: CollisionDetection = (args) => {
  const active = dragData(args.active)
  const atPointer = (candidates: DroppableContainer[]): ReturnType<CollisionDetection> => {
    if (args.pointerCoordinates == null) {
      return closestCenter({ ...args, droppableContainers: candidates })
    }
    const { x, y } = args.pointerCoordinates
    return closestCenter({
      ...args,
      droppableContainers: candidates,
      collisionRect: {
        ...args.collisionRect,
        top: y,
        bottom: y,
        left: x,
        right: x,
        width: 0,
        height: 0
      }
    })
  }

  if (active?.kind === 'sidebar-group') {
    const candidates = args.droppableContainers.filter((c) => {
      const d = dragData(c)
      if (d == null) return false
      if (d.kind === 'sidebar-group') return d.containerId === active.containerId
      return isSectionContainer(d.containerId)
    })
    const rows = candidates.filter((c) => {
      const d = dragData(c)
      return (
        d?.kind === 'sidebar-group' ||
        (d?.kind === 'sidebar-item' && isSectionContainer(d.containerId))
      )
    })
    const hits = pointerWithin({ ...args, droppableContainers: rows })
    if (hits.length > 0) return hits
    const containers = candidates.filter((c) => !rows.includes(c))
    const inContainer = pointerWithin({ ...args, droppableContainers: containers })
    return inContainer.length > 0 ? inContainer : atPointer(candidates)
  }

  if (active?.kind !== 'sidebar-item') return atPointer(args.droppableContainers)

  const home = active.homeContainerId ?? active.containerId
  const candidates = args.droppableContainers.filter((c) => {
    const d = dragData(c)
    if (d == null || d.kind === 'sidebar-group') return false
    if (d.chatId != null && d.chatId === active.chatId) return false
    return canMoveThread(active.containerId, d.containerId, home)
  })
  const rows = candidates.filter((c) => dragData(c)?.kind === 'sidebar-item')
  const hits = pointerWithin({ ...args, droppableContainers: rows })
  if (hits.length > 0) return hits
  const containers = candidates.filter((c) => dragData(c)?.kind === 'sidebar-thread-container')
  const inContainer = pointerWithin({ ...args, droppableContainers: containers })
  if (inContainer.length > 0) {
    const winner = containers.find((c) => c.id === inContainer[0].id)
    const winnerData = winner == null ? null : dragData(winner)
    /*
     * 「落在项目的会话列表里」优先解释成**在这个列表里排序**,而不是
     * "移进这个项目" —— 这就是 Codex 的 `isActiveInReorderBoundary`。
     * 图标落区(`project-icon`)是例外:它是保证的容器落点。
     *
     * 少了这一条,项目内的会话排序会被容器抢走(实测:over 变成
     * `sidebar-thread-container:project:…`,顺序不动)。
     */
    if (
      winnerData != null &&
      winnerData.projectDropZone !== 'project-icon' &&
      winnerData.containerId.startsWith('project:')
    ) {
      const siblings = rows.filter((c) => dragData(c)?.containerId === winnerData.containerId)
      if (siblings.length > 0) return atPointer(siblings)
    }
    return inContainer
  }
  return atPointer(candidates)
}

/** 把 key 移到 target 所在的位置(target 不在列表里时原样返回) */
export function moveKey(keys: string[], key: string, target: string): string[] {
  const from = keys.indexOf(key)
  const to = keys.indexOf(target)
  if (from < 0 || to < 0 || from === to) return keys
  const next = [...keys]
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}
