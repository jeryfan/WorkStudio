import type { ReactNode } from 'react'

/**
 * 内容区公共容器 —— 白色背景（sider/2.html --token-main-surface-primary），
 * 所有菜单/页面视图都渲染在这里。切换页面时只需替换 children 对应的 View。
 * 注意：库的 Panel 内层 div 是普通块级容器，必须用 h-full 而不是 flex-1 撑高。
 */
export function ContentArea({ children }: { children: ReactNode }): React.JSX.Element {
  return <main className="relative flex h-full w-full min-w-0 flex-col bg-surface">{children}</main>
}
