import { motion, useMotionTemplate } from 'framer-motion'
import { useAppShell, useAppShellSlot } from '../../state/AppShellContext'
import { runCommand } from '../../state/commands'
import { ExpandPanelIcon, RestorePanelIcon } from '../icons'
import { Tooltip } from '../tooltip/Tooltip'
import { APP_SHELL_BUTTON_CLASS, APP_SHELL_BUTTON_SECONDARY_CLASS } from './appShellButtonClass'
import { AppShellTabs } from './AppShellTabs'

/**
 * RightPanelTabs —— Codex bundle 里的 `uDr`(app-initial:211210):
 * 读取右面板的四个槽位,渲染共享的 AppShellTabs(KCr),
 * headerHeight='toolbar'、controller=右面板 controller。
 *
 * afterList 固定追加 Expand panel 按钮(aDr)+ header 让位 spacer(data-testid
 * right-panel-tab-bar-header-spacer,宽 = headerRightWidth 实测值)。
 *
 * beforeList 开头还有一个占位:**full-width 且侧栏隐藏时**(`$E && !oD`),
 * strip 一直顶到窗口左缘,要给 header 左槽(红绿灯 + 侧栏按钮)让出
 * headerLeftWidth 宽 —— `div.pointer-events-none.h-full.shrink-0[aria-hidden]`。
 */
export function RightPanelTabs(): React.JSX.Element {
  const {
    rightPanelController,
    headerLeftWidth,
    headerRightWidth,
    rightPanelWidthMode,
    sidebarOpen
  } = useAppShell()
  const afterList = useAppShellSlot('rightPanelTabListAfter')
  const afterListSticky = useAppShellSlot('rightPanelTabListAfterSticky')
  const beforeList = useAppShellSlot('rightPanelTabListBefore')
  const emptyState = useAppShellSlot('rightPanelTabsEmptyState')
  /*
   * Codex `uDr`:`c = ap`max(0px, calc(${headerRightWidth}px)`` —— 产物里那个
   * 模板少了一个右括号,Chrome 在 EOF 处自动闭合数学函数并把常量折叠掉,
   * 实测序列化出来就是 `width: calc(70px)`。这里把括号补齐(计算结果等价)。
   */
  const headerSpacerWidth = useMotionTemplate`max(0px, calc(${headerRightWidth}px))`

  return (
    <AppShellTabs
      controller={rightPanelController}
      headerHeight="toolbar"
      beforeList={
        <>
          {rightPanelWidthMode === 'full' && !sidebarOpen && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none h-full shrink-0"
              style={{ width: headerLeftWidth }}
            />
          )}
          {beforeList}
        </>
      }
      afterListSticky={afterListSticky}
      emptyState={emptyState}
      afterList={
        <>
          {afterList}
          <ExpandPanelButton />
          <motion.div
            aria-hidden="true"
            data-testid="right-panel-tab-bar-header-spacer"
            className="pointer-events-none flex h-full shrink-0 items-center"
            style={{ width: headerSpacerWidth }}
          />
        </>
      }
    />
  )
}

/**
 * Expand panel / Restore panel width(Codex `aDr`;命令 `toggleMaximizeSidePanel`)。
 * full 态切 color=secondary(实测类),外裹 Tooltip(delayOpen;该命令无默认快捷键)。
 * Codex 点开后若 active tab 是空 URL 的 browser tab 会聚焦其地址栏 —— WS 未接。
 */
function ExpandPanelButton(): React.JSX.Element {
  // Codex:按钮走命令注册表 `xM('toggleMaximizeSidePanel', 'side_panel_full_width_button')`
  // (app-initial:211187);handler 由 AppCommands 注册(TM)。
  const { rightPanelWidthMode } = useAppShell()
  const full = rightPanelWidthMode === 'full'
  const label = full ? 'Restore panel width' : 'Expand panel'
  return (
    <Tooltip tooltipContent={label} delayOpen>
      <span className="contents" data-state="closed">
        <button
          type="button"
          aria-label={label}
          aria-pressed={full}
          onClick={() => runCommand('toggleMaximizeSidePanel', 'side_panel_full_width_button')}
          className={full ? APP_SHELL_BUTTON_SECONDARY_CLASS : APP_SHELL_BUTTON_CLASS}
        >
          {full ? (
            <RestorePanelIcon className="icon-xs" />
          ) : (
            <ExpandPanelIcon className="icon-xs" />
          )}
        </button>
      </span>
    </Tooltip>
  )
}
