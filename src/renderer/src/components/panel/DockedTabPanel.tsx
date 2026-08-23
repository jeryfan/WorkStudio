import type { ComponentType } from 'react'
import {
  usePanels,
  type PanelDock,
  type PanelTab,
  type PanelTabKind
} from '../../state/PanelContext'
import { CloseIcon, ChromeIcon, PlusIcon } from '../icons'
import { FileTab } from './file/FileTab'
import { BrowserTab } from './BrowserTab'
import { FileGlyph } from './file/FileGlyph'
import { useOverlay } from '../../state/OverlayContext'

/**
 * ⚠️ 这是**重构前**的右/底面板实现,原本叫 AppShellTabPanel。
 *
 * 右面板正在往 Codex 的那套迁移(`AppShellContext` + `AppShellTabs` +
 * `RightPanelTabs` / `BottomPanelTabs` + tab 描述符),迁移未完成:
 * `AppShellProvider` 还没挂载,`FileTab` / `BrowserTab` 的 props 还是旧形状。
 * 而 `AppShellTabPanel.tsx` 这个文件名已经被新的**tab 内容区 error boundary**
 * 占用(Codex 里那个名字指的就是 error boundary,旧的整条 strip+面板叫法是误用)。
 *
 * 于是出现过一次白屏:AppShell 仍按旧契约渲染 `<AppShellTabPanel docked="right">`,
 * 而文件里已是新组件 → `Cannot read properties of undefined (reading 'tabStateById')`,
 * 整个应用被卸载。这里把旧实现原样搬到一个不冲突的文件名下,让面板先能用;
 * 新的那套文件一个都没动。
 *
 * 迁移收尾时的做法:AppShell 改渲染 `RightPanelTabs` / `BottomPanelTabs`、
 * 挂上 `AppShellProvider`、把 `FileTab` / `BrowserTab` 换成描述符的 props,
 * 然后删掉本文件。
 */

/* ================= Tab 渲染注册表 =================
 * 新增 tab 类型 = 在此注册一行，DockedTabPanel 无需改动。
 * FileTab（panel/1.html）与 BrowserTab（webview）均为完整实现。 */
interface TabRendererProps {
  tab: PanelTab
  dock: PanelDock
}

const TAB_RENDERERS: Record<PanelTabKind, ComponentType<TabRendererProps>> = {
  file: FileTab,
  browser: BrowserTab
}

interface PanelShellProps {
  docked: PanelDock
}

/**
 * 右侧 / 底部共用面板 —— docked 只是展示属性，tab 数据与停靠无关。
 * 结构 = PanelTabStrip（标签条）+ PanelContent（registry 渲染）。
 */
export function DockedTabPanel({ docked }: PanelShellProps): React.JSX.Element {
  const { docks, activateTab, closeTab } = usePanels()
  const { openMenu } = useOverlay()
  const { tabs, activeTabId } = docks[docked]
  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null
  const ActiveRenderer = activeTab ? TAB_RENDERERS[activeTab.kind] : null

  return (
    // 面板边界的 1px 线由 Separator 统一绘制，AppShellTabPanel 不再自带边框。
    // 右侧面板顶部 44px 与 AppShellHeader 的窗口拖拽区（app-region: drag）重叠，
    // 需要像侧栏一样 pt-11 让位，否则标签条按钮会被拖拽区吃掉点击；
    // 底部面板在窗口中部、不接触 AppShellHeader，无需让位。
    <div
      className={`flex h-full w-full flex-col bg-token-main-surface-primary ${docked === 'right' ? 'pt-11' : ''}`}
    >
      {/* tab strip */}
      <div className="flex h-11 shrink-0 items-center gap-[3px] px-2">
        {tabs.map((tab) => {
          const active = tab.tabId === activeTabId
          return (
            <div
              key={tab.tabId}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => activateTab(docked, tab.tabId)}
              onKeyDown={(e) => e.key === 'Enter' && activateTab(docked, tab.tabId)}
              className={`group relative flex h-7 min-w-[90px] max-w-40 flex-1 cursor-default items-center gap-2 overflow-hidden rounded-lg px-2 text-[13px] ${
                active ? 'bg-[#f2f3f4] text-token-foreground' : 'text-[#54585f] hover:bg-[#f2f3f4]'
              }`}
            >
              {/* t-icon（panel/1.html）：文件 glyph，激活时颜色加深 */}
              <span
                className={`flex shrink-0 items-center justify-center [&_svg]:size-4 ${
                  active ? 'text-token-foreground' : 'text-[#71767d]'
                }`}
              >
                {tab.kind === 'browser' ? <ChromeIcon /> : <FileGlyph name={tab.title} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
              <button
                type="button"
                aria-label={`Close ${tab.title} tab`}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(docked, tab.tabId)
                }}
                className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-token-description-foreground opacity-0 hover:bg-[#f2f3f5] group-hover:opacity-100 [&_svg]:size-3.5"
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          title="Open side panel tab"
          aria-haspopup="menu"
          onClick={(e) =>
            openMenu({
              id: 'add-tab',
              anchor: e.currentTarget.getBoundingClientRect(),
              dock: docked
            })
          }
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-token-description-foreground hover:bg-token-list-hover-background"
        >
          <PlusIcon />
        </button>
      </div>

      {/* content */}
      <div className="min-h-0 flex-1">
        {activeTab && ActiveRenderer ? (
          <ActiveRenderer tab={activeTab} dock={docked} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-token-description-foreground">
            No tabs
          </div>
        )}
      </div>
    </div>
  )
}
