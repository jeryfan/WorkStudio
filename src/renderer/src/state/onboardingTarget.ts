import type { AuthState } from './AuthContext'

/**
 * 启动目标解析 —— Codex `KQc`（app-initial:19256900 附近，模块 `GQc`）。
 *
 * 单独一个模块而不是塞在路由组件里，两个理由：Codex 本身就是独立函数（它在
 * `GQc` 模块，`JQc` 在 `e$c` 模块），而且这样它是**纯函数**，可以脱离 React
 * 直接测。
 *
 * 上游原文（保留判断顺序，顺序决定优先级）：
 * ```js
 * auth.isLoading                                             → null      // 还不知道
 * (!auth.authMethod && auth.requiresAuth) ||
 *   (auth.authMethod === 'chatgpt' && auth.hasChatGptToken === false)
 *                                                            → 'login'
 * codexFeatureAccess.status === 'loading'                    → null
 * codexFeatureAccess.status === 'allowed'
 *   ? forcedOverride ?? (isFinalStepLoading ? null
 *       : shouldShowFinalStep ? 'welcome'
 *       : (backendOnboardingCompleted || projectlessOnboardingCompleted ||
 *          workspaceRoots.length > 0) ? 'app'
 *       : ((isOnboardingContextLoading && !isFetched) || workspaceRootsIsLoading)
 *           ? null : 'welcome')
 *   : 'app'
 * ```
 *
 * 本项目落到 `login | app | null` 三档。省掉的三块与原因：
 * - `hasChatGptToken`：来自他们的 ChatGPT token 刷新链（`account/chatgptAuthTokens/refresh`
 *   那条反向请求）。本项目没搬那条链，`getAuthStatus` 的 `authMethod` 已经能表达
 *   "登录过没有"。
 * - `codexFeatureAccess`：ChatGPT 账号有没有 Codex 权限的后端判定，第一方专属。
 * - `'welcome'` / `'select-workspace'`：ChatGPT 桌面端的个性化问卷与工作区选择两屏，
 *   本项目没有对应页面，所以登录成功直接回 `/`。
 *
 * ── 关于"未配置模型就不进应用"（与需求的差别，重要）───────────────────────
 * **Codex 没有这个门禁。** 实测（空 CODEX_HOME 起 app-server）：`model/list` 恒返回
 * OpenAI 自带目录、其中一项 `isDefault: true`；`config/read` 的 `model` 为 null 时
 * 服务端也会落到默认模型。也就是说 Codex 里"模型"永远是配好的，它唯一会拦人的是
 * **没有凭据**。所以这里按 Codex 的口径实现：`requiresOpenaiAuth === true` 而
 * `authMethod == null` 就去登录页。自定义 provider 且 `requires_openai_auth = false`
 * 时（凭据由 provider 自己的 env_key 提供）Codex 直接进应用，本项目同。
 */
export type OnboardingTarget = 'login' | 'app' | null

export function resolveOnboardingTarget(auth: AuthState): OnboardingTarget {
  if (auth.isLoading) return null
  if (auth.authMethod == null && auth.requiresAuth) return 'login'
  return 'app'
}
