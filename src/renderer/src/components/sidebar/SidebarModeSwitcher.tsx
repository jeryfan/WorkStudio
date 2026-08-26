import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CheckIcon, ChevronIcon } from '../icons'
import { CodexMenuContent } from '../menu/CodexMenu'

/**
 * 侧栏顶部的模式切换器 —— 就是那个写着「Codex ⌄」的控件。
 *
 * 触发器 + 菜单都是 Codex 实测:
 *
 * ```
 * button[aria-haspopup=menu][aria-expanded][data-state]
 *   [aria-label="Switch mode, current mode: X"]
 * div[role=menu][data-radix-menu-content][data-side=bottom][data-align=start][data-state=open]
 *   .z-50.w-[240px].m-px.flex.flex-col.overflow-y-auto.px-1.py-1.no-drag.select-none
 *   .rounded-xl.ring-[0.5px].ring-token-border.shadow-xl-spread.backdrop-blur-sm
 *   .bg-token-dropdown-background/90.text-token-foreground.p-1.5     ← p-1.5 在 px-1 py-1 之后
 * └ div[role=menuitem][data-radix-collection-item]  ×2
 *   └ div.flex.w-full.items-center.gap-1.5
 *     └ div.flex.min-w-0.flex-1.flex-col
 *       ├ span.min-w-0.truncate > span.font-openai-sans        ← 标题
 *       └ span.min-w-0.truncate > span.text-token-description-foreground  ← 副标题
 *     [+ 当前项尾部 svg.icon-xs.opacity-75.shrink-0]
 * ```
 *
 * 几何实测:菜单 240×104、项高 48、圆角 15px、blur(8px);
 * 相对按钮 dx=+1 / 距按钮底 +5 —— 那 1px 和 1px 里的一半来自菜单自己的
 * `m-px`,所以定位参数是 `side="bottom" align="start" sideOffset={4}`。
 *
 * 菜单就是 Radix DropdownMenu(data-radix-menu-content 为证)—— 之前手写过
 * portal + 外部点击判定,换来了 DOM 对但键盘导航/焦点管理全缺;现在归位。
 *
 * **刻意偏离一处**:WS 目前只有 Codex 一种模式,没有 ChatGPT Work。
 * 两个菜单项照 Codex 全都渲染(DOM 与文案一致、当前项打勾),但选中
 * 「ChatGPT Work」只关菜单、不做别的 —— 这里不假装一个还不存在的能力。
 * 接入模式概念时把 `onSelect` 换成真实切换即可,DOM 不用动。
 */

interface ModeDef {
  id: 'work' | 'codex'
  title: string
  description: string
}

/** 文案逐字来自 Codex 实测 */
const MODES: ModeDef[] = [
  { id: 'work', title: 'ChatGPT Work', description: 'Create, learn, and explore' },
  { id: 'codex', title: 'Codex', description: 'Build, debug, and ship' }
]

const MENU_ITEM =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] ' +
  'text-sm text-token-foreground group hover:bg-token-list-hover-background ' +
  'focus:bg-token-list-hover-background cursor-interaction py-2.5 text-base flex flex-col'

export function SidebarModeSwitcher(): React.JSX.Element {
  // WS 只有 Codex 一种模式,这里先固定;接入模式概念后换成外部状态
  const current: ModeDef['id'] = 'codex'
  const currentMode = MODES.find((m) => m.id === current) ?? MODES[1]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Switch mode, current mode: ${currentMode.title}`}
          /*
           * 类名逐字照 Codex —— 包括那些看起来矛盾的重复:`rounded-full` 被后面的
           * `rounded-xl` 压掉、`px-2` 与 `cursor-interaction` 各出现两次、
           * `text-sm` 被 `!text-[17px]` 压掉。它们来自"基类 + 变体"的拼接,
           * 保留原样才和 Codex 的层叠结果完全一致(D6)。
           */
          className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-full text-token-foreground enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent px-2 py-0.5 text-sm leading-[18px] min-w-0 outline-hidden cursor-interaction -ms-2 h-8 min-w-0 rounded-xl px-2 !text-[17px] !leading-6 font-medium"
        >
          {/*
           * 构成实测:文字 span(font-openai-sans font-semibold, 50×24)
           * + 右侧 14×14 的 chevron(icon-2xs,占位符前景色)。**没有 logo**。
           */}
          <span className="truncate font-openai-sans font-semibold">{currentMode.title}</span>
          <ChevronIcon className="icon-2xs shrink-0 text-token-input-placeholder-foreground" />
        </button>
      </DropdownMenu.Trigger>
      {/* 类序照实测:…px-1 py-1 … w-[240px] p-1.5 —— p-1.5 在最后,六向 6px */}
      <CodexMenuContent sideOffset={4} className="w-[240px] p-1.5">
        {MODES.map((mode) => (
          <DropdownMenu.Item key={mode.id} className={MENU_ITEM}>
            <div className="flex w-full items-center gap-1.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="min-w-0 truncate">
                  <span className="font-openai-sans">{mode.title}</span>
                </span>
                <span className="min-w-0 truncate">
                  <span className="text-token-description-foreground">{mode.description}</span>
                </span>
              </div>
              {mode.id === current && (
                <CheckIcon className="icon-xs shrink-0 opacity-75 group-hover:opacity-100 group-focus:opacity-100" />
              )}
            </div>
          </DropdownMenu.Item>
        ))}
      </CodexMenuContent>
    </DropdownMenu.Root>
  )
}
