import { useId, useState } from 'react'
import * as Checkbox from '@radix-ui/react-checkbox'
import {
  useSideChatCloseConfirmation,
  resolveSideChatCloseConfirmation
} from './sideChatCloseGuard'
import { CheckIcon } from '../../icons'

/**
 * Side chat 关闭确认弹窗 —— Codex `De`(local-conversation-side-chat chunk),
 * DOM 逐项对齐实测(2026-08-24,Codex 8214 实例):
 *
 *   div[role=dialog].codex-dialog.fixed.left-1/2.top-1/2.z-50.-translate…
 *     .bg-token-dropdown-background/90.ring-token-border.rounded-3xl.ring-[0.5px]
 *     .shadow-lg.backdrop-blur-xl.overflow-hidden.w-[420px].max-w-[92vw]
 *   └ form.flex.flex-col.gap-0.px-5.py-5.text-base.leading-normal.tracking-normal
 *     ├ div.flex.w-full.flex-col.pt-3.first:pt-0            ← 标题区
 *     │ └ …items-start.gap-3 > …gap-1.self-stretch
 *     │   ├ div.heading-dialog.min-w-0.font-semibold          "Close side chat?"
 *     │   └ div.text-token-description-foreground.text-base…  "This side chat will be gone…"
 *     ├ div.pt-3.first:pt-0 > div.relative.flex.items-center.gap-2
 *     │   └ Radix Checkbox(role=checkbox)+ label("Don’t ask again")
 *     └ div.pt-3.first:pt-0 > div.flex.w-full.items-center.justify-end.gap-3
 *       ├ Cancel(secondary:text-token-foreground bg-token-foreground/5)
 *       └ Close side chat(danger:bg-token-charts-red/10 text-token-charts-red)
 */
export function SideChatCloseDialogHost(): React.JSX.Element | null {
  const state = useSideChatCloseConfirmation()
  if (state == null) return null
  return <SideChatCloseDialog />
}

function SideChatCloseDialog(): React.JSX.Element {
  const checkboxId = useId()
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const close = (confirmed: boolean): void => {
    resolveSideChatCloseConfirmation(confirmed, dontAskAgain)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/[0.133]" onMouseDown={() => close(false)} />
      <div
        role="dialog"
        aria-modal="true"
        className="codex-dialog fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-token-dropdown-background/90 text-token-foreground ring-[0.5px] ring-token-border shadow-lg backdrop-blur-xl outline-none"
      >
        <form
          className="flex flex-col gap-0 px-5 py-5 text-base leading-normal tracking-normal"
          onSubmit={(e) => {
            e.preventDefault()
            close(true)
          }}
        >
          <div className="flex w-full flex-col pt-3 first:pt-0">
            <div className="flex flex-col items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1 self-stretch">
                <div className="heading-dialog min-w-0 font-semibold">Close side chat?</div>
                <div className="text-base leading-normal tracking-normal text-token-description-foreground">
                  This side chat will be gone and can’t be recovered. Are you sure?
                </div>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col pt-3 first:pt-0">
            <div className="relative flex items-center gap-2">
              <Checkbox.Root
                id={checkboxId}
                checked={dontAskAgain}
                onCheckedChange={(v) => setDontAskAgain(v === true)}
                className="peer icon-2xs shrink-0 rounded-xs border border-token-border shadow-xs outline-none transition-[background-color,border-color,box-shadow] data-[state=checked]:border-token-border data-[state=checked]:bg-token-checkbox-background data-[state=checked]:text-token-checkbox-foreground hover:bg-token-editor-background focus-visible:border-token-border focus-visible:ring-1 focus-visible:ring-token-checkbox-background/50 disabled:cursor-not-allowed"
              >
                <Checkbox.Indicator className="flex items-center justify-center">
                  <CheckIcon className="icon-2xs" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <label
                htmlFor={checkboxId}
                className="cursor-interaction text-sm text-token-foreground"
              >
                Don’t ask again
              </label>
            </div>
          </div>
          <div className="flex w-full flex-col pt-3 first:pt-0">
            <div className="flex w-full items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-lg text-token-foreground bg-token-foreground/5 enabled:hover:bg-token-foreground/10 data-[state=open]:bg-token-foreground/10 border-transparent px-4 py-1.5 text-base leading-[18px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-lg bg-token-charts-red/10 enabled:hover:bg-token-charts-red/20 text-token-charts-red border-transparent px-4 py-1.5 text-base leading-[18px]"
              >
                Close side chat
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
