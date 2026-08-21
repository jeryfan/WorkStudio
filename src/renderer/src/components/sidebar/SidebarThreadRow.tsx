import { useRef } from 'react'
import type { ChatSummary } from '../../services/chat/types'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useOverlay } from '../../state/OverlayContext'
import { ArchiveIcon, PinIcon, UnpinIcon } from '../icons'
import { CODEX_CLASS } from '../../assets/codex/class-map'
import { ChatHoverCard } from './ChatHoverCard'
import { useHoverCard } from './useHoverCard'

interface ChatRowProps {
  chat: ChatSummary
}

/** 悬浮操作按钮 —— Codex 实测 20×20,hover 不给背景、只变色(sidebar-hover-icon-button-tint) */
const ACTION_BTN =
  'no-drag cursor-interaction flex items-center justify-center gap-1 whitespace-nowrap select-none ' +
  'rounded-full border border-transparent p-0.5 focus:outline-none ' +
  'enabled:hover:bg-transparent hover:text-token-foreground ' +
  'disabled:cursor-not-allowed disabled:opacity-40 ' +
  'electron:rounded-md electron:p-1 ' +
  '!h-5 !w-5 !p-0 [&>svg]:!h-4 [&>svg]:!w-4 sidebar-hover-icon-button-tint'

/**
 * 侧栏会话行 —— 结构、类名、data 属性逐项对齐 Codex 实测(324×30)。
 *
 * 三个子元素,顺序不能变:
 *   1. div.contents        悬浮操作(两个 20×20 按钮),opacity-0 → group-hover 显现
 *   2. 状态槽(仅非空闲)   absolute end-0,group-hover:hidden —— hover 时让位给操作
 *   3. 内容行              图标位 + 标题(跑马灯)+ 尾部留白
 *
 * 几处容易做错的地方,都以实测为准:
 *
 * - **状态点是静态圆点,没有动画**。8×8,内联 background-color,外面套两层定位盒
 *   (span 20×20 → div size-5 → span icon-xs scale-50)。之前用 animate-pulse 是多加的。
 * - **状态槽带 group-hover:hidden**,所以它和操作按钮虽然都在 end-0 也不会打架。
 * - **标题是跑马灯不是截断**:hover 时滚动,四层结构
 *   viewport → clipViewport → track → content,滚完停在末尾(stopAtEnd)。
 * - 选中态由 data 属性驱动样式,不是 JS 拼 className。
 * - 标题外层带 data-thread-title-trigger —— Codex 的内联改名就挂在这个触发器上。
 */
