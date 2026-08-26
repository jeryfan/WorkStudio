import { useWorkspace, type SidebarSectionId } from '../../state/WorkspaceContext'
import { CodexMenu, CodexMenuGroup, CodexMenuLabel, CodexMenuRadioItem } from '../menu/CodexMenu'

/**
 * 分节标题栏的 options 菜单 —— Codex 实测内容与结构:
 *
 * ```
 * [group] "Organize sidebar"          ← label + 两个 radio(全局 organize 模式)
 *   (✓) By project / ( ) In one list
 * [group] "Sort chats by"             ← label + 三个 radio(**按分节**的排序档)
 *   ( ) Priority / ( ) Last updated / (✓) Manual order
 * ```
 *
 * 两个实测细节:
 * - sort 状态是**按分节**的:Projects 菜单反映 projectSortMode(默认 manual),
 *   Recents 菜单反映 chatSortMode(默认 priority)—— 两份 Codex 运行时 dump 里
 *   两个菜单的勾不在同一项。
 * - 菜单外壳 min-w-[172px] max-w-[240px],align=start,side=bottom。
 */
export function SidebarOptionsMenu({
  section,
  trigger
}: {
  section: Extract<SidebarSectionId, 'projects' | 'recents'>
  trigger: React.ReactNode
}): React.JSX.Element {
  const {
    organizeMode,
    setOrganizeMode,
    chatSortMode,
    setChatSortMode,
    projectSortMode,
    setProjectSortMode
  } = useWorkspace()
  const sortMode = section === 'projects' ? projectSortMode : chatSortMode
  const setSortMode = section === 'projects' ? setProjectSortMode : setChatSortMode

  return (
    <CodexMenu trigger={trigger} contentClassName="min-w-[172px] max-w-[240px]">
      <CodexMenuGroup>
        <CodexMenuLabel>Organize sidebar</CodexMenuLabel>
        <CodexMenuRadioItem
          checked={organizeMode === 'project'}
          label="By project"
          onSelect={() => setOrganizeMode('project')}
        />
        <CodexMenuRadioItem
          checked={organizeMode === 'list'}
          label="In one list"
          onSelect={() => setOrganizeMode('list')}
        />
      </CodexMenuGroup>
      <CodexMenuGroup>
        <CodexMenuLabel>Sort chats by</CodexMenuLabel>
        <CodexMenuRadioItem
          checked={sortMode === 'priority'}
          label="Priority"
          onSelect={() => setSortMode('priority')}
        />
        <CodexMenuRadioItem
          checked={sortMode === 'updated_at'}
          label="Last updated"
          onSelect={() => setSortMode('updated_at')}
        />
        <CodexMenuRadioItem
          checked={sortMode === 'manual'}
          label="Manual order"
          onSelect={() => setSortMode('manual')}
        />
      </CodexMenuGroup>
    </CodexMenu>
  )
}
