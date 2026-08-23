import type { Todo } from '../model/plan'
import { CircleCheckIcon, CirclePendingIcon } from '../../components/icons'
import { Tooltip } from '../../components/tooltip/Tooltip'
import { cx } from '../../utils/cx'

/**
 * 当前计划 —— 照 Codex 的「计划 pill」重写(`subagent-activity-chip-group`
 * 源码 `FE` → `IE`,tooltip 内容是 `BE`)。
 *
 * ## 与上一版(VS Code 的 chatTodoListWidget)完全不是一个东西
 *
 * | 上一版 | Codex 实测 |
 * |---|---|
 * | 一个常驻展开的卡片:标题行 `checklist 图标 + Plan · 2/5` + 一整个 `<ul>` | **一颗 pill**:圆环进度 + `Step 2 / 5`,清单收在 hover 卡片里 |
 * | 每项一个 codicon(`pass` / `record` / `circle-outline`)+ 三种语义色 | 空心圆 / 圆圈勾两种图标,完成项走 `text-token-text-tertiary` |
 * | 进度靠 "2/5" 文字 | 一个 12px 的**圆环**(`stroke-dashoffset` 驱动),文字是 `Step n / m` |
 *
 * 位置沿用之前的判断(输入框上方,不进回复流),这一点两边一致:
 * 这份清单表达的是"当前状态"而不是"发生过的事",放进流里会得到同一份清单的
 * 三四个版本依次排开,而只有最后一份是真的。
 *
 * ## 圆环的实现细节(照抄,不然画不出来)
 *
 * `pathLength={100} strokeDasharray={100} strokeDashoffset={100 - percent}` ——
 * 用 `pathLength` 把周长**归一化成 100**,于是 dashoffset 直接就是百分比,
 * 不用算 `2πr`。`transform="rotate(-90 6 6)"` 把起点从三点钟转到十二点钟。
 * 底圈是同一个圆、`opacity: 0.16`。
 */

/** Codex 的 `HEo` / `GEo`:默认尺寸 12px、归一化周长 100 */
const SIZE = 12
const STROKE = 2
const PATH_LENGTH = 100

export function TodoListPart({ todos }: { todos: readonly Todo[] }): React.JSX.Element | null {
  if (todos.length === 0) return null

  const done = todos.filter((t) => t.status === 'completed').length
  const complete = done === todos.length
  // 当前步骤:第一个未完成的;全完成时指向最后一个(与 Codex 的 `c` 一致)
  const currentIndex = complete
    ? todos.length - 1
    : todos.findIndex((t) => t.status !== 'completed')
  const percent = complete ? 100 : (done / todos.length) * 100

  return (
    <Tooltip
      delayDuration={0}
      interactive
      side="top"
      sideOffset={8}
      variant="rich"
      tooltipMaxWidth="min(24rem, calc(100vw - 16px))"
      tooltipContent={<PlanList todos={todos} />}
    >
      <span className="-my-1.5 inline-flex max-w-full min-w-0 cursor-interaction py-1.5 hover:text-token-foreground">
        <span className="flex max-w-full min-w-0 items-center gap-1.5 text-size-chat text-token-text-secondary">
          <ProgressDonut percent={percent} className="text-token-charts-blue" />
          <span className="whitespace-nowrap tabular-nums">
            Step {currentIndex + 1} / {todos.length}
          </span>
        </span>
      </span>
    </Tooltip>
  )
}

/** hover 卡片里的完整清单 —— Codex `BE` */
function PlanList({ todos }: { todos: readonly Todo[] }): React.JSX.Element {
  return (
    <div className="flex max-h-[calc(100vh-16px)] min-h-0 max-w-80 flex-1 flex-col overflow-hidden rounded-xl">
      <div className="vertical-scroll-fade-mask flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2 [--edge-fade-distance:1rem]">
        {todos.map((todo, i) => (
          <div key={`${todo.title}:${i}`} className="flex max-w-80 min-w-0 items-start gap-2">
            <StepIcon status={todo.status} />
            <span
              className={cx(
                'text-size-chat max-w-72 min-w-0 break-words leading-4',
                todo.status === 'completed'
                  ? 'text-token-text-tertiary'
                  : 'text-token-text-secondary'
              )}
            >
              {todo.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 步骤图标 —— Codex `KE`。三种状态**只有两个图标**:
 * 未开始与进行中都是空心圆(进行中那档 Codex 用的是转圈,但那是它的
 * `in_progress` 语义;WS 的 `in-progress` 同样是"还没做完",用空心圆),
 * 完成是圆圈勾 + `text-token-text-tertiary`(完成项要退到背景里)。
 *
 * 外面那层 `div.flex.size-4.shrink-0.items-center.justify-center.overflow-hidden`
 * 不能省:图标本身是 20px viewBox,靠这层裁到 16px 的格子里并居中,
 * 否则多行文字时图标会跟着行盒漂。
 */
function StepIcon({ status }: { status: Todo['status'] }): React.JSX.Element {
  return (
    <div className="flex size-4 shrink-0 items-center justify-center overflow-hidden">
      {status === 'completed' ? (
        <CircleCheckIcon aria-hidden className="icon-xs block shrink-0 text-token-text-tertiary" />
      ) : (
        <CirclePendingIcon aria-hidden className="icon-xs block shrink-0" />
      )}
    </div>
  )
}

/** 圆环进度 —— Codex `PA`(app-initial 源码 `zEo`) */
function ProgressDonut({
  percent,
  className
}: {
  percent: number
  className?: string
}): React.JSX.Element {
  const radius = (SIZE - STROKE) / 2
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <svg
      aria-hidden="true"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={cx('shrink-0', className)}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={STROKE}
        fill="none"
        opacity={0.16}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={STROKE}
        opacity={clamped === 0 ? 0 : 1}
        strokeLinecap="round"
        fill="none"
        pathLength={PATH_LENGTH}
        strokeDasharray={PATH_LENGTH}
        strokeDashoffset={PATH_LENGTH - clamped}
        style={{ transition: 'stroke-dashoffset 120ms ease-out, opacity 120ms ease-out' }}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
    </svg>
  )
}
