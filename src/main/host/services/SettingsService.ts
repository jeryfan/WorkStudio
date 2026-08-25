import { RpcTarget } from 'capnweb'
import type { SettingsSnapshot } from '@shared/settings/definitions'
import type { SettingsService as SettingsContract } from '@shared/host/appHost'
import type { SettingsStore } from '../../settings/SettingsStore'

/**
 * 设置的读写出口。
 *
 * 取证：Codex 把这两个操作放在宿主消息的请求/应答通道上
 *（`handleVSCodeRequest` 的 handlers 表里的 `get-settings` / `set-setting`），
 * 响应形状分别是 `{configuredValues, values}` 与 `{success: true}`。
 *
 * **与 Codex 的一处差异（通道不同，方法面一致）**：本项目没有那条基于宿主
 * 消息的请求/应答通道 —— 宿主服务一律走 capnweb 服务树（对应 Codex 的
 * `AppHostServices`）。为设置单独造一条消息级请求通道，等于为一个功能引入
 * 一整套并行基础设施；这里改用已有的服务树，方法名与响应形状保持 Codex 原样。
 *
 * 写入后由 WindowContext 广播 `invalidateQueryCache(['get-settings'])`
 *（Codex `broadcastQueryCacheInvalidation` 的同一条路），多窗口据此重取。
 */
export class SettingsService extends RpcTarget implements SettingsContract {
  constructor(private readonly store: SettingsStore) {
    super()
  }

  /** Codex `get-settings` */
  getSettings(): SettingsSnapshot {
    return this.store.snapshot()
  }

  /** Codex `set-setting` */
  setSetting(key: string, value: unknown): { success: true } {
    this.store.set(key, value)
    return { success: true }
  }
}
