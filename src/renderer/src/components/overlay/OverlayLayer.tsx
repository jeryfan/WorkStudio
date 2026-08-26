import { useOverlay } from '../../state/OverlayContext'
import { CommandPalette } from '../command/CommandPalette'
import { CreateProjectDialog } from '../dialog/CreateProjectDialog'

/**
 * 浮层统一出口：⌘K 命令面板 / 新建项目对话框。
 * 任一时刻每种浮层只存在一个实例，Escape 或点遮罩关闭。
 *
 * 下拉菜单不在这里 —— Codex 的菜单全是触发器本地的 Radix DropdownMenu
 *(侧栏见 components/menu/CodexMenu.tsx,右面板「+」见 panel/OpenSidePanelTabMenu)。
 */
export function OverlayLayer(): React.JSX.Element {
  const { commandOpen, createProjectOpen, setCommandOpen, setCreateProjectOpen } = useOverlay()

  return (
    <>
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
      {createProjectOpen && <CreateProjectDialog onClose={() => setCreateProjectOpen(false)} />}
    </>
  )
}
