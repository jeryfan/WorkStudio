import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../../state/WorkspaceContext'
import { NewChatIcon, OpenFolderIcon, SettingsIcon, type IconProps } from '../icons'
import type { ComponentType } from 'react'

interface CmdItem {
  id: string
  label: string
  group: string
  icon?: ComponentType<IconProps>
  /** 未读任务显示蓝点 */
  unreadDot?: boolean
  project?: string
  kbd?: string
}

/**
 * sider/2.html Command Menu（第 3415-3722 行，CSS 第 966-1153 行）：
 * 520px 居中对话框，分组列表（Chats / Unread / Suggested / Switch project），
 * 输入过滤 + ↑↓ 选择 + Enter 确认 + Esc 关闭。
 */
export function CommandPalette({ onClose }: { onClose(): void }): React.JSX.Element {
  const { projects, chats } = useWorkspace()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const groups = useMemo(() => {
    const projectNames = new Map(projects.map((p) => [p.id, p.name]))
    const allChats = chats.map((t) => ({
      ...t,
      projectName: t.projectId ? (projectNames.get(t.projectId) ?? '') : ''
    }))
    const items: CmdItem[] = [
      // Chats：前 9 个会话带 ⌘1-9 快捷键
      ...allChats.slice(0, 9).map((t, i) => ({
        id: `chat-${t.id}`,
        label: t.title,
        group: 'Chats',
        project: t.projectName,
        kbd: `⌘${i + 1}`
      })),
      // 未读分组待接入：协议不提供未读标记，上游用的是客户端侧维护的
      // attention state，本项目尚未实现，先不展示空分组。
      // Suggested
      { id: 'new-chat', label: 'New chat', group: 'Suggested', icon: NewChatIcon, kbd: '⌘N' },
      {
        id: 'open-folder',
        label: 'Open folder',
        group: 'Suggested',
        icon: OpenFolderIcon,
        kbd: '⌘O'
      },
      { id: 'settings', label: 'Settings', group: 'Suggested', icon: SettingsIcon, kbd: '⌘,' },
      // Switch project
      ...projects.map((p) => ({
        id: `switch-${p.id}`,
        label: p.name,
        group: 'Switch project'
      }))
    ]
    const q = query.trim().toLowerCase()
    const filtered = q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items
    const byGroup = new Map<string, CmdItem[]>()
    for (const it of filtered) {
      const list = byGroup.get(it.group) ?? []
      list.push(it)
      byGroup.set(it.group, list)
    }
    return [...byGroup.entries()].map(([name, list]) => ({ name, list }))
  }, [projects, chats, query])

  const flat = groups.flatMap((g) => g.list)

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onClose()
    }
  }

  let rowIndex = -1

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/[0.133]" onMouseDown={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-32px)] w-[520px] -translate-x-1/2 -translate-y-1/2"
        role="dialog"
        aria-label="Search chats or run a command"
      >
        <div className="flex max-h-[504px] min-w-full flex-col gap-1 overflow-hidden rounded-[20px] border border-transparent bg-white p-1 text-sm leading-[21px] shadow-[0_16px_32px_-8px_rgb(0_0_0/0.19)]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search chats or run a command"
            className="block h-[33px] w-full border-none bg-transparent px-2.5 py-1.5 text-sm leading-[21px] text-ink outline-none placeholder:text-desc"
          />
          <div className="flex max-h-[440px] flex-col gap-1 overflow-y-auto transition-[max-height] duration-150">
            {groups.map((g) => (
              <div key={g.name} className="flex flex-col gap-1">
                <div className="block px-2 pb-0 pt-2 text-[13px] text-desc">{g.name}</div>
                <div className="flex flex-col gap-1">
                  {g.list.map((item) => {
                    rowIndex += 1
                    const selected = rowIndex === active
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActive(rowIndex)}
                        onClick={onClose}
                        className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-[5px] text-left text-sm text-ink ${
                          selected ? 'bg-row-hover' : ''
                        }`}
                      >
                        {item.unreadDot ? (
                          <span className="size-4 shrink-0">
                            <span className="flex size-5 items-center justify-center">
                              <span className="size-2 rounded-full bg-focus" />
                            </span>
                          </span>
                        ) : item.icon ? (
                          <span className="size-4 shrink-0 [&_svg]:size-4">
                            <item.icon />
                          </span>
                        ) : (
                          item.group !== 'Switch project' && <span className="size-5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex w-full min-w-0 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            <span className="ml-auto flex min-w-0 items-center gap-2">
                              {item.project && (
                                <span className="w-24 shrink-0 truncate text-right text-[13px] text-desc">
                                  {item.project}
                                </span>
                              )}
                              {item.kbd && (
                                <kbd className="inline-flex shrink-0 whitespace-nowrap rounded-md bg-ink-10 px-1.5 py-0.5 text-xs leading-none opacity-80">
                                  {item.kbd}
                                </kbd>
                              )}
                            </span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
