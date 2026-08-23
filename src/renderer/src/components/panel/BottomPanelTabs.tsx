import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { AppShellTabs } from './AppShellTabs'

/**
 * BottomPanelTabs —— Codex bundle 里的 `ewr`(app-initial:228790):
 * 与 RightPanelTabs 同构,但 headerHeight='pane'、controller=底部 controller,
 * 槽位是底部那组(bUn/xUn/SUn)。
 *
 * ⚠️ Codex 的底部面板在本机实测点不出 DOM,结构只能按 bundle 推断;
 * 面板外壳的定位仍见 MainContentLayout 的 bottomPanel 槽注释。
 */
export function BottomPanelTabs(): React.JSX.Element {
  const { bottomPanelController } = useAppShell()
  const afterList = useAppShellSlot('bottomPanelTabListAfter')
  const afterListSticky = useAppShellSlot('bottomPanelTabListAfterSticky')
  const beforeList = useAppShellSlot('bottomPanelTabListBefore')
  const emptyState = useAppShellSlot('bottomPanelTabsEmptyState')

  return (
    <AppShellTabs
      controller={bottomPanelController}
      headerHeight="pane"
      beforeList={beforeList}
      afterList={afterList}
      afterListSticky={afterListSticky}
      emptyState={emptyState}
    />
  )
}
