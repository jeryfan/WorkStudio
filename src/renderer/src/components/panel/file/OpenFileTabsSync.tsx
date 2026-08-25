import { useEffect, useMemo } from 'react'
import { useAppShell } from '../../../state/AppShellContext'
import { useChatRuntime } from '../../../state/ChatRuntimeContext'
import { useThreadWorkspace } from '../../../state/threadWorkspace'
import { openFilesWatcher } from '../../../services/file/openFilesWatcher'
import { reviewFileSourceFromTab } from '../filesTabDescriptor'

/**
 * 把"当前打开的文件 tab"同步给监视器 —— Codex `v$i`
 * (`set-open-review-file-source-tabs`)的接线。
 *
 * Codex 是在 `HY`(开 tab)与该 tab 的 `onClose` 两处 imperative 调 `v$i`,
 * 参数是 `l$i(N1n(scope, {excludeTab}))` —— **右面板 + 底部面板全部 tab**(`N1n`),
 * 关闭时把自己排除掉。WS 这里换成一个派生 effect:tab 列表本身就是 state,
 * 开/关/跨面板移动都会让它变,覆盖的时机是 Codex 那两处的超集,语义等价,
 * 也不必把 sync 回调穿过四个打开入口。
 *
 * 渲染 null,挂在 AppShell 里(与 AppCommands 同一层)。
 */
export function OpenFileTabsSync(): null {
  const { rightPanelController, bottomPanelController } = useAppShell()
  const { activeChatId } = useChatRuntime()
  const { cwd } = useThreadWorkspace()

  // Codex `l$i(N1n(...))`:两个面板的 tab 合起来,过出 workspaceFile 的
  const reviewFiles = useMemo(
    () =>
      [...rightPanelController.tabs, ...bottomPanelController.tabs].flatMap(
        reviewFileSourceFromTab
      ),
    [rightPanelController.tabs, bottomPanelController.tabs]
  )
  // 数组每次渲染都是新引用,用内容 key 做 effect 依赖
  const pathsKey = reviewFiles.map((file) => file.path).join('\0')

  useEffect(() => {
    if (activeChatId == null) return
    openFilesWatcher.setOpenReviewFileSourceTabs(activeChatId, cwd, reviewFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reviewFiles 用 pathsKey 代表内容
  }, [activeChatId, cwd, pathsKey])

  /*
   * 注销单独一个 effect:清理只能发生在**会话切走/卸载**时(Codex `removeConversation`)。
   * 放进上面那个 effect 会让每次 tab 列表变化都先注销再登记 —— sync() 于是把没变的
   * 文件也 unwatch 再 watch 一遍(Codex 的 sync 是做差集的,不churn)。
   */
  useEffect(() => {
    if (activeChatId == null) return
    return () => openFilesWatcher.removeConversation(activeChatId)
  }, [activeChatId])

  return null
}
