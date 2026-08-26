import { useSyncExternalStore } from 'react'
import { getConnectionState, onConnectionStateChanged } from '../../rpc/client'
import { OnboardingPage } from './OnboardingPage'
import { BlossomIcon } from '../icons/BlossomIcon'

/**
 * agent 起不来时的落地页 —— **本项目独有，Codex 没有对应页面**。
 *
 * 为什么需要：Codex 的宿主保证 app-server 一定在（它是第一方产物、随包分发、
 * 崩了由宿主重拉）；我们随包分发的是同一个二进制，但它可能因为缺文件、
 * 缺执行权限、被 Gatekeeper 拦截而根本起不来。这时 `getAuthStatus` 会失败，
 * 登录门禁既拿不到 authMethod 也拿不到 requiresAuth —— 什么都不画的话，
 * 用户看到的是一个永远停在空屏（或者永远转圈）的应用。
 *
 * 文案取自主进程已经算好的那两句（`AgentBinaryError.message` + `.hint`，
 * 经 `codex-app-server-connection-state` 到渲染层）—— 那里才知道到底缺什么，
 * 这里不重新造话术。
 *
 * 版式沿用登录页的那一套（340px 列、52px 标、居中），保持是同一个"进不去应用"
 * 家族的页面。
 */
export function AgentUnavailable({
  fallbackMessage
}: {
  fallbackMessage: string
}): React.JSX.Element {
  const connection = useSyncExternalStore(onConnectionStateChanged, getConnectionState)
  const message = connection.error ?? fallbackMessage
  return (
    <OnboardingPage fullBleed>
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-token-main-surface-primary pb-6 text-token-foreground">
        <div className="flex w-[340px] flex-col items-center gap-8">
          <BlossomIcon className="shrink-0 size-[52px] text-token-foreground" />
          <div className="flex flex-col items-center gap-3">
            <h1 className="w-[316px] text-center text-[28px] leading-9 font-normal text-token-foreground">
              WorkStudio can’t start
            </h1>
            <p className="text-center text-[14px] leading-5 font-normal text-token-description-foreground">
              {message}
            </p>
            {connection.hint != null && (
              <p className="text-center text-[14px] leading-5 font-normal text-token-text-tertiary">
                {connection.hint}
              </p>
            )}
          </div>
        </div>
      </div>
    </OnboardingPage>
  )
}
