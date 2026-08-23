import { useOverlay } from '../../state/OverlayContext'
import { CommandPalette } from '../command/CommandPalette'
import { CreateProjectDialog } from '../dialog/CreateProjectDialog'
import { DropdownMenu } from '../menu/DropdownMenu'
import { menuDefs, projectActionEntries } from '../menu/menuDefs'
import { useWorkspace } from '../../state/WorkspaceContext'

/**
 * 浮层统一出口：下拉菜单 / ⌘K 命令面板 / 新建项目对话框。
 * 任一时刻每种浮层只存在一个实例，Escape 或点遮罩关闭。
 *
 * 右面板「+」加号菜单不在这里 —— 那是 strip sticky 区的 Radix DropdownMenu
 * (Codex `Or`,见 panel/OpenSidePanelTabMenu)。
 */
export function OverlayLayer(): React.JSX.Element {
  const { menu, commandOpen, createProjectOpen, closeMenu, setCommandOpen, setCreateProjectOpen } =
    useOverlay()
  const { pinnedProjects, setProjectPinned } = useWorkspace()

  return (
    <>
      {menu && (
        <DropdownMenu
          entries={
            // Project actions 的首项随置顶状态切文案(Codex 实测 Pin ⇄ Unpin project)
            menu.id === 'project-actions'
              ? projectActionEntries(pinnedProjects.some((p) => p.id === menu.projectId))
              : menuDefs[menu.id].entries
          }
          anchor={menu.anchor}
          minWidth={menuDefs[menu.id].minWidth}
          width={menuDefs[menu.id].width}
          onClose={closeMenu}
          onSelect={(id) => {
            if (menu.id === 'project-actions' && id === 'pin-project' && menu.projectId) {
              const isPinned = pinnedProjects.some((p) => p.id === menu.projectId)
              void setProjectPinned(menu.projectId, !isPinned)
            }
          }}
        />
      )}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
      {createProjectOpen && <CreateProjectDialog onClose={() => setCreateProjectOpen(false)} />}
    </>
  )
}
