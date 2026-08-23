import type { ChatSummary } from '../../services/chat/types'
import { useWorkspace } from '../../state/WorkspaceContext'
import { useChatRuntime } from '../../state/ChatRuntimeContext'
import { ArchiveIcon, PinIcon, UnpinIcon } from '../icons'
import { useMarquee } from '../../utils/useMarquee'
import { CODEX_CLASS } from '../../assets/codex/class-map'
import { cx } from '../../utils/cx'
import { Tooltip } from '../tooltip/Tooltip'
import { hoverCardOpensImmediately } from '../tooltip/hoverCardDelay'
import { ThreadHoverCard } from './ThreadHoverCard'

interface SidebarThreadRowProps {
  chat: ChatSummary
  /**
   * 这一行是否嵌在某个项目的会话列表里。
   *
   * 决定**层级缩进**:分组的行前面留一个空的 16px 图标槽,加上内容行的
   * `gap-2`(8px)一共 24px —— 标题左缘因此从 16 挪到 40,正好与项目名对齐。
   * 实测两侧都是这个数:Codex 项目下的会话标题 x=40、无项目会话 x=16、
   * 项目名 x=40。Codex 里这个 prop 叫 `reserveLeadingSlot`(由 `isGrouped` 传入),
   * 槽是空的也要渲染 —— 它的作用就是占位。
   */
  isGrouped?: boolean
}

/** 悬浮操作按钮 —— Codex 实测 20×20,hover 不给背景、只变色(sidebar-hover-icon-button-tint) */
const ACTION_BTN =
  'no-drag cursor-interaction flex items-center justify-center gap-1 whitespace-nowrap select-none ' +
  'rounded-full border border-transparent p-0.5 focus:outline-none ' +
  'enabled:hover:bg-transparent hover:text-token-foreground data-[state=open]:bg-transparent ' +
  'disabled:cursor-not-allowed disabled:opacity-40 ' +
  'electron:rounded-md electron:p-1 ' +
  '!h-5 !w-5 !p-0 [&>svg]:!h-4 [&>svg]:!w-4 sidebar-hover-icon-button-tint'

/** 尾部留白宽度 —— Codex 的 `n*20 + (n-1)*8 + 4`(图标 20、间隙 8、右侧 4) */
function trailingRailWidth(iconCount: number): number {
  return iconCount === 0 ? 0 : iconCount * 20 + (iconCount - 1) * 8 + 4
}

/**
 * 侧栏会话行 —— 结构、类名、data 属性逐项对齐 Codex 实测(324×30)。
 *
 * 四个子元素,顺序不能变:
 *   1. div.contents[data-hover-card-open-immediately]  悬浮操作(两个 20×20 按钮)
 *   2. 状态槽(仅非空闲)   absolute end-0,group-hover:hidden —— hover 时让位给操作
 *   3. 内容行              标题(跑马灯)+ 操作预留位 + 尾部留白
 *
 * 几处容易做错的地方,都以实测为准:
 *
 * - **状态点是静态圆点,没有动画**。8×8,内联 background-color,外面套两层定位盒
 *   (span 20×20 → div size-5 → span icon-xs scale-50)。
 * - **状态槽带 group-hover:hidden**,所以它和操作按钮虽然都在 end-0 也不会打架。
 * - **标题是跑马灯不是截断**:hover 时滚动,四层结构
 *   viewport → clipViewport → track → content,滚完停在末尾(stopAtEnd)。
 * - `data-app-action-sidebar-thread-id` 带 host 前缀(`local:<uuid>`),
 *   与 `-host-id` 一起给出「哪台机器上的哪个会话」;拖拽的 draggable id 用的
 *   也是这个 `local:<uuid>`(实测 aria-live 播报)。
 * - 尾部留白宽度是**算出来**的而不是常量:图标数 → `n*20+(n-1)*8+4`。
 *   Codex 的置顶行有 2 个尾部图标 → 52px;WS 只有状态点 → 24px。
 * - 悬浮操作那层外面必须有 `div.contents[data-hover-card-open-immediately]` ——
 *   它不是装饰:Tooltip 的 `getDelayDuration` 靠 `closest()` 命中它把 700ms
 *   延迟改成 0,鼠标已经精确落在小图标上时不该再等。
 *
 * ## 悬浮卡片
 *
 * 走的是 Codex 的 tooltip 原语(`variant="rich"` + `interactive`),**不是**
 * 另写一个 HoverCard —— 这样 `span.contents[data-state]` / `div[role=tooltip]`
 * 的 DOM 契约、700ms/300ms/100ms 的时序、安全三角交接全都是同一套。
 * 这里 children 是 DOM 标签(div),所以 Tooltip 走 cloneElement 分支,
 * `data-state` 直接落在行本身 —— 与 Codex 实测的
 * `div[data-app-action-sidebar-thread-row][data-state="delayed-open"]` 一致。
 *
 * **只有归属某个项目的会话才弹卡片。** 这不是产品取舍,是从 bundle 推出来的:
 * `SRc` 里 `disableHoverCard: c || (E == null && !Ee)`,`E = hoverCardProjectLabel`;
 * 而侧栏的会话列表(`DRc` 的调用点)**根本不传这个 prop**,于是
 * `W = s ?? H?.label ?? null` 退化成 `H?.label`,`H = Po(w8o, threadKey)`
 * 就是该会话的项目组。没有项目 → label 为 null → 卡片关闭。
 * (`Ee` 是"远端项目且连接断开"的特例,本地会话恒 false。)
 *
 * 实测复核过两遍:hover Recents 与 Pinned 里的会话,body 下不出现
 * `[role=tooltip]`;把项目展开后 hover 它下面的会话,卡片出现(224×86)。
 * 所以行的层级关系也是两级 —— 项目下的会话嵌在项目组里,无项目的会话
 * 与项目行同级,两者的悬浮行为因此天然不同。
 */
