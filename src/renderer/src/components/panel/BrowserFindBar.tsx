import { useEffect, useRef, useState } from 'react'
import { CloseIcon, SubmenuChevronIcon } from '../icons'
import type { BrowserPageCommand } from '@shared/host/messages'
import { subscribeHostMessage } from '../../host/hostMessages'

/**
 * Browser 页内查找条。
 *
 * 查找**全部走宿主**：渲染层发 `set-find-query` / `find-next` / `find-previous` /
 * `close-find`，命中数从宿主的 `browser-sidebar-find-state` 回来（宿主侧监听
 * guest 的 `found-in-page`）。
 *
 * 为什么不在渲染层直接 `webview.findInPage`：webview 已经不住在这个组件里了
 *（见 BrowserSurfaceLayer），而且 agent 也可能在查找 —— 命中数只能有一个来源。
 */
export function BrowserFindBar({
  conversationId,
  browserTabId,
  runPageCommand,
  onClose
}: {
  conversationId: string
  browserTabId: string
  runPageCommand(command: BrowserPageCommand): void
  onClose(): void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<{ active: number; total: number } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 命中数来自宿主（它监听 guest 的 found-in-page）
  useEffect(
    () =>
      subscribeHostMessage('browser-sidebar-find-state', (message) => {
        if (message.conversationId !== conversationId || message.browserTabId !== browserTabId) {
          return
        }
        setMatches({ total: message.matches, active: message.activeMatchOrdinal })
      }),
    [conversationId, browserTabId]
  )

  // 关闭时让宿主清掉高亮
  useEffect(
    () => () => runPageCommand({ type: 'close-find' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在卸载时收尾
    []
  )

  useEffect(() => {
    runPageCommand({ type: 'set-find-query', query })
    if (query === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 清空查询时同步重置计数
      setMatches(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runPageCommand 每次渲染都是新函数
  }, [query])

  const step = (forward: boolean): void => {
    if (query === '') return
    runPageCommand({ type: forward ? 'find-next' : 'find-previous' })
  }

  return (
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-token-border bg-token-dropdown-background/90 px-2 py-1 shadow-xl-spread backdrop-blur-sm">
      <input
        ref={inputRef}
        type="text"
        value={query}
        aria-label="Find in page"
        placeholder="Find in page…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(!e.shiftKey)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        className="w-44 appearance-none border-none bg-transparent py-0.5 text-sm text-token-foreground outline-none select-text placeholder:text-token-input-placeholder-foreground"
      />
      <span className="shrink-0 text-xs text-token-description-foreground tabular-nums">
        {matches == null
          ? ''
          : matches.total === 0
            ? '0 results'
            : `${matches.active} / ${matches.total}`}
      </span>
      <button
        type="button"
        aria-label="Previous result"
        onClick={() => step(false)}
        className="flex size-5 items-center justify-center rounded-md text-token-text-tertiary hover:bg-token-list-hover-background"
      >
        <SubmenuChevronIcon className="icon-2xs -rotate-90" />
      </button>
      <button
        type="button"
        aria-label="Next result"
        onClick={() => step(true)}
        className="flex size-5 items-center justify-center rounded-md text-token-text-tertiary hover:bg-token-list-hover-background"
      >
        <SubmenuChevronIcon className="icon-2xs rotate-90" />
      </button>
      <button
        type="button"
        aria-label="Close find"
        onClick={onClose}
        className="flex size-5 items-center justify-center rounded-md text-token-text-tertiary hover:bg-token-list-hover-background"
      >
        <CloseIcon className="icon-2xs" />
      </button>
    </div>
  )
}
