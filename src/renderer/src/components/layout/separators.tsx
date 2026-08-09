import { Separator } from 'react-resizable-panels'

/**
 * 共享分隔条（供 AppShell 骨架与 FileTab 内部复用）。
 * 元素盒 = 边界 ±5px（恰好覆盖库的拖拽命中区），负边距净占 0 布局宽度；
 * 内部 1px 边框线 + 1px hover 渐变线同一中心，保证重合。
 */
export function VerticalSeparator(): React.JSX.Element {
  return (
    <Separator className="group/sep relative z-20 -mx-[5px] w-[10px] shrink-0 cursor-col-resize outline-none">
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover/sep:opacity-100" />
    </Separator>
  )
}

/** 横向分隔条（上下拖拽），结构同 VerticalSeparator */
export function HorizontalSeparator(): React.JSX.Element {
  return (
    <Separator className="group/sep relative z-20 -my-[5px] h-[10px] shrink-0 cursor-row-resize outline-none">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover/sep:opacity-100" />
    </Separator>
  )
}
