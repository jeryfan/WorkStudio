import { useRef, useState } from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { useAppShell } from '../../state/AppShellContext'
import { useThreadWorkspace } from '../../state/threadWorkspace'
import { openSideChat } from '../panel/sideChat/openSideChat'
import { dangerToast } from '../../state/toastStore'
import { copyText } from '../../utils/clipboard'
import {
  ArchiveIcon,
  CopyIcon,
  DotsIcon,
  FolderIcon,
  PinIcon,
  RemoveIcon,
  RenameIcon,
  SideChatIcon,
  SubmenuChevronIcon,
  UnpinIcon,
  type IconProps
} from '../icons'
import type { ComponentType } from 'react'

/**
 * thread 顶部的三点菜单 —— Codex `Pt`（chunk `thread-overflow-menu-Co1P8oAT.js`）。
 *
 * Codex 的完整项与顺序（逐字，`aria-label` 是 `threadHeader.moreActions` =
 * "Chat actions"）：
 *
 *   1. Pin chat / Unpin chat                     (canPin)
 *   2. Rename chat
 *   3. Move to project ▸ / Remove from project   (`kt`，按项目归属出现)
 *   4. Archive chat
 *   ── Separator
 *   5. Open side chat                            (有会话且 side chat 可开)
 *   6. Copy ▸ : Copy working directory / Copy session ID / Copy deeplink /
 *               Copy as Markdown
 *   7. Continue in… ▸ : Continue in new chat / Continue in new worktree
 *   8. Add scheduled task… / Edit scheduled task…
 *   ── Separator                                 (仅当能开新窗口)
 *   9. Open in new window
 *
 * 本项目实现 1–6 的可执行部分，缺的四项都是**本项目没有那个能力**，不是漏了：
 * - `Copy deeplink`：需要 Codex 的 deeplink scheme（宿主未注册协议）
 * - `Copy as Markdown`：需要会话 → Markdown 的序列化器（未接）
 * - `Continue in…`：thread/fork 到新会话/新 worktree，worktree 能力未接
 * - 计划任务 / Open in new window：automations 与多窗口都未接
 *
 * 一处刻意的差异（已标）：Codex 的 "Rename chat" 打开一个重命名**对话框**，
 * 那个对话框的 DOM 没有取证到；本项目改为把 header 上的标题切进行内编辑态
 * （标题本身就是 Codex 的可改名标题 `ut`/`WNc`，同一个组件），
 * 不凭想象画一个 Codex 对话框。
 */

const ITEM_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col'

const CONTENT_CLASS =
  'no-drag z-50 m-px flex select-none flex-col overflow-y-auto px-1 py-1 bg-token-dropdown-background/90 text-token-foreground ring-token-border rounded-xl ring-[0.5px] shadow-xl-spread backdrop-blur-sm w-[240px]'

const CONTENT_STYLE = {
  maxWidth: 'min(var(--radix-dropdown-menu-content-available-width), calc(100vw - 16px))',
  maxHeight: 'min(var(--radix-dropdown-menu-content-available-height), calc(100vh - 16px))'
} as const

function Row({
  Icon,
  label,
  submenu = false
}: {
  Icon: ComponentType<IconProps>
  label: string
  submenu?: boolean
}): React.JSX.Element {
  return (
    <div className="flex w-full items-center gap-1.5">
      <Icon className="icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {submenu && <SubmenuChevronIcon className="icon-xs shrink-0 opacity-60" />}
    </div>
  )
}

