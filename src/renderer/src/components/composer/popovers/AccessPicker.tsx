import type { ComponentType } from 'react'
import { useSession } from '../../../state/SessionContext'
import { ACCESS_POLICIES, type AccessPolicy } from '../../../services/chat/types'
import { CheckIcon, HandIcon, ShieldIcon, type IconProps } from '../../icons'

const iconByPolicy: Record<AccessPolicy['id'], ComponentType<IconProps>> = {
  ask: HandIcon,
  auto: ShieldIcon,
  full: ShieldIcon
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
 *   button[role=menuitem]
 *   └ div.flex.w-full.items-center.gap-3
 *     ├ [icon svg]
 *     ├ div.flex.min-w-0.flex-1.flex-col > 标题 + 描述(text-token-description-foreground)
 *     └ (选中)[check svg]
 *
 * 选中项写入 SessionContext.access,随 turn/start 的每轮覆盖项下发(设计文档 §5.4)。
 * 警告档(Full access)的标题/描述/勾选都换 text-token-editor-warning-foreground。
 */
export function AccessPicker({ onClose }: AccessPickerProps): React.JSX.Element {
  const { access, setAccess } = useSession()

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
      {ACCESS_POLICIES.map((policy) => {
        const Icon = iconByPolicy[policy.id]
        const active = policy.id === access.id
        return (
          <button
            key={policy.id}
            type="button"
            role="menuitem"
            onClick={() => {
              setAccess(policy)
              onClose()
            }}
            className={MENU_ITEM_CLASS}
          >
            <div className="flex w-full items-center gap-3">
              <Icon className="icon-xs shrink-0" />
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
              {active && <CheckIcon className="size-4 shrink-0" />}
            </div>
          </button>
        )
      })}
    </>
  )
}
