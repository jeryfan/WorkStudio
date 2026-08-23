import {
  cloneElement,
  createContext,
  useMemo,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'
import { createPortal } from 'react-dom'
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  type Placement
} from '@floating-ui/react-dom'
import { cx } from '../../utils/cx'
import { watchSafeTriangle, type TooltipSide } from './safeTriangle'

/**
 * Codex 的 tooltip 原语 —— **悬浮卡片和普通 tooltip 是同一个组件**,
 * 区别只在 `variant`:`'tooltip'` 是小黑框,`'rich'` 是那张 15px 圆角、
 * 半透明 + 背景模糊的卡片。侧栏的项目/会话悬浮面板走的正是 `variant="rich"`
 * + `interactive`,不是另一套 HoverCard 组件。
 *
 * 这一点是从 bundle 逆出来的(`Lh` / `utt` / `dtt`),并且用运行中的 Codex
 * 实测确认过:hover 项目行 800ms 后 body 下出现
 * `div[role="tooltip"][data-side="right"]`,类名与 `variant==='rich'` 分支
 * 逐字相同(`bg-token-dropdown-background/90 … ring-[0.5px] backdrop-blur-sm`)。
 * 之前 WS 自己写了一套 `useHoverCard` + 固定定位的卡片,DOM 契约完全不同。
 *
 * ## 时序(全是 bundle 里的常量,别凭手感改)
 *
 * | 常量 | 值 | 作用 |
 * |---|---|---|
 * | `DEFAULT_DELAY_DURATION` | 700ms | 默认开启延迟(`Ett`) |
 * | `SKIP_DELAY_DURATION` | 300ms | 刚关掉一个之后的「免延迟」窗口(`Dtt`) |
 * | `DELAY_OPEN_DURATION` | 250ms | `delayOpen` 时用的短延迟 |
 * | `HOVER_HANDOFF_DELAY` | 100ms | interactive 交接的定时器(`ktt`) |
 *
 * 另有一条**空间**规则:指针进入 `[data-hover-card-open-immediately]` 子树时
 * 延迟直接归 0(`bjc` + `getDelayDuration`)。侧栏把它挂在会话行的操作区与
 * 状态槽上 —— 鼠标已经精确落到那些小图标上了,再等 700ms 是多余的。
 *
 * ## 触发器
 *
 * `triggerAsChild`(默认 true)下分三种形态,与 Codex 一致:
 * - children 是 DOM 标签元素 → **cloneElement**,把 `data-state` /
 *   `aria-describedby` / 指针事件合并到那个元素本身
 * - children 是组件 → 外面包 `span.contents`(所以侧栏里到处是
 *   `span.contents[data-state="closed"]`)
 * - `triggerAsChild={false}` → 包一个 `button`
 */

const DEFAULT_DELAY_DURATION = 700
const SKIP_DELAY_DURATION = 300
const DELAY_OPEN_DURATION = 250
const HOVER_HANDOFF_DELAY = 100
const DEFAULT_SKIP_DELAY_KEY = 'default'
const TOOLTIP_OVERFLOW_TARGET = '[data-tooltip-overflow-target]'
const TOOLTIP_VISIBILITY_TARGET = '[data-tooltip-visibility-target]'

const EMPTY_RECT: DOMRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({})
} as DOMRect

export type TooltipVariant = 'tooltip' | 'rich' | 'unstyled'
export type TooltipAlign = 'start' | 'center' | 'end'
/** `always` 常开;另两档只在触发器溢出 / 指定探针被隐藏时才开 */
export type TooltipOpenWhen = 'always' | 'trigger-overflows' | 'visibility-target-hidden'

interface TooltipManager {
  activateTooltip(
    id: string,
    skipDelayKey: string,
    variant: TooltipVariant,
    close: () => void
  ): void
  deactivateTooltip(id: string): void
  getOpenDelay(skipDelayKey: string, delay: number): number
  registerOpenTooltip(id: string, variant: TooltipVariant, close: () => void): () => void
  registerTooltipDismissHandler(id: string, dismiss: () => void): () => void
  isHoverOpenBlocked(id: string): boolean
  setHoverHandoffLockTooltipId(id: string): void
  clearHoverHandoffLock(id: string): void
}

