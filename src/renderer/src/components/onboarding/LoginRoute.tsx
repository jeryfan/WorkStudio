import { useCallback, useRef, useState } from 'react'
import { OnboardingPage } from './OnboardingPage'
import { LoginContent } from './LoginContent'
import { BlossomIcon } from '../icons/BlossomIcon'
import { AppPortals } from '../overlay/AppPortals'
import { ToastHost } from '../overlay/ToastHost'
import { dangerToast } from '../../state/toastStore'
import {
  cancelLogin,
  loginWithApiKey,
  openAuthUrl,
  startChatGptLogin,
  withScreenHint
} from '../../state/accountLogin'
import { useAuth } from '../../state/AuthContext'
import { navigate } from '../../state/route'

/**
 * 登录页 —— Codex `login-route` chunk（`LoginRoute` → `Ut` → `Bt`）。
 *
 * 这里合了上游的三层：`Gt`（路由导出）只是选 electron / 非 electron 两个形态，
 * 我们只有 electron 一种；`Ut` 是状态与流程；`Bt` 是 DOM。合并的理由是 `Gt` 的
 * 另一支在本项目里不存在，保留它只会多一层永远走同一边的分支。
 *
 * DOM 逐字取自 `Bt` 的 **appBrand=Codex**（`v === false`）那一支：
 *
 *   div.flex.h-full.w-full.items-center.justify-center.overflow-hidden
 *      .bg-token-main-surface-primary.pb-6.text-token-foreground
 *   └ div.flex.w-[340px].flex-col.items-center.gap-8
 *     ├ div.flex.w-full.flex-col.items-center.gap-8         ← v 为真时是 gap-4
 *     │ ├ <BrandLogo className="shrink-0 size-[52px]"/>
 *     │ └ h1.w-[316px].text-center.text-[28px].leading-9.font-normal.text-token-foreground
 *     └ 按钮列 / API key 面板（二选一）
 *
 * 三处刻意的省略，都不是漏：
 *
 * 1. **Snake 彩蛋**。Codex 把 52px 的 logo 包在一个 `aria-label="Play Snake"` 的
 *    按钮里，点了会把整页换成一个 ASCII 贪吃蛇（`use-ascii-engine` chunk + AudioContext）。
 *    我们不搬那个引擎，于是**也不保留那个按钮** —— 留一个点了没反应的按钮比没有更糟。
 * 2. **Continue with Google / Microsoft**。产物里由一个开关（`showChatGptProviderSignIn`）
 *    控制，默认关；而且它们只是给 authUrl 加 `connection=google-oauth2` 之类的参数。
 * 3. **设备码 / GitHub Copilot 登录**。这两支在 electron 的 v2 登录页上根本不渲染
 *    （它们属于 `it()` 那个非 electron 形态）。
 *
 * 品牌标用的是 blossom 标记：Codex 这里是一张图片资产
 * （`codex-app-ga-logo--UgmJjKM.png`），本项目没有那张图，用同族的 blossom 标记占位。
 */