export function SidebarThreadRow({
  chat,
  isGrouped = false
}: SidebarThreadRowProps): React.JSX.Element {
  const { setChatPinned, archiveChat } = useWorkspace()
  const { openChat, activeChatId } = useChatRuntime()
  const { id, title, pinned, status } = chat
  const { ref: setMarqueeNode, state: marquee } = useMarquee(title)

  const running = status.type === 'active'
  const errored = status.type === 'systemError'
  const awaitingApproval =
    status.type === 'active' && status.activeFlags.some((f) => String(f).includes('pproval'))
  const busy = running || errored

  // Codex 只观测到运行态用 textLink 色;报错/待审批是本项目自有的状态,沿用语义色
  const dotColor = errored
    ? 'var(--color-token-editor-error-foreground, #ba2623)'
    : awaitingApproval
      ? 'var(--color-accent-orange, #c2570b)'
      : 'var(--vscode-textLink-foreground)'

  const railWidth = trailingRailWidth(busy ? 1 : 0)
  /* 见组件注释:无项目归属的会话没有悬浮卡片(Codex 的 disableHoverCard 分支) */
  const hoverCardDisabled = chat.projectId == null

  return (
    <Tooltip
      variant="rich"
      interactive
      side="right"
      align="start"
      sideOffset={2}
      alignOffset={0}
      /* 落在操作区/状态槽上时立即弹(Codex 的 bjc) */
      getDelayDuration={(event, delay) => (hoverCardOpensImmediately(event.target) ? 0 : delay)}
      disabled={hoverCardDisabled}
      tooltipContent={<ThreadHoverCard chat={chat} />}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        data-app-action-sidebar-thread-row=""
        data-app-action-sidebar-thread-host-id="local"
        data-app-action-sidebar-thread-id={`local:${id}`}
        data-app-action-sidebar-thread-title={title}
        data-app-action-sidebar-thread-kind="local"
        data-app-action-sidebar-thread-pinned={pinned ? 'true' : 'false'}
        data-app-action-sidebar-thread-active={running ? 'true' : 'false'}
        data-app-action-sidebar-thread-selected={activeChatId === id ? 'true' : 'false'}
        onClick={() => openChat(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openChat(id)
          }
        }}
        /*
         * 类名顺序与 Codex 实测一致。光标由 `cursor-interaction` 决定 ——
         * 桌面端解析成 **default(箭头)**,置顶与否都一样。
         * 这里原先有个 `style={pinned ? {cursor:'grab'} : undefined}`,内联样式压过了
         * cursor-interaction,置顶会话就变成小手,和项目行不一致 —— Codex 没有这个。
         * 拖拽手感靠外层 sortable 包装的 `cursor-grab` 给(实测 Codex 也是挂在
         * 包装层上而不是行上)。
         *
         * 行高亮不需要在卡片打开时手动补:hover 卡片时指针虽然离开了行,但
         * `data-state="delayed-open"` 由 Tooltip 落在行上,样式挂它就行 ——
         * 这也是 Codex 的做法(行类名里没有任何 JS 拼接的高亮态)。
         */
        className="group relative cursor-interaction text-sm hover:bg-token-list-hover-background focus-visible:outline-offset-[-2px] data-[app-action-sidebar-thread-selected=true]:bg-token-list-hover-background data-[state=delayed-open]:bg-token-list-hover-background py-row-y h-[var(--height-token-row)] sidebar-item pe-row-y ps-[var(--padding-row-cell-x,var(--padding-row-x))]"
      >
        {/* 1. 悬浮操作 */}
        <div className="contents" data-hover-card-open-immediately="true">
          <div className="absolute end-0 top-0 z-10 flex h-full w-[52px] items-center justify-end gap-2 me-0.5 pe-0.5 opacity-0 group-hover:opacity-100 [&:has(:focus-visible)]:opacity-100 group-data-[title-aligned-trailing-rail=true]:items-start group-data-[title-aligned-trailing-rail=true]:me-0 group-data-[title-aligned-trailing-rail=true]:pe-row-y group-data-[title-aligned-trailing-rail=true]:pt-1.5">
            <Tooltip tooltipContent={pinned ? 'Unpin chat' : 'Pin chat'}>
              <button
                type="button"
                aria-label={pinned ? 'Unpin chat' : 'Pin chat'}
                onClick={(e) => {
                  e.stopPropagation()
                  void setChatPinned(id, !pinned)
                }}
                /* Codex 的 APc:操作按钮吞掉 pointerdown,否则按下就被当成拖拽起手 */
                onPointerDown={(e) => e.stopPropagation()}
                className={ACTION_BTN}
              >
                {pinned ? <UnpinIcon className="translate-x-px" /> : <PinIcon />}
              </button>
            </Tooltip>
            <Tooltip tooltipContent="Archive chat">
              <button
                type="button"
                aria-label="Archive chat"
                onClick={(e) => {
                  e.stopPropagation()
                  void archiveChat(id)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={ACTION_BTN}
              >
                <ArchiveIcon />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 2. 状态槽 —— 仅非空闲时渲染 */}
        {busy && (
          <div
            data-hover-card-open-immediately="true"
            className="absolute end-0 top-0 z-10 flex h-full min-w-[52px] shrink-0 items-center justify-end gap-2 pe-1 group-hover:hidden group-has-[:focus-visible]:hidden group-data-[title-aligned-trailing-rail=true]:relative group-data-[title-aligned-trailing-rail=true]:h-5 group-data-[title-aligned-trailing-rail=true]:min-w-0 group-data-[title-aligned-trailing-rail=true]:pe-0"
            aria-label={
              errored ? 'Stopped with an error' : awaitingApproval ? 'Waiting for you' : 'Running'
            }
          >
            <span className="flex h-5 min-w-5 items-center justify-center">
              <div className="relative flex size-5 shrink-0 items-center justify-center text-token-description-foreground">
                <span className="icon-xs relative scale-50">
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                </span>
              </div>
            </span>
          </div>
        )}

        {/* 3. 内容行 */}
        <div className="flex h-full w-full items-center text-sm leading-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/*
             * 前导槽 —— 分组行专有,空的也要留(见 isGrouped 的注释)。
             * 内层那个 relative 容器是给「静息图标 / hover 图标」互换用的,
             * 本项目暂时两者都没有,但层级照 Codex 留着。
             */}
            {isGrouped && (
              <div className="flex w-4 shrink-0 items-center justify-center">
                <div className="relative flex items-center justify-center" />
              </div>
            )}
            <div
              data-thread-title-trigger="true"
              className={cx(
                'flex min-w-0 flex-1 items-center gap-2 self-stretch text-base leading-5',
                running ? 'text-[var(--vscode-foreground)]' : 'text-token-foreground'
              )}
            >
              {/*
               * 跑马灯 —— 四层结构 + JS 测量层(useMarquee)。
               * CSS 管 hover 触发与动画,JS 只负责测宽度、算距离/时长并注入三个变量,
               * 溢出时才挂 codex-overflowingViewport(clip 层)与 codex-scrolling(track 层)。
               * 挂载位置是实测的,搞反就不滚 —— 详见 utils/useMarquee.ts 的注释。
               */}
              <span
                ref={setMarqueeNode}
                data-thread-title="true"
                data-marquee-text="true"
                draggable={false}
                className="codex-viewport codex-animateOnGroupHover codex-stopAtEnd min-w-0 flex-1 select-none"
              >
                <span
                  className={cx(
                    'codex-clipViewport',
                    marquee.overflowing && 'codex-overflowingViewport'
                  )}
                  style={marquee.style as React.CSSProperties | undefined}
                >
                  <span className={cx('codex-track', marquee.overflowing && 'codex-scrolling')}>
                    <span className={CODEX_CLASS.content_19mhu} data-marquee-content="true">
                      <span>{title}</span>
                    </span>
                  </span>
                </span>
              </span>
            </div>
          </div>
          <div className="ms-[3px] flex items-center justify-end gap-1 group-hover:min-w-12 group-has-[:focus-visible]:min-w-12" />
          {railWidth > 0 && (
            <div
              className="shrink-0 group-hover:hidden group-has-[:focus-visible]:hidden"
              style={{ width: `${railWidth}px` }}
            />
          )}
        </div>
      </div>
    </Tooltip>
  )
}
