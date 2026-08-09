import type { ButtonHTMLAttributes } from 'react'
import { usePanels } from '../../state/PanelContext'
import { isMacOS, TRAFFIC_LIGHT_INSET } from '../../utils/platform'
import { ArrowIcon, BottomPanelIcon, ExpandIcon, SidebarHideIcon, SidePanelIcon } from '../icons'

interface HdrButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 激活态（panel/1.html .icon-btn.tinted）：灰底实色，表示对应面板已打开 */
  tinted?: boolean
}

function HdrButton({
  tinted = false,
  className = '',
  children,
  ...rest
}: HdrButtonProps): React.JSX.Element {
  const base = tinted
    ? 'bg-row-hover text-ink hover:bg-ink-10'
    : 'text-tertiary enabled:hover:bg-hover'
  return (
    <button
      type="button"
      className={`flex size-8 items-center justify-center rounded-lg disabled:cursor-default disabled:opacity-40 ${base} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * header.topbar —— fixed 横跨全宽的悬浮层（1.html 第 405-417 行）：
 * pointer-events-none，仅按钮组恢复交互；整体兼作无边框窗口的拖拽区。
 * macOS 下左侧留出红绿灯按钮区域；三个面板开关已接入 PanelContext。
 */
export function TopBar(): React.JSX.Element {
  const {
    sidebarOpen,
    rightPanelOpen,
    bottomPanelOpen,
    panelMaximized,
    toggleSidebar,
    toggleRightPanel,
    toggleBottomPanel,
    togglePanelMaximized
  } = usePanels()

  return (
    <header
      className="drag-region pointer-events-none fixed inset-x-0 top-0 z-30 flex h-11 items-center justify-between pr-2"
      style={{ paddingLeft: isMacOS ? TRAFFIC_LIGHT_INSET : 6 }}
    >
      <div className="no-drag pointer-events-auto flex items-center gap-1">
        <HdrButton
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          tinted={sidebarOpen}
          onClick={toggleSidebar}
        >
          <SidebarHideIcon />
        </HdrButton>
        <HdrButton aria-label="Back">
          <ArrowIcon />
        </HdrButton>
        <HdrButton aria-label="Forward" disabled>
          <ArrowIcon className="-scale-x-100" />
        </HdrButton>
      </div>
      <div className="no-drag pointer-events-auto flex items-center gap-1">
        {/* 最大化/恢复 tab panel —— 仅右侧面板打开时展示（panel/1.html 右侧第一个按钮） */}
        {rightPanelOpen && (
          <HdrButton
            aria-label={panelMaximized ? 'Restore panel width' : 'Maximize panel'}
            title={panelMaximized ? 'Restore panel width' : 'Maximize panel'}
            tinted={panelMaximized}
            onClick={togglePanelMaximized}
          >
            <ExpandIcon />
          </HdrButton>
        )}
        <HdrButton
          aria-label="Toggle bottom panel"
          title="Toggle bottom panel"
          tinted={bottomPanelOpen}
          onClick={toggleBottomPanel}
        >
          <BottomPanelIcon />
        </HdrButton>
        <HdrButton
          aria-label="Toggle side panel"
          title="Toggle side panel"
          tinted={rightPanelOpen}
          onClick={toggleRightPanel}
        >
          <SidePanelIcon className="rotate-180" />
        </HdrButton>
      </div>
    </header>
  )
}
