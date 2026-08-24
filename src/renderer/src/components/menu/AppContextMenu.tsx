import { cloneElement, isValidElement, useCallback, type ReactElement, type ReactNode } from 'react'
import * as RadixContextMenu from '@radix-ui/react-context-menu'

/**
 * 右键上下文菜单 —— Codex `gv`(app-initial:81830)的 WS 移植。
 *
 * Codex 行为:
 * - Electron 下走原生菜单(`window.electronBridge.showContextMenu(items)`
 *   → 返回选中项 id);浏览器环境退 Radix ContextMenu。
 * - `getItems` 可返回 Promise(tab 的 contextMenuItems 就是异步的):
 *   `awaitBeforeOpen`(默认 true)= 打开前 await;false = 先开旧内容、
 *   异步回来再刷新。原生路径没有"打开后再刷新",awaitBeforeOpen=false 时
 *   先同步取一次(可能是空)再 await 刷新后弹出 —— Codex 原生路径同样
 *   是先 `s?.()` 再 `y()`,见 gv 的 b/x 两个闭包。
 * - 菜单项模型:{id, label(WS 直接是字符串;Codex 是 intl message),
 *   onSelect, enabled, type:'separator', iconFile, submenu}。
 */

export interface AppContextMenuItem {
  id: string
  label?: string
  onSelect?: () => void
  /** 缺省 true(Codex `enabled`) */
  enabled?: boolean
  type?: 'normal' | 'separator'
  /** 编辑器图标(assets/apps 文件名,原生菜单用) */
  iconFile?: string
  submenu?: AppContextMenuItem[]
}

interface AppContextMenuProps {
  /** 静态项,或工厂(可异步)。getItems 优先于 items */
  items?: AppContextMenuItem[]
  getItems?: () => AppContextMenuItem[] | Promise<AppContextMenuItem[]>
  /** 默认 true;false 时不等异步项就先弹(原生下等同先弹同步部分) */
  awaitBeforeOpen?: boolean
  /** 打开前的预取钩子(Codex 用它预取 open targets) */
  onBeforeOpen?: () => Promise<void> | void
  children: ReactNode
}

/** 在项树(含 submenu)里按 id 找 onSelect */
function findHandler(items: AppContextMenuItem[], id: string): (() => void) | null {
  for (const item of items) {
    if (item.id === id) return item.onSelect ?? null
    if (item.submenu) {
      const found = findHandler(item.submenu, id)
      if (found) return found
    }
  }
  return null
}

/** 宿主(主进程)契约 —— 与 preload CodexBridge.showContextMenu 的参数一致 */
interface NativeContextMenuItem {
  id: string
  label: string
  enabled?: boolean
  type?: 'normal' | 'separator'
  iconFile?: string
  submenu?: NativeContextMenuItem[]
}

/** 序列化成宿主契约(只留数据,不带函数) */
function serializeItems(items: AppContextMenuItem[]): NativeContextMenuItem[] {
  return items.map((item) =>
    item.type === 'separator'
      ? { id: item.id, label: '', type: 'separator' as const }
      : {
          id: item.id,
          label: item.label ?? '',
          enabled: item.enabled !== false,
          iconFile: item.iconFile,
          submenu: item.submenu ? serializeItems(item.submenu) : undefined
        }
  )
}

export function AppContextMenu({
  items,
  getItems,
  awaitBeforeOpen = true,
  onBeforeOpen,
  children
}: AppContextMenuProps): React.JSX.Element {
  // 原生路径(Codex 的 d 分支):electronBridge.showContextMenu 可用
  const native = window.codexBridge?.showContextMenu != null

  const resolveItems = useCallback(async (): Promise<AppContextMenuItem[]> => {
    if (getItems) {
      const result = getItems()
      return result instanceof Promise ? await result : result
    }
    return items ?? []
  }, [getItems, items])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      void (async () => {
        if (awaitBeforeOpen) {
          await onBeforeOpen?.()
          const resolved = await resolveItems()
          const selectedId = await window.codexBridge.showContextMenu(serializeItems(resolved))
          if (selectedId != null) findHandler(resolved, selectedId)?.()
        } else {
          // Codex gv 的 awaitBeforeOpen=false:onBeforeOpen 异步跑着,菜单先弹
          const prefetch = onBeforeOpen?.()
          const resolved = await resolveItems()
          await prefetch
          const selectedId = await window.codexBridge.showContextMenu(serializeItems(resolved))
          if (selectedId != null) findHandler(resolved, selectedId)?.()
        }
      })()
    },
    [awaitBeforeOpen, onBeforeOpen, resolveItems]
  )

  if (native) {
    // Codex gv 的原生路径:clone 子元素挂 onContextMenu,不增加任何 DOM
    if (isValidElement(children)) {
      const child = children as ReactElement<{ onContextMenu?: React.MouseEventHandler }>
      return cloneElement(child, {
        onContextMenu: (e: React.MouseEvent) => {
          child.props.onContextMenu?.(e)
          if (!e.defaultPrevented) onContextMenu(e)
        }
      })
    }
    return (
      <div className="contents" onContextMenu={onContextMenu}>
        {children}
      </div>
    )
  }
  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>
        <div className="contents">{children}</div>
      </RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.Content className="no-drag z-50 m-px flex w-[280px] select-none flex-col overflow-y-auto rounded-xl bg-token-dropdown-background/90 px-1 py-1 text-token-foreground ring-[0.5px] ring-token-border shadow-xl-spread backdrop-blur-sm">
          <RadixItems items={items ?? []} />
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  )
}

function RadixItems({ items }: { items: AppContextMenuItem[] }): React.JSX.Element {
  return (
    <>
      {items.map((item) => {
        if (item.type === 'separator') {
          return (
            <RadixContextMenu.Separator
              key={item.id}
              className="mx-1 my-1 border-t border-token-border/60"
            />
          )
        }
        if (item.submenu) {
          return (
            <RadixContextMenu.Sub key={item.id}>
              <RadixContextMenu.SubTrigger
                disabled={item.enabled === false}
                className="no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm cursor-interaction flex items-center gap-1.5 hover:bg-token-list-hover-background focus:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background"
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </RadixContextMenu.SubTrigger>
              <RadixContextMenu.Portal>
                <RadixContextMenu.SubContent className="no-drag z-50 m-px flex min-w-[180px] select-none flex-col rounded-xl bg-token-dropdown-background/90 px-1 py-1 text-token-foreground ring-[0.5px] ring-token-border shadow-xl-spread backdrop-blur-sm">
                  <RadixItems items={item.submenu} />
                </RadixContextMenu.SubContent>
              </RadixContextMenu.Portal>
            </RadixContextMenu.Sub>
          )
        }
        return (
          <RadixContextMenu.Item
            key={item.id}
            disabled={item.enabled === false}
            onSelect={() => item.onSelect?.()}
            className="no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm cursor-interaction flex items-center gap-1.5 hover:bg-token-list-hover-background focus:bg-token-list-hover-background"
          >
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </RadixContextMenu.Item>
        )
      })}
    </>
  )
}
