import type { ComponentType } from 'react'
import { useSession } from '../../../state/SessionContext'
import { ACCESS_POLICIES, type AccessPolicy } from '../../../services/chat/types'
import { CheckIcon, HandIcon, ShieldIcon, type IconProps } from '../../icons'

const iconByPolicy: Record<AccessPolicy['id'], ComponentType<IconProps>> = {
  ask: HandIcon,
  full: ShieldIcon
}

interface AccessPickerProps {
  onClose(): void
}

/**
 * 权限弹层（chat.html #popAccess，480px）：
 * 大行单选列表，选中项写入 SessionContext.access，
 * 随 turn/start 的每轮覆盖项（approval + sandbox）下发（设计文档 §5.4）。
 */
export function AccessPicker({ onClose }: AccessPickerProps): React.JSX.Element {
  const { access, setAccess } = useSession()

  return (
    <>
      <div className="flex min-h-6 items-center px-2 py-[5px] text-[13px] leading-4 text-token-description-foreground">
        How should agent actions be approved?
      </div>
      {ACCESS_POLICIES.map((policy) => {
        const Icon = iconByPolicy[policy.id]
        const active = policy.id === access.id
        return (
          <button
            key={policy.id}
            type="button"
            onClick={() => {
              setAccess(policy)
              onClose()
            }}
            className={`flex w-full items-center gap-3 rounded-[12.5px] px-2 py-[5px] text-left hover:bg-token-list-hover-background ${
              policy.warn ? 'text-(--color-accent-orange)' : 'text-token-foreground'
            }`}
          >
            <Icon className="size-[18px] shrink-0 opacity-75" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] leading-[18.57px]">{policy.label}</span>
              <span
                className={`whitespace-normal text-[13px] leading-[18.57px] ${
                  policy.warn ? 'text-(--color-accent-orange)' : 'text-token-description-foreground'
                }`}
              >
                {policy.description}
              </span>
            </span>
            {active && <CheckIcon className="size-4 shrink-0 text-(--color-accent-orange)" />}
          </button>
        )
      })}
    </>
  )
}
