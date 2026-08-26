import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { LoadingIndicator } from './components/loading/LoadingIndicator'
import { AgentUnavailable } from './components/onboarding/AgentUnavailable'
import { LoginRoute } from './components/onboarding/LoginRoute'
import { postMessageFromView } from './host/hostMessages'
import { useAuth } from './state/AuthContext'
import { resolveOnboardingTarget } from './state/onboardingTarget'
import { navigate, useRoutePath } from './state/route'

/**
 * 路由门禁 —— Codex `JQc`（跳转 + 窗口模式）与 `RQc`（应用路由守卫）的合并实现。
 * 目标解析那一半在 `state/onboardingTarget.ts`（Codex `KQc`）。
 *
 * 上游是三段，因为它们挂在 react-router 的不同层：`JQc` 是 `/login`、`/welcome`、
 * `/select-workspace` 那组路由的父元素，`RQc` 是应用路由的 element。本项目只有一个
 * path store（`state/route.ts`），没有嵌套路由，把两者合成一个组件是**结构上的等价
 * 压缩**，不是省掉某个环节：解析、跳转、窗口模式、守卫四件事一个不少。
 *
 * Codex `RQc` 逐字：
 * ```js
 * const {authMethod, requiresAuth, isLoading} = uF()
 * if (isLoading) return <></>
 * if (authMethod || !requiresAuth) return <NQc/>          // 应用本体
 * return <Navigate to="/login" replace/>
 * ```
 */
const LOGIN_PATH = '/login'

export function AppRoutes(): React.JSX.Element {
  const auth = useAuth()
  const path = useRoutePath()
  /*
   * agent 不可用时按 `app` 报，让下面的 `auth.error` 分支去画失败页：
   * 这时候把窗口缩成 onboarding 尺寸是错的（那是"要登录"的形态，不是"起不来"）。
   */
  const target = auth.error != null ? 'app' : resolveOnboardingTarget(auth)
  const isLoginPath = path === LOGIN_PATH

  /*
   * 窗口模式（Codex `JQc` 里那个 effect，逐字）：
   *   const e = target === 'app' ? 'app' : 'onboarding'
   *   dispatchMessage('electron-set-window-mode',
   *     e === 'onboarding' ? {mode:e, onboardingVariant:'v2'} : {mode:e})
   * target 为 null 时不发 —— 还没决定就改窗口大小会让窗口白抖一下。
   */
  useEffect(() => {
    if (target == null) return
    postMessageFromView(
      target === 'app'
        ? { type: 'electron-set-window-mode', mode: 'app' }
        : { type: 'electron-set-window-mode', mode: 'onboarding', onboardingVariant: 'v2' }
    )
  }, [target])

  /*
   * 跳转（Codex 的 `<Navigate to=… replace/>`）。
   * 放在 effect 里而不是渲染期：渲染期改 store 会触发 React 的
   * "Cannot update a component while rendering a different component"。
   */
  useEffect(() => {
    if (target === 'login' && !isLoginPath) navigate(LOGIN_PATH)
    else if (target === 'app' && isLoginPath) navigate('/')
  }, [target, isLoginPath])

  if (auth.error != null) return <AgentUnavailable fallbackMessage={auth.error} />

  /*
   * **与 Codex 的一处刻意偏离**：上游在 `isLoading` 时渲染 `<></>` —— 空片段，
   * 也就是一屏白。他们能这么做是因为那一刻 auth 往往已经有值（宿主早就和
   * app-server 说过话了）。本项目的 `getAuthStatus` 是 AuthProvider 挂载后才发的
   * 一次真实往返，渲染空片段会在启动闪屏和登录页之间插一段白屏闪动 —— 正是启动
   * 闪屏想消除的那种。所以这里继续画那个 56px blossom，与前一段无缝。
   */
  if (target == null) return <LoadingIndicator debugName="AppRoutes.auth" />

  // 跳转还没生效的那一帧按**目标**渲染，不按 path 渲染，避免闪一下另一边
  if (target === 'login') return <LoginRoute />
  return <AppShell />
}