const TooltipManagerContext = createContext<TooltipManager | null>(null)
const TooltipDelayContext = createContext<number | null>(null)
/** 窗口缩放 —— Codex 的 `Oh()`。zoom≠1 时浮层要额外套一层抵掉缩放 */
const WindowZoomContext = createContext(1)

/**
 * 全局 tooltip 管理器 —— 三件事:
 *
 * 1. **互斥**:开一个就关掉别人。注意 `variant` 参与判断 —— 普通 tooltip
 *    不许关掉 rich 卡片(`r.variant !== 'tooltip' && n === 'tooltip'` 跳过),
 *    否则鼠标扫过卡片里的小图标时卡片会被自己的子 tooltip 关掉。
 * 2. **免延迟窗口**:刚关掉一个之后的 300ms 内,同 `skipDelayKey` 的下一个
 *    立即开。这是「沿着一列行往下扫」时不再每行等 700ms 的原因。
 * 3. **交接锁**:interactive 卡片正在做安全三角交接时,别的 tooltip 不许抢开。
 */
export function TooltipProvider({
  children,
  delayDuration = DEFAULT_DELAY_DURATION,
  skipDelayDuration = SKIP_DELAY_DURATION
}: {
  children: ReactNode
  delayDuration?: number
  skipDelayDuration?: number
}): React.JSX.Element {
  const openTooltips = useRef(new Map<string, { close: () => void; variant: TooltipVariant }>())
  const dismissHandlers = useRef(new Map<string, () => void>())
  const activeId = useRef<string | null>(null)
  const skipDelayKey = useRef<string | null>(null)
  const skipDelayActive = useRef(false)
  const hoverHandoffLockId = useRef<string | null>(null)
  const skipTimer = useRef<number | null>(null)

  const clearSkipTimer = useCallback((): void => {
    if (skipTimer.current == null) return
    window.clearTimeout(skipTimer.current)
    skipTimer.current = null
  }, [])

  const manager = useMemo<TooltipManager>(
    () => ({
      activateTooltip(id, key, variant, close) {
        for (const [openId, entry] of openTooltips.current) {
          if (openId === id) continue
          if (entry.variant !== 'tooltip' && variant === 'tooltip') continue
          entry.close()
        }
        activeId.current = id
        if (hoverHandoffLockId.current !== id) hoverHandoffLockId.current = null
        openTooltips.current.set(id, { close, variant })
        clearSkipTimer()
        skipDelayKey.current = key
        skipDelayActive.current = true
      },
      deactivateTooltip(id) {
        openTooltips.current.delete(id)
        if (activeId.current !== id) return
        activeId.current = null
        hoverHandoffLockId.current = null
        clearSkipTimer()
        if (skipDelayDuration === 0) {
          skipDelayKey.current = null
          skipDelayActive.current = false
          return
        }
        skipTimer.current = window.setTimeout(() => {
          skipTimer.current = null
          skipDelayKey.current = null
          skipDelayActive.current = false
        }, skipDelayDuration)
      },
      getOpenDelay(key, delay) {
        return skipDelayActive.current && skipDelayKey.current === key ? 0 : delay
      },
      registerOpenTooltip(id, variant, close) {
        openTooltips.current.set(id, { close, variant })
        return () => {
          openTooltips.current.delete(id)
        }
      },
      registerTooltipDismissHandler(id, dismiss) {
        dismissHandlers.current.set(id, dismiss)
        return () => {
          dismissHandlers.current.delete(id)
        }
      },
      isHoverOpenBlocked(id) {
        return hoverHandoffLockId.current != null && hoverHandoffLockId.current !== id
      },
      setHoverHandoffLockTooltipId(id) {
        hoverHandoffLockId.current = id
      },
      clearHoverHandoffLock(id) {
        if (hoverHandoffLockId.current === id) hoverHandoffLockId.current = null
      }
    }),
    [clearSkipTimer, skipDelayDuration]
  )

  // 窗口失焦时收掉所有浮层 —— 否则切走再切回来会看到一张悬空的卡片
  useEffect(() => {
    const dismissAll = (): void => {
      const handlers = Array.from(dismissHandlers.current.values())
      openTooltips.current.clear()
      activeId.current = null
      skipDelayKey.current = null
      skipDelayActive.current = false
      hoverHandoffLockId.current = null
      clearSkipTimer()
      for (const dismiss of handlers) dismiss()
    }
    window.addEventListener('blur', dismissAll)
    return () => {
      window.removeEventListener('blur', dismissAll)
      clearSkipTimer()
    }
  }, [clearSkipTimer])

  return (
    <TooltipDelayContext.Provider value={delayDuration}>
      <TooltipManagerContext.Provider value={manager}>{children}</TooltipManagerContext.Provider>
    </TooltipDelayContext.Provider>
  )
}

