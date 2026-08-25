import type { ComponentType } from 'react'
import { useSession } from '../../../state/SessionContext'
import { ACCESS_ROW_LABELS } from '../../../services/chat/types'
import type { AgentMode } from '../../../state/permissionSelection'
import { CheckIcon, HandIcon, ShieldIcon, type IconProps } from '../../icons'
import { cx } from '../../../utils/cx'

/** 菜单一行：档位 + 标签 + 图标（Codex 的 `jHs` / `PHs` / `G2`，本项目用同族图标） */
interface Row {
  mode: AgentMode
  label: string
  description: string
  icon: ComponentType<IconProps>
  /** true = 危险档，标签/描述/勾选都走警示色 */
  warn: boolean
}

/**
 * 三行的档位映射（Codex 的 handler `Je` / `Ye` / `Xe`）：
 * 第一行是 `ue` —— 有项目 `auto`、无项目 `granular`（由 defaultMode 传进来），
 * 第二行固定 `guardian-approvals`，第三行固定 `full-access`。
 */
function rows(defaultMode: AgentMode): Row[] {
  return [
    { mode: defaultMode, ...ACCESS_ROW_LABELS.default, icon: HandIcon, warn: false },
    {
      mode: 'guardian-approvals',
      ...ACCESS_ROW_LABELS.guardian,
      icon: ShieldIcon,
      warn: false
    },
    { mode: 'full-access', ...ACCESS_ROW_LABELS.full, icon: ShieldIcon, warn: true }
  ]
}

/** Codex 菜单项基类(`no-drag … rounded-lg px-row-x py-row-y`,与运行时逐项一致) */
const MENU_ITEM_CLASS =
  'no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm text-token-foreground group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col'

interface AccessPickerProps {
  onClose(): void
}

/**
 * 权限菜单(Codex 运行时实测:radix menu,三项单选)。
 *
 *   div[header] "How should ChatGPT actions be approved?" + Learn more
 *   └ div.flex.w-full.min-w-0.items-start.gap-4 > span + button.underline
 *   div[role=menuitem][tabindex=-1]
 *   └ div.flex.w-full.items-center.gap-3
 *     ├ [icon svg]  icon-sm shrink-0 opacity-75
 *     │             group-focus:opacity-100 group-hover:opacity-100
 *     ├ div.flex.min-w-0.flex-1.flex-col > 标题 + 描述(text-token-description-foreground)
 *     └ (选中)[check svg]  icon-xs + 同一组 opacity 类
 *
 * 三处按实测校正过、别改回直觉写法:
 *
 * 1. 行是 **div[role=menuitem]**,不是 button(Radix 菜单项一律是 div + roving
 *    tabindex)。所以 Enter / Space 要自己接。
 * 2. 图标是 **icon-sm(18px)** 且带 `opacity-75` + hover/focus 转实色 ——
 *    写成 icon-xs 且不带 opacity,整个菜单会比 Codex 重一档。
 * 3. 勾选是 **icon-xs**,并且当前档是警告档时它也跟着变警告色
 *    (实测 Full access 选中时 check 是 text-token-editor-warning-foreground)。
 *
 * 菜单本身不设固定宽度:Codex 的 popper wrapper 是 `min-width: max-content`,
 * 宽度由最长那行描述决定,再由 max-width 夹在视口内。
 *
 * 选中的档位写进 permissionSelection(有线程写线程 pending,同时记 host 档),
 * turn/start 前展开成 approvalPolicy / approvalsReviewer / permissions 三件套。
 */
export function AccessPicker({ onClose }: AccessPickerProps): React.JSX.Element {
  const { agentMode, defaultMode, setAgentMode } = useSession()

  return (
    <>
      <div className="text-token-description-foreground flex min-h-6 items-center truncate px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm leading-4">
        <div className="flex w-full min-w-0 items-start gap-4">
          <span className="min-w-0 flex-1 whitespace-normal">
            How should ChatGPT actions be approved?
          </span>
          {/* Codex 有 Learn more 链接(官方文档);目标 URL 未确认,暂以按钮占位 */}
          <button
            type="button"
            className="shrink-0 cursor-interaction underline underline-offset-2 hover:text-token-description-foreground"
          >
            Learn more
          </button>
        </div>
      </div>
      {rows(defaultMode).map((policy) => {
        const Icon = policy.icon
        const active = policy.mode === agentMode
        const select = (): void => {
          setAgentMode(policy.mode)
          onClose()
        }
        return (
          <div
            key={policy.mode}
            role="menuitem"
            tabIndex={-1}
            onClick={select}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                select()
              }
            }}
            className={MENU_ITEM_CLASS}
          >
            <div className="flex w-full items-center gap-3">
              <Icon
                className={cx(
                  'icon-sm shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100',
                  policy.warn && 'text-token-editor-warning-foreground'
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="min-w-0 whitespace-normal">
                  {policy.warn ? (
                    <span className="text-token-editor-warning-foreground">{policy.label}</span>
                  ) : (
                    policy.label
                  )}
                </span>
                <span className="min-w-0 whitespace-normal">
                  <span
                    className={
                      policy.warn
                        ? 'text-token-editor-warning-foreground'
                        : 'text-token-description-foreground'
                    }
                  >
                    {policy.description}
                  </span>
                </span>
              </div>
              {active && (
                <CheckIcon
                  className={cx(
                    'icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100',
                    policy.warn && 'text-token-editor-warning-foreground'
                  )}
                />
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
