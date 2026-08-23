import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useOverlay, type MenuId } from '../../state/OverlayContext'
import { ChevronIcon } from '../icons'
import { SidebarCollapseRegion } from './SidebarSortableRow'

/**
 * 分节标题右侧的控制按钮 —— Codex 实测 24×24。
 *
 * 注意 hover **不给背景**(enabled:hover:bg-transparent),只靠
 * sidebar-hover-icon-button-tint 变色:平时前景色 50% 透明,hover/focus 转实色。
 * 这是 Codex 侧栏所有图标按钮的统一手法,给背景会显得比 Codex 重。
 */
export function IconButtonSm({
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type="button"
      className={`no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full electron:rounded-md enabled:hover:bg-transparent data-[state=open]:bg-transparent hover:text-token-foreground border-transparent electron:p-1 flex items-center justify-center p-0.5 outline-hidden cursor-interaction sidebar-icon-button sidebar-hover-icon-button-tint ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

interface SectionHeaderProps {
  title: string
  collapsed: boolean
  onToggle(): void
  /** hover 时淡入的右侧控制按钮组 */
  controls?: ReactNode
  /**
   * 由本区控制按钮打开的菜单 id。
   * 该菜单打开期间保持控制按钮组可见（鼠标已在菜单上，:hover 会丢失）。
   */
  menuId?: MenuId
  /**
   * 这一节自身可否被拖动重排。
   *
   * 实测:Projects 与 Recents 的 toggle 带 `aria-roledescription="sortable"`,
   * **Pinned 的没有** —— Pinned 固定在最上,不参与分节排序。
   */
  sortable?: boolean
}

/**
 * 分节标题行 —— 对齐 Codex 实测(324×25)。
 *
 * 几处以实测为准、别改回直觉写法:
 *
 * - toggle 是 **cursor-default**,不是 pointer。整行可点但不给"可点"的光标暗示。
 * - chevron 14×14(icon-2xs),**默认 opacity-0**,靠 group-hover/section-toggle 与
 *   group-focus-visible/section-toggle 显现;展开 rotate-0、折叠 -rotate-90,
 *   过渡 transform 0.15s cubic-bezier(0.4,0,0.2,1)。
 * - 标题文字 14px/500/21px,色用 token-input-placeholder-foreground 再叠 opacity-75。
 * - 命名 group 用 /nav-section-title 与 /section-toggle 两层,分别驱动控制按钮组和
 *   chevron —— 用同一个匿名 group 会让两者一起亮。
 */
export function SectionHeader({
  title,
  collapsed,
  onToggle,
  controls,
  menuId,
  sortable = false
}: SectionHeaderProps): React.JSX.Element {
  const { menu } = useOverlay()
  const controlsOpen = menuId !== undefined && menu?.id === menuId

  return (
    <div className="group/nav-section-title flex items-center justify-between gap-2 pe-0.5 ps-2">
      <div className="min-w-0 flex-1 text-base font-medium text-token-input-placeholder-foreground opacity-75">
        {/* Codex 在 toggle 外面还有一层 div.flex.min-w-0.flex-1 —— 它是拖拽把手的
            挂载点(Codex 的分节标题本身可排序),省掉这层以后接 dnd 时得重排 DOM */}
        <div className="flex min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            data-app-action-sidebar-section-toggle=""
            /*
             * 分节标题本身是可排序项(实测 Projects / Recents 的 toggle 带
             * role="button" + aria-roledescription="sortable" + tabindex="0")。
             * 这里只补 aria 契约;真正接进 DnD 上下文时把 sortable 的
             * listeners 透传到这个按钮上即可,DOM 形态不需要再动。
             */
            role={sortable ? 'button' : undefined}
            aria-roledescription={sortable ? 'sortable' : undefined}
            aria-disabled={sortable ? 'false' : undefined}
            tabIndex={sortable ? 0 : undefined}
            onClick={onToggle}
            className="group/section-toggle flex min-w-0 flex-1 items-center gap-1 rounded-md py-0.5 pe-1 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 cursor-default"
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate">{title}</span>
            </span>
            <ChevronIcon
              aria-hidden="true"
              className={`icon-2xs shrink-0 transition-transform group-hover/section-toggle:opacity-100 group-focus-visible/section-toggle:opacity-100 sidebar-hover-icon-tint opacity-0 ${
                collapsed ? '-rotate-90' : 'rotate-0'
              }`}
            />
          </button>
        </div>
      </div>
      {controls && (
        <div className="flex shrink-0 items-center gap-1">
          {/*
           * Codex 的显隐条件里有 has-[[data-state=open]] —— 菜单打开时鼠标已经移到
           * 菜单上,:hover 会丢,靠这个选择器把按钮组钉住,不需要把菜单状态回传到 React。
           * 另外 Codex 这层**没有 transition**:淡入淡出是瞬时的,加过渡会比 Codex 慢半拍。
           */}
          <div
            className={`shrink-0 pointer-events-none opacity-0 group-focus-within/nav-section-title:pointer-events-auto group-focus-within/nav-section-title:opacity-100 group-hover/nav-section-title:pointer-events-auto group-hover/nav-section-title:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100${
              controlsOpen ? ' pointer-events-auto opacity-100' : ''
            }`}
          >
            <div className="flex items-center gap-1">{controls}</div>
          </div>
        </div>
      )}
    </div>
  )
}

interface SidebarSectionProps {
  heading: string
  collapsed: boolean
  children: ReactNode
  header: ReactNode
}

/**
 * 分节外壳 —— Codex 用 <section> 而不是 div,并靠三个 data 属性对外暴露状态:
 *   data-app-action-sidebar-section / -section-collapsed / -section-heading
 *
 * 折叠时 **内容区整个不渲染**(不是 CSS 隐藏)—— Codex 折叠的那一节 DOM 里
 * 只有标题行一个子元素。内容区常驻但 height:0 会留下可聚焦的隐藏元素。
 */
export function SidebarSection({
  heading,
  collapsed,
  header,
  children
}: SidebarSectionProps): React.JSX.Element {
  return (
    <section
      className="relative px-row-x"
      data-app-action-sidebar-section=""
      data-app-action-sidebar-section-collapsed={collapsed ? 'true' : 'false'}
      data-app-action-sidebar-section-heading={heading}
    >
      <div className="flex flex-col">
        {header}
        {/* D8:折叠是**带动画**的(高度 + 透明度),稳态内联样式与 Codex 一致 */}
        <SidebarCollapseRegion open={!collapsed}>{children}</SidebarCollapseRegion>
      </div>
    </section>
  )
}