export interface TooltipProps {
  children: ReactNode
  /** 卡片/提示的内容;`null` 直接透传 children(与 Codex 的短路一致) */
  tooltipContent?: ReactNode
  /** 只在这些情形下才开 —— 默认 always */
  openWhen?: TooltipOpenWhen
  variant?: TooltipVariant
  color?: 'default' | 'inverse'
  side?: TooltipSide
  align?: TooltipAlign
  sideOffset?: number
  alignOffset?: number
  /** 允许鼠标滑进浮层(悬浮卡片必开):启用安全三角交接 */
  interactive?: boolean
  /** true → 用 250ms 短延迟代替默认 700ms */
  delayOpen?: boolean
  delayDuration?: number
  /** `(event, delay) => delay` —— 侧栏用它把「已经落在小图标上」的延迟改成 0 */
  getDelayDuration?(event: ReactPointerEvent, delay: number): number
  disableHoverOpen?: boolean
  disablePadding?: boolean
  disabled?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?(open: boolean): void
  /** false → 包一个 button 而不是复用 children 元素 */
  triggerAsChild?: boolean
  closeOnTriggerBlur?: boolean
  skipDelayKey?: string
  tooltipClassName?: string
  tooltipBodyClassName?: string
  tooltipMaxWidth?: string
  className?: string
  portalContainer?: HTMLElement | null
}

function placementOf(side: TooltipSide, align?: TooltipAlign): Placement {
  return align == null || align === 'center' ? side : (`${side}-${align}` as Placement)
}

function sideOf(placement: Placement): TooltipSide {
  if (placement === 'top' || placement.startsWith('top-')) return 'top'
  if (placement === 'right' || placement.startsWith('right-')) return 'right'
  if (placement === 'bottom' || placement.startsWith('bottom-')) return 'bottom'
  return 'left'
}

function oppositeSide(side: TooltipSide): TooltipSide {
  switch (side) {
    case 'top':
      return 'bottom'
    case 'right':
      return 'left'
    case 'bottom':
      return 'top'
    case 'left':
      return 'right'
  }
}

function contains(container: HTMLElement | null, node: EventTarget | null): boolean {
  return node instanceof Node && container?.contains(node) === true
}

function joinIds(a: string | undefined, b: string | undefined): string | undefined {
  if (a == null) return b
  if (b == null) return a
  return `${a} ${b}`
}

function isOverflowing(el: HTMLElement | null): boolean {
  const target = el?.querySelector<HTMLElement>(TOOLTIP_OVERFLOW_TARGET) ?? el
  return (
    target != null &&
    (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight)
  )
}

function shouldOpen(trigger: HTMLElement | null, openWhen: TooltipOpenWhen): boolean {
  switch (openWhen) {
    case 'always':
      return true
    case 'trigger-overflows':
      return isOverflowing(trigger)
    case 'visibility-target-hidden': {
      const probe = trigger?.querySelector<HTMLElement>(TOOLTIP_VISIBILITY_TARGET)
      return probe != null && getComputedStyle(probe).display === 'none'
    }
  }
}