export function LoginRoute(): React.JSX.Element {
  const { refresh } = useAuth()
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [isApiKeyEntryVisible, setApiKeyEntryVisible] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [isApiKeySignInPending, setApiKeySignInPending] = useState(false)
  /** 同一时刻只允许一次 ChatGPT 登录在飞（Codex 用 `y != null` 判断） */
  const loginIdRef = useRef<string | null>(null)
  const isChatGptSignInPending = abortController != null

  /** Codex `_`：`Sign-in failed: {rawMessage}`（上游是 warning 档，本项目只有 danger） */
  const reportFailure = useCallback((detail: unknown) => {
    const raw = detail instanceof Error ? detail.message : String(detail)
    dangerToast(`Sign-in failed: ${raw}`)
  }, [])

  /**
   * 登录成功后的收尾（Codex 的 `P(); l(!0); t(); r('/welcome', {replace:true})`）。
   *
   * Codex 跳的是 `/welcome`（ChatGPT 桌面端的个性化问卷）。本项目没有那一屏，
   * 直接回 `/` —— 门禁读到 authMethod 已经有了，就会渲染应用本体。
   */
  const finishLogin = useCallback(() => {
    refresh()
    navigate('/')
  }, [refresh])

  const onChatGptSignIn = useCallback(
    async (kind: 'signin' | 'signup' = 'signin') => {
      // 再点一次是"取消"（Codex：`if (x) { y?.abort(); b(null); return }`）
      if (abortController != null) {
        abortController.abort()
        const loginId = loginIdRef.current
        loginIdRef.current = null
        setAbortController(null)
        if (loginId != null) await cancelLogin(loginId).catch(() => undefined)
        return
      }

      const controller = new AbortController()
      setAbortController(controller)
      try {
        const { loginId, authUrl, completion } = await startChatGptLogin()
        loginIdRef.current = loginId
        await openAuthUrl(withScreenHint(authUrl, kind))
        const result = await completion
        if (controller.signal.aborted) return
        if (result.success) finishLogin()
        else reportFailure(result.error ?? 'Unknown error')
      } catch (error) {
        if (!controller.signal.aborted) reportFailure(error)
      } finally {
        loginIdRef.current = null
        setAbortController((current) => (current === controller ? null : current))
      }
    },
    [abortController, finishLogin, reportFailure]
  )

  const onApiKeySubmit = useCallback(async () => {
    const apiKey = apiKeyValue.trim()
    if (apiKey.length === 0 || isApiKeySignInPending) return
    setApiKeySignInPending(true)
    try {
      await loginWithApiKey(apiKey)
      finishLogin()
    } catch (error) {
      reportFailure(error)
    } finally {
      setApiKeySignInPending(false)
    }
  }, [apiKeyValue, isApiKeySignInPending, finishLogin, reportFailure])

  return (
    <OnboardingPage fullBleed>
      {/* toast 层：Codex 的 toast 是 App 级 portal，登录页也在它的覆盖范围内 */}
      <AppPortals toast={<ToastHost />} />
      {isChatGptSignInPending && !isApiKeyEntryVisible ? (
        <BrowserPendingView onCancel={() => void onChatGptSignIn()} />
      ) : (
        <div className="flex h-full w-full items-center justify-center overflow-hidden bg-token-main-surface-primary pb-6 text-token-foreground">
          <div className="flex w-[340px] flex-col items-center gap-8">
            <div className="flex w-full flex-col items-center gap-8">
              <BlossomIcon className="shrink-0 size-[52px] text-token-foreground" />
              <h1 className="w-[316px] text-center text-[28px] leading-9 font-normal text-token-foreground">
                Get started with WorkStudio
              </h1>
            </div>
            {isApiKeyEntryVisible ? (
              <div className="w-full">
                <LoginContent
                  apiKeyValue={apiKeyValue}
                  isApiKeySignInPending={isApiKeySignInPending}
                  onApiKeySecondaryAction={() => {
                    setApiKeyEntryVisible(false)
                    setApiKeySignInPending(false)
                    setApiKeyValue('')
                  }}
                  onApiKeySubmit={() => void onApiKeySubmit()}
                  onApiKeyValueChange={setApiKeyValue}
                  apiKeySecondaryActionLabel="Cancel"
                />
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-3">
                <button
                  className="flex h-[48px] w-full cursor-interaction items-center justify-center gap-2 rounded-full border border-transparent bg-token-foreground text-[14px] leading-5 font-medium text-token-dropdown-background hover:bg-token-foreground/80"
                  type="button"
                  onClick={() => void onChatGptSignIn()}
                >
                  <BlossomIcon className="size-6 shrink-0 text-token-dropdown-background" />
                  Sign in with ChatGPT
                </button>
                <button
                  className="flex h-[46px] w-full cursor-interaction items-center justify-center rounded-full border border-token-border bg-token-main-surface-primary text-[14px] leading-5 font-medium text-token-foreground hover:bg-token-list-hover-background"
                  type="button"
                  onClick={() => setApiKeyEntryVisible(true)}
                >
                  Sign in another way
                </button>
                <button
                  className="flex h-9 cursor-interaction items-center justify-center px-2 text-[14px] leading-5 font-medium text-token-description-foreground underline hover:text-token-foreground"
                  type="button"
                  onClick={() => void onChatGptSignIn('signup')}
                >
                  Sign up
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </OnboardingPage>
  )
}

/**
 * "去浏览器里继续" —— Codex `Bt` 的 `s && !i` 那一支。
 * 与主视图的区别只有三处：`pb-12`（不是 pb-6）、没有 h1、按钮是 42px 高的边框按钮。
 */
function BrowserPendingView({ onCancel }: { onCancel(): void }): React.JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-token-main-surface-primary pb-12 text-token-foreground">
      <div className="flex w-[340px] flex-col items-center gap-8">
        <BlossomIcon className="shrink-0 size-[52px] text-token-foreground" />
        <p className="text-center text-[14px] leading-5 font-normal text-token-description-foreground">
          Continue signing in with your browser
        </p>
        <button
          className="flex h-[42px] w-full cursor-interaction items-center justify-center rounded-full border border-token-border bg-token-main-surface-primary text-[14px] leading-5 font-medium text-token-description-foreground hover:bg-token-list-hover-background"
          type="button"
          onClick={onCancel}
        >
          Cancel sign-in
        </button>
      </div>
    </div>
  )
}
