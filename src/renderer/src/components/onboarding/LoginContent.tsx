import type { ReactNode } from 'react'
import { Button } from '../button/Button'

/**
 * 登录页的"另一种登录方式"面板 —— Codex 的 `onboarding-login-content` chunk
 *（导出 `t`，本文件的 `LoginContent`）。
 *
 * 这个组件有两个分支，v2 登录页（`LoginRoute`）只会走 **API key** 那一支 ——
 * 另一支（Continue with ChatGPT / Enter API key 两个大按钮）是 v1 onboarding 的
 * 形态，v2 把它挪到了外层 `Bt` 里用原生 `<button>` 画。所以这里只搬 API key 那支，
 * 不搬 v1 分支：搬了也没有调用点。
 *
 * DOM 逐字（Codex chunk 的 `c` 函数，`o === true` 那一支）：
 *
 *   div.flex.w-full.flex-col.gap-3
 *   ├ label.text-base.font-medium.text-token-foreground
 *   │  ├ "OpenAI API key"                       (electron.onboarding.login.apikey.label)
 *   │  └ input.mt-2.w-full.rounded-xl.border.border-token-border.bg-token-input-background
 *   │        .px-4.py-2.5.focus:ring-2.focus:ring-black/15.focus:outline-none
 *   │        [autoFocus placeholder="sk-…"]     (electron.onboarding.login.apikey.placeholder)
 *   └ div.flex.items-center.gap-2
 *     ├ <Button color="secondary" className="flex flex-1 justify-center py-2">{secondaryLabel}</Button>
 *     └ <Button className="flex flex-1 justify-center py-2" disabled={空||pending} loading={pending}>
 *          "Continue"                           (electron.onboarding.login.apikey.continue)
 *
 * 注意 placeholder 是 `sk-…`（U+2026 省略号），不是三个点 —— 与产物一致。
 * 提交按钮的禁用条件是 `apiKeyValue.trim().length === 0 || pending`，也就是
 * **只有空白**才算空，粘贴时误带的首尾空格不会让按钮变灰。
 */
export function LoginContent({
  apiKeyValue,
  isApiKeySignInPending,
  onApiKeySecondaryAction,
  onApiKeySubmit,
  onApiKeyValueChange,
  apiKeySecondaryActionLabel
}: {
  apiKeyValue: string
  isApiKeySignInPending: boolean
  onApiKeySecondaryAction(): void
  onApiKeySubmit(): void
  onApiKeyValueChange(value: string): void
  apiKeySecondaryActionLabel: ReactNode
}): React.JSX.Element {
  const submitDisabled = apiKeyValue.trim().length === 0 || isApiKeySignInPending
  return (
    <div className="flex w-full flex-col gap-3">
      <label className="text-base font-medium text-token-foreground">
        OpenAI API key
        <input
          autoFocus
          className="mt-2 w-full rounded-xl border border-token-border bg-token-input-background px-4 py-2.5 focus:ring-2 focus:ring-black/15 focus:outline-none"
          placeholder="sk-…"
          value={apiKeyValue}
          onChange={(event) => onApiKeyValueChange(event.target.value)}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          color="secondary"
          className="flex flex-1 justify-center py-2"
          onClick={onApiKeySecondaryAction}
        >
          {apiKeySecondaryActionLabel}
        </Button>
        <Button
          className="flex flex-1 justify-center py-2"
          onClick={onApiKeySubmit}
          disabled={submitDisabled}
          loading={isApiKeySignInPending}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
