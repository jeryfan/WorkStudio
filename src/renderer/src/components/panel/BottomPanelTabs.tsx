import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { AppShellTabs } from './AppShellTabs'

/**
 * BottomPanelTabs —— Codex bundle 里的 `ewr`(app-initial:228790):
 * 与 RightPanelTabs 同构,但 headerHeight='pane'、controller=底部 controller,
 * 槽位是底部那组(bUn/xUn/SUn)—— **没有 beforeList**(底部 strip 不从窗口左缘起,
 * 不需要 header 让位)。
 *
 * 实测注意:底部面板的「+」菜单(Or target=bottom)在 0 个 tab 时也渲染
 * (只有右面板有 `tabs.length === 0 → null` 的限制)。
 */
export function BottomPanelTabs(): React.JSX.Element {
  const { bottomPanelController } = useAppShell()
  const afterList = useAppShellSlot('bottomPanelTabListAfter')
  const afterListSticky = useAppShellSlot('bottomPanelTabListAfterSticky')
  const emptyState = useAppShellSlot('bottomPanelTabsEmptyState')

  return (
    <AppShellTabs
      controller={bottomPanelController}
      headerHeight="pane"
      afterList={afterList}
      afterListSticky={afterListSticky}
      emptyState={emptyState}
    />
  )
}
