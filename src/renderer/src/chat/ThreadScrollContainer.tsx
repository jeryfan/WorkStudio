import type { ReactNode } from 'react'

/**
 * 会话滚动容器 —— 复刻 Codex 的 `thread-scroll-container` 那一层及其外壳。
 *
 * Codex 实测层级(从 data-vscode-context 之下算起):
 *
 *   div.sticky.top-0.z-10                                        ← 顶部 sticky 槽(常空)
 *   div.flex.min-h-0.flex-1.flex-col
 *       .[&_[data-thread-find-target=conversation]]:scroll-mt-24
 *   └ div.relative.mx-auto.flex.min-h-0.w-full.flex-1.flex-col
 *     └ div.min-h-0.flex-1
 *       └ div.relative.h-full.flex-1.[content-visibility:auto]
 *         └ div.thread-scroll-container.relative.h-full.overflow-x-hidden.overflow-y-auto
 *             .[overflow-anchor:none]
 *             .[scroll-padding-bottom:var(--thread-scroll-padding-bottom,0px)]
 *             .electron:[scrollbar-gutter:stable_both-edges]
 *             .pt-(--thread-content-top-inset)
 *           └ div.flex.min-h-full.shrink-0.flex-col.justify-start
 *             ├ div.mx-auto.w-full.max-w-(--thread-content-max-width).px-toolbar
 *             │     .relative.flex.flex-1.shrink-0.flex-col.pb-8 [data-mcp-app-portal-target]
 *             │ └ div…gap-3 [data-thread-find-target="conversation"]     ← 消息流
 *             └ div.sticky.bottom-0.z-10.mt-auto.w-full.pb-4 [data-thread-scroll-footer]
 *               ├ div.pointer-events-none.absolute.inset-x-0.bottom-0.z-0…pt-4   ← 底部渐隐
 *               └ div.relative.z-10.flex.flex-col.mx-auto…px-toolbar [data-pip-obstacle]
 *                 └ Composer
 *
 * **Codex 不做窗口化虚拟滚动。** 整个消息流一次性渲染,靠三层机制扛性能:
 * - 外层 `[content-visibility:auto]` 让浏览器跳过视口外的布局与绘制
 * - 每个 turn 上 `[&_[data-virtualized-turn-content]]:[content-visibility:visible]`
 *   在需要时反向打开
 * - `[overflow-anchor:none]` 关掉浏览器的滚动锚定 —— 流式输出时锚定会和
 *   自动贴底打架,产生跳动
 *
 * 所以这里去掉了 react-virtuoso。它注入的 `[data-virtuoso-scroller]` /
 * `[data-viewport-type]` / `[data-item-index]` 在 Codex 里一个都不存在,
 * 而且窗口化会让 `data-turn-key` 的 DOM 不完整,影响搜索定位与滚动锚点。
 *
 * **贴底跟随靠 `flex flex-col-reverse`,不是 JS。** 这是 Codex 最巧的一处:
 * 滚动容器本身是反向 flex,于是"滚动原点"在底部 —— 内容长高时浏览器
 * 自动保持贴底,不需要任何 scrollTop 计算,也不会和流式输出打架。
 * 配合 `[overflow-anchor:none]` 关掉浏览器自己的锚定(那个会和反向 flex 冲突)。
 * 用户往上翻时正常离开底部,不会被强行拉回 —— 这是布局的自然行为,不是特例逻辑。
 *
 * 我最初用 ResizeObserver + scrollTop 手写跟随,行为能接近但不等价(流式时会抖),
 * 而且和 Codex 的 DOM 不一致。现在删掉那段,交给 flex。
 *
 * 另外三个容易漏的类:
 * - `[container-type:inline-size]` + `[container-name:thread-content]`
 *   给内容块的容器查询用(宽块、表格按容器宽度切档),少了它们那些 @container 规则全失效
 * - `[&:has([data-thread-scroll-footer='true']:focus-within)]:[scroll-padding-bottom:0px]`
 *   输入框聚焦时取消滚动内边距,否则光标会被自己的 padding 顶出视口
 */
export function ThreadScrollContainer({
  children,
  footer
}: {
  /** 消息流(渲染进 data-thread-find-target="conversation") */
  children: ReactNode
  /** 输入区 —— Codex 放在 sticky 底槽里,是消息流的兄弟 */
  footer?: ReactNode
}): React.JSX.Element {
  return (
    <>
      <div className="sticky top-0 z-10" />
      <div className="flex min-h-0 flex-1 flex-col [&_[data-thread-find-target=conversation]]:scroll-mt-24">
        <div className="relative mx-auto flex min-h-0 w-full flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <div className="relative h-full flex-1 [content-visibility:auto]">
              <div className="thread-scroll-container relative h-full overflow-x-hidden overflow-y-auto [overflow-anchor:none] [scroll-padding-bottom:var(--thread-scroll-padding-bottom,0px)] electron:[scrollbar-gutter:stable_both-edges] pt-(--thread-content-top-inset) [container-name:thread-content] [container-type:inline-size] focus:outline-none [&:has([data-thread-scroll-footer='true']:focus-within)]:[scroll-padding-bottom:0px] flex flex-col-reverse">
                <div className="flex min-h-full shrink-0 flex-col justify-start">
                  <div
                    data-mcp-app-portal-target="true"
                    className="mx-auto w-full max-w-(--thread-content-max-width) px-toolbar relative flex flex-1 shrink-0 flex-col pb-8"
                  >
                    <div
                      data-thread-find-target="conversation"
                      className="relative flex flex-col gap-3 electron:[--color-token-description-foreground:color-mix(in_srgb,var(--color-token-foreground)_70%,transparent)]"
                    >
                      {children}
                    </div>
                  </div>
                  <div
                    data-thread-scroll-footer="true"
                    className="sticky bottom-0 z-10 mt-auto w-full pb-4"
                  >
                    {/* 底部渐隐 —— 让最后一条消息滑到输入区下方时淡出,不是硬切 */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex h-full w-full justify-center pt-4"
                    />
                    <div
                      data-pip-obstacle="thread-footer"
                      className="relative z-10 flex flex-col mx-auto w-full max-w-(--thread-content-max-width) px-toolbar"
                    >
                      {footer}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
