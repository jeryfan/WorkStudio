import { useSyncExternalStore } from 'react'
import { subscribeHostMessage } from '../host/hostMessages'
import { DEFAULT_SETTINGS_SECTION, SETTINGS_SECTIONS } from '../components/settings/sections'

/**
 * 应用路由。
 *
 * 取证：Codex 用 react-router，设置页的路由形状实测是 `/settings/:section/*`
 *（`kC('/settings/:section/*')?.params.section`），section 未命中已知清单时
 * 落回 `general-settings`（同一处逐字如此）。已知 section 的全集与标题、
 * 侧栏分组都在 components/settings/sections.ts —— 这里不再抄一份。
 *
 * 宿主发起的导航走 `navigate-to-route`（tray 菜单、hotkey 窗口的
 * `show-settings` 转发、`open-in-new-window` 都落到这条消息上）。这条消息
 * 主进程一直在发，之前渲染层没人接 —— 这里把它接上，不另开消息。
 *
 * 这里只存 path 字符串，不做 history/前进后退：Codex 那部分能力来自
 * react-router，本项目还没有引入路由库，本轮也不需要（设置页是从侧栏进出的，
 * Codex 的设置页顶栏 `backSlot` 实测没有任何调用方传值）。
 */

/** 会话路由的默认 path —— 非设置路由时由 activeChatId 决定渲染什么 */
const DEFAULT_PATH = '/'

let path = DEFAULT_PATH
const listeners = new Set<() => void>()

function setPath(next: string): void {
  if (next === path) return
  path = next
  for (const listener of Array.from(listeners)) listener()
}

let subscribedToHost = false

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!subscribedToHost) {
    subscribedToHost = true
    subscribeHostMessage('navigate-to-route', (message) => {
      if (typeof message.path === 'string') setPath(message.path)
    })
  }
  return () => {
    listeners.delete(listener)
  }
}

export function useRoutePath(): string {
  return useSyncExternalStore(subscribe, () => path)
}

/**
 * 渲染层自己发起的导航（Codex 的 `useNavigate()` → `navigate(to, {replace:true})`）。
 *
 * 之前只有宿主能改 path（`navigate-to-route`）；登录门禁必须能自己跳
 * （Codex 的 `<Navigate to="/login" replace/>`）。没有历史栈，所以 replace 与 push
 * 在这里是同一件事 —— 参数不留，避免暗示一个我们没有的能力。
 */
export function navigate(next: string): void {
  setPath(next)
}

export function getRoutePath(): string {
  return path
}

/**
 * `/settings/:section/*` 的匹配（Codex `kC('/settings/:section/*')`）。
 * 不是设置路由返回 null；是设置路由但 section 不在清单里，返回默认 section。
 */
export function matchSettingsSection(currentPath: string): string | null {
  if (currentPath !== '/settings' && !currentPath.startsWith('/settings/')) return null
  const section = currentPath.slice('/settings/'.length).split('/')[0] ?? ''
  return SETTINGS_SECTIONS.includes(section) ? section : DEFAULT_SETTINGS_SECTION
}

export function useSettingsSection(): string | null {
  return matchSettingsSection(useRoutePath())
}