function assignRef<T>(ref: Ref<T> | undefined, value: T): void {
  if (ref == null) return
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  ;(ref as { current: T }).current = value
}

export function Tooltip(props: TooltipProps): React.JSX.Element {
  const contextDelay = useContext(TooltipDelayContext)
  // 与 Codex 一致的短路:禁用或没内容时组件完全不参与,children 原样返回
  if (props.disabled === true || props.tooltipContent == null) {
    return <>{props.children}</>
  }
  return (
    <TooltipRoot
      {...props}
      delayDuration={props.delayDuration ?? contextDelay ?? DEFAULT_DELAY_DURATION}
    />
  )
}

function TooltipRoot({
  children,
  tooltipContent,
  openWhen = 'always',
  variant = 'tooltip',
  color = 'default',
  side = 'top',
  align = 'center',
  sideOffset = 2,
  alignOffset,
  interactive = false,
  delayOpen = false,
  delayDuration,
  getDelayDuration,
  disableHoverOpen = false,
  disablePadding = false,
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  triggerAsChild = true,
  closeOnTriggerBlur = true,
  skipDelayKey = DEFAULT_SKIP_DELAY_KEY,
  tooltipClassName,
  tooltipBodyClassName,
  tooltipMaxWidth,
  className,
  portalContainer
}: TooltipProps): React.JSX.Element {
  const generatedId = useId()
  const tooltipId = generatedId
  const manager = useContext(TooltipManagerContext)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen === true)
  const triggerRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const placedSideRef = useRef<TooltipSide>(side)
  /*
   * 浮层节点与实际落位的边由内容层**回调**上来,而不是把 ref 传下去 ——
   * 传 ref 会让内容层在渲染期写别人的 ref(react-hooks/refs 会拦),
   * 而这两个值只在指针事件里读(安全三角要知道往哪个方向让路)。
   */
  const setContentElement = useCallback((el: HTMLDivElement | null): void => {
    contentRef.current = el
  }, [])
  const setPlacedSide = useCallback((next: TooltipSide): void => {
    placedSideRef.current = next
  }, [])
  const getTriggerElement = useCallback((): HTMLElement | null => triggerRef.current, [])
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const stopSafeTriangle = useRef<(() => void) | null>(null)
  const isControlled = controlledOpen !== undefined
  const open = controlledOpen ?? uncontrolledOpen
  const openRef = useRef(open)

  const clearSafeTriangle = useCallback((): void => {
    stopSafeTriangle.current?.()
    stopSafeTriangle.current = null
  }, [])
  const clearOpenTimer = useCallback((): void => {
    if (openTimer.current == null) return
    window.clearTimeout(openTimer.current)
    openTimer.current = null
  }, [])
  const clearCloseTimer = useCallback((): void => {
    if (closeTimer.current == null) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])

  /** 外部强制收起(窗口失焦 / 别的 tooltip 抢开) */
  const dismiss = useCallback((): void => {
    clearOpenTimer()
    clearCloseTimer()
    clearSafeTriangle()
    const wasOpen = openRef.current || (isControlled && open)
    openRef.current = false
    manager?.deactivateTooltip(tooltipId)
    if (!wasOpen) return
    if (!isControlled) setUncontrolledOpen(false)
    onOpenChange?.(false)
  }, [
    clearCloseTimer,
    clearOpenTimer,
    clearSafeTriangle,
    isControlled,
    manager,
    onOpenChange,
    open,
    tooltipId
  ])

  const setOpen = useCallback(
    (next: boolean): void => {
      if (openRef.current === next && (!isControlled || open === next)) return
      openRef.current = next
      if (next) manager?.activateTooltip(tooltipId, skipDelayKey, variant, dismiss)
      else {
        manager?.clearHoverHandoffLock(tooltipId)
        manager?.deactivateTooltip(tooltipId)
      }
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [dismiss, isControlled, manager, onOpenChange, open, skipDelayKey, tooltipId, variant]
  )

  useLayoutEffect(() => {
    openRef.current = open
    clearOpenTimer()
    if (open) return
    clearCloseTimer()
    clearSafeTriangle()
    manager?.clearHoverHandoffLock(tooltipId)
    manager?.deactivateTooltip(tooltipId)
  }, [clearCloseTimer, clearOpenTimer, clearSafeTriangle, manager, open, tooltipId])

  useEffect(
    () => () => {
      clearOpenTimer()
      clearCloseTimer()
      clearSafeTriangle()
      manager?.clearHoverHandoffLock(tooltipId)
      manager?.deactivateTooltip(tooltipId)
    },
    [clearCloseTimer, clearOpenTimer, clearSafeTriangle, manager, tooltipId]
  )

  useEffect(
    () => manager?.registerTooltipDismissHandler(tooltipId, dismiss),
    [dismiss, manager, tooltipId]
  )
  useEffect(() => {
    if (!open) return
    return manager?.registerOpenTooltip(tooltipId, variant, dismiss)
  }, [dismiss, manager, open, tooltipId, variant])

  const scheduleOpen = (delay: number): void => {
    clearCloseTimer()
    clearSafeTriangle()
    if (open || openRef.current) return
    if (openTimer.current != null) {
      // 已经在等了:只有「立即打开」(delay 0)才允许抢占
      if (delay !== 0) return
      clearOpenTimer()
    }
    if (!shouldOpen(triggerRef.current, openWhen)) return
    if (delay === 0) {
      setOpen(true)
      return
    }
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      if (shouldOpen(triggerRef.current, openWhen)) setOpen(true)
    }, delay)
  }

  const close = useCallback((): void => {
    clearOpenTimer()
    clearCloseTimer()
    clearSafeTriangle()
    setOpen(false)
  }, [clearCloseTimer, clearOpenTimer, clearSafeTriangle, setOpen])

  const releaseHandoff = (): void => {
    manager?.clearHoverHandoffLock(tooltipId)
    clearCloseTimer()
    clearSafeTriangle()
  }

  /**
   * interactive 的离开处理 —— 不是「延时关闭」而是「交接」:
   * 装上安全三角,同时起一个 100ms 定时器做兜底(指针停住不动时不会有
   * pointermove,只靠三角形永远不会关)。定时器到点时用 elementFromPoint
   * 复核一次指针是否已经在触发器或浮层里。
   */
  const beginHandoff = (
    event: ReactPointerEvent,
    from: 'content' | 'reference' = 'content'
  ): void => {
    clearOpenTimer()
    clearCloseTimer()
    clearSafeTriangle()
    const pointer = { x: event.clientX, y: event.clientY }
    const armFallback = (point: { x: number; y: number }): void => {
      clearCloseTimer()
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null
        const trigger = triggerRef.current
        const content = contentRef.current
        const doc = trigger?.ownerDocument
        const under =
          doc != null && typeof doc.elementFromPoint === 'function'
            ? doc.elementFromPoint(point.x, point.y)
            : null
        if (trigger?.contains(under) === true || content?.contains(under) === true) {
          if (stopSafeTriangle.current == null) releaseHandoff()
          else manager?.clearHoverHandoffLock(tooltipId)
          return
        }
        close()
      }, HOVER_HANDOFF_DELAY)
    }
    const content = contentRef.current
    const trigger = triggerRef.current
    if (content == null || trigger == null) {
      armFallback(pointer)
      return
    }
    const fromReference = from === 'reference'
    const stop = watchSafeTriangle({
      destinationElement: fromReference ? trigger : content,
      destinationSide: fromReference ? oppositeSide(placedSideRef.current) : placedSideRef.current,
      onEnterDestination: releaseHandoff,
      onMoveInsideTriangle: armFallback,
      onMoveOutsideTriangle: close,
      pointer,
      sourceElement: fromReference ? content : trigger
    })
    if (stop != null) {
      manager?.setHoverHandoffLockTooltipId(tooltipId)
      stopSafeTriangle.current = stop
    }
    armFallback(pointer)
  }

  const onPointerOpen = (event: ReactPointerEvent): void => {
    if (disableHoverOpen || event.pointerType === 'touch') return
    if (manager?.isHoverOpenBlocked(tooltipId) === true) return
    manager?.clearHoverHandoffLock(tooltipId)
    let delay = delayDuration ?? 0
    if (delayOpen) delay = DELAY_OPEN_DURATION
    delay = manager?.getOpenDelay(skipDelayKey, delay) ?? delay
    delay = getDelayDuration?.(event, delay) ?? delay
    scheduleOpen(delay)
  }

  const onEscape = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') close()
  }

  const triggerProps = {
    'aria-describedby': open ? tooltipId : undefined,
    'data-state': open ? 'delayed-open' : 'closed',
    onBlur(event: React.FocusEvent) {
      if (!closeOnTriggerBlur) return
      if (interactive && contains(contentRef.current, event.relatedTarget)) return
      close()
    },
    onContextMenu() {
      clearOpenTimer()
      close()
    },
    onFocus(event: React.FocusEvent) {
      if (event.defaultPrevented) return
      try {
        if (event.currentTarget.matches(':focus-visible')) scheduleOpen(0)
      } catch {
        /* :focus-visible 不被支持时不做键盘触发 */
      }
    },
    onKeyDown: onEscape,
    onPointerEnter: onPointerOpen,
    onPointerLeave(event: ReactPointerEvent) {
      clearOpenTimer()
      if (interactive) {
        beginHandoff(event)
        return
      }
      close()
    },
    onPointerMove: onPointerOpen
  }

  const setTriggerRef = (el: HTMLElement | null): void => {
    triggerRef.current = el
  }

  let trigger: ReactNode
  if (!triggerAsChild) {
    trigger = (
      <button type="button" ref={setTriggerRef} className={className} {...triggerProps}>
        {children}
      </button>
    )
  } else if (isValidElement(children)) {
    const element = children as ReactElement<Record<string, unknown>>
    if (typeof element.type !== 'string') {
      // 组件 children:包 span.contents —— 侧栏里那些 span.contents[data-state] 就是这条分支
      trigger = (
        <span
          ref={(el) => {
            const first = el?.firstElementChild ?? null
            setTriggerRef(first instanceof HTMLElement ? first : el)
          }}
          {...triggerProps}
          className={cx('contents', className)}
        >
          {element}
        </span>
      )
    } else {
      const childProps = element.props
      // 先取出来再用:直接在 ref 回调里写 childProps.ref 会被
      // react-hooks/refs 判成「渲染期访问 ref」(它只看属性名)
      const childRef = (childProps as { ref?: Ref<HTMLElement> }).ref
      const childDescribedBy = childProps['aria-describedby'] as string | undefined
      /*
       * cloneElement 注入 `ref` 是 React 官方 API,但 react-hooks/refs 只看
       * 属性名叫 ref 就判成「渲染期访问 ref」。这里传的是**回调 ref**,
       * 不读任何 `.current`,是规则的误报。
       */
      /* eslint-disable react-hooks/refs -- 见上方说明:回调 ref,不读 .current */
      trigger = cloneElement(element, {
        ...triggerProps,
        'aria-describedby': joinIds(childDescribedBy, triggerProps['aria-describedby']),
        className: cx(childProps.className as string | undefined, className),
        ref: (el: HTMLElement | null) => {
          setTriggerRef(el)
          assignRef(childRef, el)
        },
        onBlur: (e: React.FocusEvent) => {
          ;(childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e)
          triggerProps.onBlur(e)
        },
        onContextMenu: (e: React.MouseEvent) => {
          ;(childProps.onContextMenu as ((e: React.MouseEvent) => void) | undefined)?.(e)
          triggerProps.onContextMenu()
        },
        onFocus: (e: React.FocusEvent) => {
          ;(childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e)
          triggerProps.onFocus(e)
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          ;(childProps.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined)?.(e)
          triggerProps.onKeyDown(e)
        },
        onPointerEnter: (e: ReactPointerEvent) => {
          ;(childProps.onPointerEnter as ((e: ReactPointerEvent) => void) | undefined)?.(e)
          triggerProps.onPointerEnter(e)
        },
        onPointerLeave: (e: ReactPointerEvent) => {
          ;(childProps.onPointerLeave as ((e: ReactPointerEvent) => void) | undefined)?.(e)
          triggerProps.onPointerLeave(e)
        },
        onPointerMove: (e: ReactPointerEvent) => {
          ;(childProps.onPointerMove as ((e: ReactPointerEvent) => void) | undefined)?.(e)
          triggerProps.onPointerMove(e)
        }
      })
      /* eslint-enable react-hooks/refs */
    }
  } else {
    trigger = (
      <span ref={setTriggerRef} {...triggerProps}>
        {children}
      </span>
    )
  }

  return (
    <>
      {trigger}
      {open && (
        <TooltipContent
          id={tooltipId}
          align={align}
          alignOffset={alignOffset}
          className={tooltipClassName}
          color={color}
          setContentElement={setContentElement}
          disablePadding={disablePadding}
          maxWidth={tooltipMaxWidth}
          open={open}
          onPlacedSideChange={setPlacedSide}
          portalContainer={portalContainer}
          getReferenceElement={getTriggerElement}
          side={side}
          sideOffset={sideOffset}
          variant={variant}
          onBlur={
            interactive && closeOnTriggerBlur
              ? (e) => {
                  if (contains(e.currentTarget, e.relatedTarget)) return
                  if (contains(triggerRef.current, e.relatedTarget)) return
                  close()
                }
              : undefined
          }
          onKeyDown={interactive ? onEscape : undefined}
          onPointerEnter={interactive ? releaseHandoff : undefined}
          onPointerLeave={interactive ? (e) => beginHandoff(e, 'reference') : undefined}
        >
          <div className={cx('flex items-center gap-2', variant !== 'tooltip' && 'min-h-0 flex-1')}>
            <div
              className={cx(
                'min-w-0',
                variant !== 'tooltip' && 'flex min-h-0 w-full',
                tooltipBodyClassName
              )}
            >
              {tooltipContent}
            </div>
          </div>
        </TooltipContent>
      )}
    </>
  )
}

