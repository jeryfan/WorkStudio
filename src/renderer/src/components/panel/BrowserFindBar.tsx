import { useEffect, useRef, useState } from 'react'
import { CloseIcon, SubmenuChevronIcon } from '../icons'

/**
 * Browser 页内查找条 —— Codex 的浏览器查找由宿主叠加层渲染(`open-find-in-page`
 * 宿主消息),webview 里无 DOM 可取证;此处是同设计语义的推断实现(参照
 * Codex threadFindBar 家族:输入框 + n/m 结果计数 + 上一个/下一个/关闭)。
 *
 * 查找能力:webview.findInPage(text) + found-in-page 事件(matches/activeMatchOrdinal);
 * 关闭时 stopFindInPage('clearSelection')。
 */
export function BrowserFindBar({
  viewRef,
  onClose
}: {
  viewRef: React.RefObject<HTMLElement | null>
  onClose(): void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<{ active: number; total: number } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const view = viewRef.current as unknown as {
      findInPage?(text: string, opts?: { forward?: boolean; findNext?: boolean }): void
      stopFindInPage?(action: string): void
      addEventListener(type: string, fn: (e: unknown) => void): void
      removeEventListener(type: string, fn: (e: unknown) => void): void
    } | null
    if (!view) return
    const onFound = (e: unknown): void => {
      const r = e as { result?: { matches?: number; activeMatchOrdinal?: number } }
      if (r.result?.matches != null) {
        setMatches({ total: r.result.matches, active: r.result.activeMatchOrdinal ?? 0 })
      }
    }
    view.addEventListener('found-in-page', onFound)
    return () => {
      view.removeEventListener('found-in-page', onFound)
      view.stopFindInPage?.('clearSelection')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current as unknown as {
      findInPage?(t: string): void
      stopFindInPage?(a: string): void
    } | null
    if (!view) return
    if (query === '') {
      view.stopFindInPage?.('clearSelection')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 清空查询时同步重置计数(webview 外部状态)
      setMatches(null)
      return
    }
    view.findInPage?.(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const step = (forward: boolean): void => {
    const view = viewRef.current as unknown as {
      findInPage?(t: string, opts?: { forward?: boolean; findNext?: boolean }): void
    } | null
    if (query === '') return
    view?.findInPage?.(query, { forward, findNext: true })
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