export function SidebarThreadRow({ chat }: ChatRowProps): React.JSX.Element {
  const { setChatPinned, archiveChat } = useWorkspace()
  const { openChat, activeChatId } = useChatRuntime()
  const { menu } = useOverlay()
  const { id, title, pinned, status } = chat

  /*
   * 会话行也有悬浮面板 —— Codex 侧栏里 31 个元素带 data-hover-card-open-immediately,
   * 项目行和会话行各占一半。时序与项目行一致,所以共用 useHoverCard。
   */
  const rowRef = useRef<HTMLDivElement>(null)
  const card = useHoverCard(rowRef, menu !== null)

  const running = status.type === 'active'
  const errored = status.type === 'systemError'
  const awaitingApproval =
    status.type === 'active' && status.activeFlags.some((f) => String(f).includes('pproval'))
  const busy = running || errored

  // Codex 只观测到运行态用 textLink 色;报错/待审批是本项目自有的状态,沿用语义色
  const dotColor = errored
    ? 'var(--color-token-editor-error-foreground, #ba2623)'
    : awaitingApproval
      ? 'var(--color-accent-orange, #c2570b)'
      : 'var(--vscode-textLink-foreground)'

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onMouseEnter={() => {
        if (!menu) card.scheduleOpen()
      }}
      onMouseLeave={card.scheduleClose}
      data-app-action-sidebar-thread-row=""
      data-app-action-sidebar-thread-id={id}
      data-app-action-sidebar-thread-title={title}
      data-app-action-sidebar-thread-kind="local"
      data-app-action-sidebar-thread-pinned={pinned ? 'true' : 'false'}
      data-app-action-sidebar-thread-active={running ? 'true' : 'false'}
      data-app-action-sidebar-thread-selected={activeChatId === id ? 'true' : 'false'}
      onClick={() => openChat(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openChat(id)
        }
      }}
      /* 卡片打开时保持行高亮:鼠标滑进卡片后行会失去 :hover,不补就像"已经离开" */
      className={`sidebar-item group relative h-[var(--height-token-row)] cursor-interaction py-row-y pe-row-y ps-[var(--padding-row-cell-x,var(--padding-row-x))] text-sm hover:bg-token-list-hover-background focus-visible:outline-offset-[-2px] data-[app-action-sidebar-thread-selected=true]:bg-token-list-hover-background ${
        card.anchor ? 'bg-token-list-hover-background' : ''
      }`}
      style={pinned ? { cursor: 'grab' } : undefined}
    >
      {/* 1. 悬浮操作 */}
      <div className="contents" data-hover-card-open-immediately="true">
        <div className="absolute end-0 top-0 z-10 flex h-full items-center justify-end gap-2 pe-0.5 opacity-0 group-hover:opacity-100 [&:has(:focus-visible)]:opacity-100">
          <span className="contents">
            <button
              type="button"
              title={pinned ? 'Unpin chat' : 'Pin chat'}
              onClick={(e) => {
                e.stopPropagation()
                void setChatPinned(id, !pinned)
              }}
              className={ACTION_BTN}
            >
              {pinned ? <UnpinIcon /> : <PinIcon />}
            </button>
          </span>
          <span className="contents">
            <button
              type="button"
              title="Archive chat"
              onClick={(e) => {
                e.stopPropagation()
                void archiveChat(id)
              }}
              className={ACTION_BTN}
            >
              <ArchiveIcon />
            </button>
          </span>
        </div>
      </div>

      {/* 2. 状态槽 —— 仅非空闲时渲染 */}
      {busy && (
        <div
          data-hover-card-open-immediately="true"
          className="absolute end-0 top-0 z-10 flex h-full min-w-[52px] shrink-0 items-center justify-end gap-2 pe-1 group-hover:hidden group-has-[:focus-visible]:hidden group-data-[title-aligned-trailing-rail=true]:relative group-data-[title-aligned-trailing-rail=true]:h-5 group-data-[title-aligned-trailing-rail=true]:min-w-0 group-data-[title-aligned-trailing-rail=true]:pe-0"
          title={
            errored ? 'Stopped with an error' : awaitingApproval ? 'Waiting for you' : 'Running'
          }
        >
          <span className="flex h-5 min-w-5 items-center justify-center">
            <div className="relative flex size-5 shrink-0 items-center justify-center text-token-description-foreground">
              <span className="icon-xs relative scale-50">
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
              </span>
            </div>
          </span>
        </div>
      )}

      {/* 3. 内容行 */}
      <div className="flex h-full w-full items-center text-sm leading-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex w-4 shrink-0 items-center justify-center">
            <div className="relative flex items-center justify-center" />
          </div>
          <div
            data-thread-title-trigger="true"
            className={`flex min-w-0 flex-1 items-center gap-2 self-stretch text-base leading-5 ${
              running ? 'text-[var(--vscode-foreground)]' : 'text-token-foreground'
            }`}
          >
            <span
              data-thread-title="true"
              data-marquee-text="true"
              draggable={false}
              className="codex-viewport codex-animateOnGroupHover codex-stopAtEnd min-w-0 flex-1 select-none"
            >
              <span className="codex-clipViewport">
                <span className="codex-track">
                  <span className={CODEX_CLASS.content_19mhu} data-marquee-content="true">
                    <span>{title}</span>
                  </span>
                </span>
              </span>
            </span>
          </div>
        </div>
        <div className="ms-[3px] flex items-center justify-end gap-1 group-hover:min-w-12 group-has-[:focus-visible]:min-w-12" />
        {busy && <div className="shrink-0 group-hover:hidden group-has-[:focus-visible]:hidden" />}
      </div>

      {card.anchor && (
        <ChatHoverCard
          chat={chat}
          anchor={card.anchor}
          onMouseEnter={card.scheduleOpen}
          onMouseLeave={card.scheduleClose}
          onClose={card.close}
        />
      )}
    </div>
  )
}
