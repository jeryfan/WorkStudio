/* eslint-disable react-refresh/only-export-components -- Context 文件：Provider 与 hook 同文件是标准模式 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { rpc } from '../rpc/client'
import { M } from '@shared/protocol/methods'
import type { AuthMode } from '@shared/protocol/generated/AuthMode'
import type { GetAuthStatusResponse } from '@shared/protocol/generated/GetAuthStatusResponse'
import type { Account } from '@shared/protocol/generated/v2/Account'
import type { PlanType } from '@shared/protocol/generated/PlanType'

/**
 * 账号状态 —— Codex 的 `AuthProvider` + `uF()`（`useAuth`）。
 *
 * 取证（app-initial 的 `uF` / `RZr`）：
 *   - `uF()` 从 context 取，取不到直接抛 `useAuth must be used within AuthProvider`；
 *   - 状态形状是 `{openAIAuth, authMethod, requiresAuth, email, planAtLogin}`，
 *     拿不到时的兜底是 **`requiresAuth: true`**（在知道之前假定需要登录，
 *     配合 `isLoading` 用，宁可多等一帧也不要先把应用放进去）；
 *   - 上层门禁只用三个字段：`isLoading` / `authMethod` / `requiresAuth`。
 *
 * 数据来自两个协议方法，一次并发取回：
 *   `getAuthStatus`  → authMethod、requiresOpenaiAuth
 *   `account/read`   → account（chatgpt 那支带 email / planType）
 * 变更由 `account/updated` 与 `account/login/completed` 两条通知驱动重取
 * （两条都在 notifications.ts 的订阅表里）。
 *
 * `error` 是本项目加的，Codex 没有：他们的宿主保证 app-server 一定在，
 * 我们的 agent 可能根本起不来（二进制缺失、Gatekeeper 拦截），那时这两个请求
 * 会失败。不把失败表达出来的话，门禁会永远停在"还在查"的空屏上。
 */
export interface AuthState {
  authMethod: AuthMode | null
  /** 当前 provider 是否需要 OpenAI 鉴权；未知时按 true 处理（Codex 同） */
  requiresAuth: boolean
  email: string | null
  planType: PlanType | null
  isLoading: boolean
  /** 查询失败（通常意味着 agent 不可用）；Codex 无此字段 */
  error: string | null
}

export interface AuthContextValue extends AuthState {
  /** 重新拉一次（登录/登出之后手动触发，不必等通知） */
  refresh(): void
}

const FALLBACK: AuthState = {
  authMethod: null,
  requiresAuth: true,
  email: null,
  planType: null,
  isLoading: true,
  error: null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function accountDetails(account: Account | null): {
  email: string | null
  planType: PlanType | null
} {
  if (account == null) return { email: null, planType: null }
  if (account.type === 'chatgpt') return { email: account.email, planType: account.planType }
  return { email: null, planType: null }
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<AuthState>(FALLBACK)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    /*
     * 不在每次重取时把 isLoading 拉回 true：门禁看的就是 isLoading，
     * 登录成功后重取那一下会把已经渲染出来的应用又打回空屏。
     * Codex 的 query 同理（refetch 不算 isLoading）。
     */
    void (async () => {
      try {
        const [status, account] = await Promise.all([
          rpc.request<GetAuthStatusResponse>(M.authStatus, {
            includeToken: false,
            refreshToken: false
          }),
          rpc
            .request<{ account: Account | null }>(M.accountRead, {})
            .catch(() => ({ account: null }))
        ])
        if (cancelled) return
        const { email, planType } = accountDetails(account.account)
        setState({
          authMethod: status.authMethod,
          // 协议里 requiresOpenaiAuth 可空；空按"需要"处理，与 Codex 的兜底同向
          requiresAuth: status.requiresOpenaiAuth ?? true,
          email,
          planType,
          isLoading: false,
          error: null
        })
      } catch (error) {
        if (cancelled) return
        setState({
          ...FALLBACK,
          isLoading: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [nonce])

  useEffect(() => {
    const disposers = [
      rpc.on('account/updated', () => refresh()),
      rpc.on('account/login/completed', () => refresh())
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, [refresh])

  const value = useMemo<AuthContextValue>(() => ({ ...state, refresh }), [state, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Codex `uF()` —— 缺 provider 时直接抛，与上游同一句话 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value == null) throw new Error('useAuth must be used within AuthProvider')
  return value
}