export function ThreadOverflowMenu({
  chatId,
  onRenameRequest
}: {
  chatId: string
  /** Codex 走重命名对话框；本项目把 header 标题切进编辑态（见文件头说明） */
  onRenameRequest(): void
}): React.JSX.Element {
  const { chats, projects, setChatPinned, archiveChat, assignChatToProject } = useWorkspace()
  const { closeChat } = useChatRuntime()
  const { rightPanelController, rightPanelOpen } = useAppShell()
  const { cwd } = useThreadWorkspace()
  const [open, setOpen] = useState(false)
  /*
   * 菜单关完再执行的动作(Codex `deferSelectionUntilDropdownClose` 同一套):
   * "Rename chat" 要把 header 标题切进编辑态并聚焦那个 input,而 Radix 关菜单时
   * 会把焦点抢回 trigger —— 实测焦点被抢走后 Escape 到不了 input,编辑态退不出去。
   * 所以选中时只记下动作,等 onCloseAutoFocus(preventDefault 拦住默认聚焦)再跑。
   */
  const deferredRef = useRef<(() => void) | null>(null)
  const chat = chats.find((c) => c.id === chatId)
  const pinned = chat?.pinned === true
  const projectId = chat?.projectId ?? null

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          aria-label="Chat actions"
          className="no-drag cursor-interaction flex aspect-square h-token-button-composer shrink-0 items-center justify-center rounded-lg text-token-text-tertiary hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background"
        >
          <DotsIcon className="icon-sm" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          className={CONTENT_CLASS}
          style={CONTENT_STYLE}
          onCloseAutoFocus={(event) => {
            const deferred = deferredRef.current
            if (deferred == null) return
            deferredRef.current = null
            event.preventDefault()
            deferred()
          }}
        >
          <Dropdown.Item
            className={ITEM_CLASS}
            onSelect={() => void setChatPinned(chatId, !pinned)}
          >
            <Row Icon={pinned ? UnpinIcon : PinIcon} label={pinned ? 'Unpin chat' : 'Pin chat'} />
          </Dropdown.Item>
          <Dropdown.Item
            className={ITEM_CLASS}
            onSelect={() => {
              deferredRef.current = onRenameRequest
            }}
          >
            <Row Icon={RenameIcon} label="Rename chat" />
          </Dropdown.Item>
          {projectId == null ? (
            projects.length > 0 && (
              <Dropdown.Sub>
                <Dropdown.SubTrigger className={ITEM_CLASS}>
                  <Row Icon={FolderIcon} label="Move to project" submenu />
                </Dropdown.SubTrigger>
                <Dropdown.Portal>
                  <Dropdown.SubContent className={CONTENT_CLASS} style={CONTENT_STYLE}>
                    {projects.map((project) => (
                      <Dropdown.Item
                        key={project.id}
                        className={ITEM_CLASS}
                        onSelect={() => void assignChatToProject(chatId, project.id)}
                      >
                        <Row Icon={FolderIcon} label={project.name} />
                      </Dropdown.Item>
                    ))}
                  </Dropdown.SubContent>
                </Dropdown.Portal>
              </Dropdown.Sub>
            )
          ) : (
            <Dropdown.Item
              className={ITEM_CLASS}
              onSelect={() => void assignChatToProject(chatId, null)}
            >
              <Row Icon={RemoveIcon} label="Remove from project" />
            </Dropdown.Item>
          )}
          <Dropdown.Item
            className={ITEM_CLASS}
            onSelect={() => {
              /*
               * Codex 归档后导航回首页(`archiveNavigation: 'home'` →
               * `navigate('/', {replace:true})`)。本项目主区靠 activeChatId 切视图,
               * 等价动作就是关掉当前会话。
               */
              void archiveChat(chatId).then(() => closeChat())
            }}
          >
            <Row Icon={ArchiveIcon} label="Archive chat" />
          </Dropdown.Item>
          <div className="w-full px-2 pt-1 pb-2">
            <div className="h-px w-full bg-token-menu-border" />
          </div>
          <Dropdown.Item
            className={ITEM_CLASS}
            onSelect={() => {
              void openSideChat({
                controller: rightPanelController,
                sourceChatId: chatId,
                cwd,
                panelOpen: rightPanelOpen
              }).catch((error: unknown) => {
                console.error('Failed to open side chat', error)
                dangerToast('Failed to open side chat')
              })
            }}
          >
            <Row Icon={SideChatIcon} label="Open side chat" />
          </Dropdown.Item>
          <Dropdown.Sub>
            <Dropdown.SubTrigger className={ITEM_CLASS}>
              <Row Icon={CopyIcon} label="Copy" submenu />
            </Dropdown.SubTrigger>
            <Dropdown.Portal>
              <Dropdown.SubContent className={CONTENT_CLASS} style={CONTENT_STYLE}>
                <Dropdown.Item
                  className={ITEM_CLASS}
                  disabled={cwd == null}
                  onSelect={() => {
                    if (cwd != null) void copyText(cwd)
                  }}
                >
                  <Row Icon={CopyIcon} label="Copy working directory" />
                </Dropdown.Item>
                <Dropdown.Item className={ITEM_CLASS} onSelect={() => void copyText(chatId)}>
                  <Row Icon={CopyIcon} label="Copy session ID" />
                </Dropdown.Item>
              </Dropdown.SubContent>
            </Dropdown.Portal>
          </Dropdown.Sub>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
