import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { ExpandPanelIcon, RestorePanelIcon } from '../icons'
import { APP_SHELL_BUTTON_CLASS } from './appShellButtonClass'
import { AppShellTabs } from './AppShellTabs'

/**
 * RightPanelTabs —— Codex bundle 里的 `uDr`(app-initial:211210):
 * 读取右面板的四个槽位,渲染共享的 AppShellTabs(KCr),
 * headerHeight='toolbar'、controller=右面板 controller;afterList 固定追加
 * Expand panel 按钮(aDr)+ 70px header 让位 spacer(data-testid
 * right-panel-tab-bar-header-spacer,宽 = headerRightWidth 实测值)。
 */
export function RightPanelTabs(): React.JSX.Element {
  const { rightPanelController, headerRightWidth } = useAppShell()
  const afterList = useAppShellSlot('rightPanelTabListAfter')
  const afterListSticky = useAppShellSlot('rightPanelTabListAfterSticky')
  const beforeList = useAppShellSlot('rightPanelTabListBefore')
  const emptyState = useAppShellSlot('rightPanelTabsEmptyState')

  return (
    <AppShellTabs
      controller={rightPanelController}
      headerHeight="toolbar"
      beforeList={beforeList}
      afterListSticky={afterListSticky}
      emptyState={emptyState}
      afterList={
        <>
          {afterList}
          <ExpandPanelButton />
          <div
            aria-hidden="true"
            data-testid="right-panel-tab-bar-header-spacer"
            className="pointer-events-none flex h-full shrink-0 items-center"
            style={{ width: `calc(${headerRightWidth}px)` }}
          />
        </>
      }
    />
  )
}

/** Expand panel / Restore panel width(Codex `aDr`;toggleMaximizeSidePanel 命令) */
function ExpandPanelButton(): React.JSX.Element {
  const { rightPanelWidthMode, toggleRightPanelFullWidth } = useAppShell()
  const full = rightPanelWidthMode === 'full'
  return (
    <span className="contents" data-state="closed">
      <button
        type="button"
        aria-label={full ? 'Restore panel width' : 'Expand panel'}
        aria-pressed={full}
        onClick={toggleRightPanelFullWidth}
        className={APP_SHELL_BUTTON_CLASS}
      >
        {full ? <RestorePanelIcon className="icon-xs" /> : <ExpandPanelIcon className="icon-xs" />}
      </button>
    </span>
  )
}