/**
 * 浮层本体 —— portal 到 `document.body`。
 *
 * 定位用 floating-ui(Codex 也是):`offset` 吃 sideOffset/alignOffset,
 * `flip`/`shift`/`size` 一律 `padding: 8`。`size` 的 apply 里写三个
 * `--radix-tooltip-*` 变量 —— 名字带 radix 是历史包袱,但 `max-width` /
 * `max-height` 的内联值直接引用它们,不能改名。
 */
function TooltipContent({
  align,
  alignOffset,
  children,
  className,
  color,
  setContentElement,
  disablePadding,
  id,
  maxWidth,
  open,
  onBlur,
  onKeyDown,
  onPointerEnter,
  onPointerLeave,
  onPlacedSideChange,
  portalContainer,
  getReferenceElement,
  side,
  sideOffset,
  variant
}: {
  align: TooltipAlign
  alignOffset?: number
  children: ReactNode
  className?: string
  color: 'default' | 'inverse'
  setContentElement(el: HTMLDivElement | null): void
  disablePadding: boolean
  id: string
  maxWidth?: string
  open: boolean
  onBlur?(e: React.FocusEvent<HTMLDivElement>): void
  onKeyDown?(e: React.KeyboardEvent<HTMLDivElement>): void
  onPointerEnter?(): void
  onPointerLeave?(e: ReactPointerEvent<HTMLDivElement>): void
  onPlacedSideChange(side: TooltipSide): void
  portalContainer?: HTMLElement | null
  getReferenceElement(): HTMLElement | null
  side: TooltipSide
  sideOffset: number
  variant: TooltipVariant
}): React.JSX.Element | null {
  const zoom = useContext(WindowZoomContext)
  // 触发器是个 ref,不是稳定节点(cloneElement 后可能换元素),用虚拟参照物读它
  const [reference] = useState(() => ({
    get contextElement(): HTMLElement | undefined {
      return getReferenceElement() ?? undefined
    },
    getBoundingClientRect(): DOMRect {
      return getReferenceElement()?.getBoundingClientRect() ?? EMPTY_RECT
    }
  }))

  const floating = useFloating({
    elements: { reference },
    open: true,
    placement: placementOf(side, align),
    middleware: [
      offset({ mainAxis: sideOffset, crossAxis: alignOffset }),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableWidth, availableHeight, elements, rects }) {
          elements.floating.style.setProperty(
            '--radix-tooltip-trigger-width',
            `${Math.max(0, rects.reference.width)}px`
          )
          elements.floating.style.setProperty(
            '--radix-tooltip-content-available-width',
            `${Math.max(0, availableWidth)}px`
          )
          elements.floating.style.setProperty(
            '--radix-tooltip-content-available-height',
            `${Math.max(0, availableHeight)}px`
          )
        }
      })
    ],
    whileElementsMounted: autoUpdate
  })

  const placedSide = sideOf(floating.placement)
  // 落位可能被 flip 改掉(右边放不下就翻到左边),把结果回传给父层
  useEffect(() => {
    onPlacedSideChange(placedSide)
  }, [onPlacedSideChange, placedSide])
  // zoom ≠ 1 时外面再套一层承担定位,里层用 zoom 抵掉缩放(Codex 同做法)
  const needsZoomWrapper = portalContainer == null && zoom !== 1
  if (typeof document === 'undefined') return null

  const content = (
    <div
      id={id}
      ref={(el) => {
        if (!needsZoomWrapper) floating.refs.setFloating(el)
        setContentElement(el)
      }}
      data-side={placedSide}
      aria-hidden={open ? undefined : 'true'}
      hidden={!open && variant !== 'unstyled'}
      role="tooltip"
      className={cx(
        'z-50 w-fit select-none text-sm whitespace-normal break-words',
        variant !== 'tooltip' && 'm-px flex flex-col',
        variant === 'rich' &&
          'bg-token-dropdown-background/90 text-token-foreground ring-token-border rounded-xl shadow-xl-spread ring-[0.5px] backdrop-blur-sm',
        variant === 'tooltip' &&
          cx(
            'rounded-lg border',
            color === 'inverse'
              ? 'border-token-foreground bg-token-foreground text-token-dropdown-background'
              : 'border-token-border bg-token-dropdown-background text-token-foreground'
          ),
        variant === 'tooltip' && !disablePadding && 'px-2 py-1',
        !open && 'pointer-events-none',
        className
      )}
      style={{
        ...(needsZoomWrapper ? undefined : floating.floatingStyles),
        zoom: needsZoomWrapper ? zoom : undefined,
        maxWidth:
          maxWidth ??
          'min(20rem, var(--radix-tooltip-content-available-width), calc(100vw - 16px))',
        maxHeight: 'min(var(--radix-tooltip-content-available-height), calc(100vh - 16px))'
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>
  )

  return createPortal(
    needsZoomWrapper ? (
      <div
        ref={(el) => {
          floating.refs.setFloating(el)
          if (el?.firstElementChild != null) {
            el.style.pointerEvents = getComputedStyle(el.firstElementChild).pointerEvents
          }
        }}
        className="z-50"
        style={floating.floatingStyles}
      >
        {content}
      </div>
    ) : (
      content
    ),
    portalContainer ?? document.body
  )
}
