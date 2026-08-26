import { rpc } from '../rpc/client'
import { M } from '@shared/protocol/methods'
import { whenHostServicesReady } from '../host/appHost'
import type { LoginAccountResponse } from '@shared/protocol/generated/v2/LoginAccountResponse'
import type { AccountLoginCompletedNotification } from '@shared/protocol/generated/v2/AccountLoginCompletedNotification'

/**
 * 登录流程 —— Codex 登录页的 `ae`（ChatGPT）与 `onApiKeySubmit`（API key）两条链。
 *
 * 取证（login-route chunk 的 `Ut`）：
 *
 *   ChatGPT：`Ye()` → `{authUrl, completion}`
 *            → `I({href: Ze(Mt(authUrl, kind), …), openTarget:'external-browser'})`
 *            → `await completion` → 成功则失效 account-info 查询并跳转
 *   API key：`ee('login-with-api-key', {hostId, apiKey})` → 同样跳转
 *
 * Codex 那两个调用打的是**宿主**方法（`login-with-chatgpt` / `login-with-api-key`），
 * 宿主再转成协议请求 `account/login/start`。本项目直接从渲染层发协议请求，理由写在
 * `@shared/protocol/methods` 的 `accountLoginStart` 注释里（我们的渲染层本来就直发
 * 所有协议请求）。唯一必须过宿主的是"用外部浏览器打开 authUrl"。
 *
 * **回调服务器是 agent 自己起的**（实测 authUrl 的 redirect_uri 是
 * `http://localhost:1455/auth/callback`），我们这边不需要任何 HTTP 服务。
 */

/** Codex `Mt(authUrl, kind)`：signup 只是给授权 URL 加一个 screen_hint */
export function withScreenHint(authUrl: string, kind: 'signin' | 'signup'): string {
  if (kind === 'signin') return authUrl
  try {
    const url = new URL(authUrl)
    url.searchParams.set('screen_hint', 'signup')
    return url.toString()
  } catch {
    return authUrl
  }
}

export interface ChatGptLoginHandle {
  loginId: string
  authUrl: string
  /** `account/login/completed` 到达时 resolve（Codex 的 `completion`） */
  completion: Promise<AccountLoginCompletedNotification>
}

/**
 * 起一次 ChatGPT 登录。
 *
 * **订阅必须在请求之前**：`account/login/completed` 可能比 `account/login/start`
 * 的响应先到（api-key 那支实测就是同一批消息里回来的），先发请求再订阅会漏掉它，
 * 表现为"浏览器里已经登录成功，应用却一直停在等待"。
 *
 * 不按 loginId 过滤：实测该通知的 `loginId` 可以是 `null`（api-key 登录那支就是），
 * 而同一时刻只可能有一次登录在飞 —— 用 id 过滤反而会把合法的完成通知丢掉。
 */
export async function startChatGptLogin(): Promise<ChatGptLoginHandle> {
  let settle: ((value: AccountLoginCompletedNotification) => void) | null = null
  const completion = new Promise<AccountLoginCompletedNotification>((resolve) => {
    settle = resolve
  })
  const dispose = rpc.on('account/login/completed', (params) => {
    settle?.(params as AccountLoginCompletedNotification)
  })
  void completion.finally(() => dispose())

  try {
    const response = await rpc.request<LoginAccountResponse>(M.accountLoginStart, {
      type: 'chatgpt'
    })
    if (response.type !== 'chatgpt') {
      throw new Error(`Unexpected login response: ${response.type}`)
    }
    return { loginId: response.loginId, authUrl: response.authUrl, completion }
  } catch (error) {
    dispose()
    throw error
  }
}

export async function cancelLogin(loginId: string): Promise<void> {
  await rpc.request(M.accountLoginCancel, { loginId })
}

/** Codex 的 `login-with-api-key`。成功后 agent 直接写出 auth.json */
export async function loginWithApiKey(apiKey: string): Promise<void> {
  const response = await rpc.request<LoginAccountResponse>(M.accountLoginStart, {
    type: 'apiKey',
    apiKey
  })
  if (response.type !== 'apiKey') {
    throw new Error(`Unexpected login response: ${response.type}`)
  }
}

export async function logout(): Promise<void> {
  await rpc.request(M.accountLogout, undefined)
}

/**
 * 在系统默认浏览器里打开授权页（Codex 的 `openTarget: 'external-browser'`）。
 *
 * 走宿主的 `chromiumBrowser.openUrl` —— 它只放 http/https，正好是我们需要的
 * 唯一形态（authUrl 是 https://auth.openai.com/…）。
 */
export async function openAuthUrl(authUrl: string): Promise<void> {
  const services = await whenHostServicesReady()
  await services.chromiumBrowser.openUrl(authUrl)
}
