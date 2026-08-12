import { useOverlay } from '../../state/OverlayContext'
import { usePanels } from '../../state/PanelContext'
import { CommandPalette } from '../command/CommandPalette'
import { CreateProjectDialog } from '../dialog/CreateProjectDialog'
import { DropdownMenu } from '../menu/DropdownMenu'
import { menuDefs } from '../menu/menuDefs'

/**
 * 浮层统一出口：下拉菜单 / ⌘K 命令面板 / 新建项目对话框。
 * 任一时刻每种浮层只存在一个实例，Escape 或点遮罩关闭。
 */
export function OverlayLayer(): React.JSX.Element {
  const { menu, commandOpen, createProjectOpen, closeMenu, setCommandOpen, setCreateProjectOpen } =
    useOverlay()
  const { openTab } = usePanels()

  return (
    <>
      {menu && (
        <DropdownMenu
          entries={menuDefs[menu.id].entries}
          anchor={menu.anchor}
          minWidth={menuDefs[menu.id].minWidth}
          width={menuDefs[menu.id].width}
          onClose={closeMenu}
          onSelect={
            menu.id === 'add-tab'
              ? (id) => {
                  if (id === 'browser') {
                    openTab(menu.dock ?? 'right', {
                      kind: 'browser',
                      title: 'New tab',
                      payload: { url: '' }
                    })
                  }
                }
              : undefined
          }
        />
      )}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
      {createProjectOpen && <CreateProjectDialog onClose={() => setCreateProjectOpen(false)} />}
    </>
  )
}
