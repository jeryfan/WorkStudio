import {
  ALL_SETTINGS,
  settingByKey,
  type SettingDefinition,
  type SettingsSnapshot
} from '@shared/settings/definitions'

/**
 * 桌面端设置的**真值持有者**。
 *
 * 取证（Codex 主进程 `window-all-closed-*.js` 里的 settings store 类）：
 *
 *   - 落盘位置是 app-server 的 config，键路径 `desktop.<key>`；写入方法是
 *     `config/batchWrite`，`mergeStrategy: 'replace'`（逐字取自
 *     `{ keyPath: \`desktop.${key}\`, mergeStrategy: 'replace', value }`）。
 *   - 初始值来自 `getUserSavedConfiguration()`，即 `config/read`
 *     `{ includeLayers: false, cwd: null }` 的 `.config`，取其 `.desktop`。
 *   - 运行时证据：`~/.codex/config.toml` 里确实是
 *         [desktop]
 *         appearanceTheme = "system"
 *   - `set()` 的顺序是「先改内存 + 通知监听者，再排队落盘」。落盘是
 *     fire-and-forget 的串行队列（`persistQueued`），多次连点合并成一次
 *     batchWrite；失败只告警，内存值不回滚。
 *   - `getEffective(key) = get(key) ?? definition.default`；`get()` 只返回
 *     显式配置过的值。渲染层的两张表就是这两者。
 *
 * **与 Codex 的一处差异（已知缺口，非等价实现）**：Codex 的 store 在构造时
 * 还会**同步**读一遍 `~/.codex/config.toml` 并解析 TOML，好在 app-server
 * 起来之前就有值可用（这样第一帧就能把 `nativeTheme.themeSource` 摆对）。
 * 本项目没有 TOML 解析依赖，只保留 `initialize()` 这一路，因此当用户选了
 * 与系统外观相反的 light/dark 时，启动瞬间会先按系统外观画一帧再纠正。
 * `system` 档（默认值）不受影响。
 */

export interface SettingsConfigClient {
  /** `config/batchWrite` */
  batchWriteConfigValues(params: {
    edits: Array<{ keyPath: string; value: unknown; mergeStrategy: 'replace' | 'upsert' }>
  }): Promise<unknown>
}

type ChangeListener = () => void

export class SettingsStore {
  /** 显式配置过的值（Codex 的 `state`），键是设置项的 `key` */
  private readonly state = new Map<string, unknown>()
  /** 还没落盘成功的值（Codex 的 `pendingWrites`） */
  private readonly pendingWrites = new Map<string, unknown>()
  private readonly changeListeners = new Map<string, Set<ChangeListener>>()
  private configClient: SettingsConfigClient | null = null
  private persistQueued: Promise<void> = Promise.resolve()

  /**
   * 接上 config 通道并用 config 的现值对齐内存（Codex `initialize`）。
   *
   * agent 重启后会再调一次：语义是"以 config 为准重新对齐"，
   * 未落盘的 pendingWrites 不被覆盖（它们还没写进去，config 里当然没有）。
   */
  async initialize(params: { config: unknown; client: SettingsConfigClient }): Promise<void> {
    const before = new Map(
      [...this.changeListeners.keys()].map((key) => [key, this.getEffective(key)])
    )
    this.configClient = params.client
    const desktop = readDesktopTable(params.config)

    for (const definition of ALL_SETTINGS) {
      if (this.pendingWrites.has(definition.key)) continue
      const raw = desktop[definition.key]
      if (raw === undefined) {
        this.state.delete(definition.key)
        continue
      }
      const parsed = definition.schema.safeParse(raw)
      if (!parsed.success) {
        console.warn('[settings] dropping invalid desktop setting', definition.key)
        this.state.delete(definition.key)
        continue
      }
      this.state.set(definition.key, parsed.data)
    }

    // 只对"生效值真的变了"的键发通知 —— 与 Codex 一致，避免无谓的下游刷新
    for (const [key, previous] of before) {
      if (!Object.is(previous, this.getEffective(key))) this.notifyChangeListeners(key)
    }
    await this.persistPendingSettings()
  }

  /** Codex `get` —— 只有显式配置过才有值 */
  get(key: string): unknown {
    return this.state.get(key)
  }

  /** Codex `getEffective` */
  getEffective(key: string): unknown {
    const configured = this.get(key)
    return configured ?? settingByKey(key)?.default
  }

  /** Codex `set` —— 先改内存并通知，再排队落盘 */
  set(key: string, value: unknown): void {
    const definition = settingByKey(key)
    if (definition == null) throw new Error(`Unknown setting ${key}`)
    const previous = this.getEffective(key)
    const parsed = definition.schema.parse(value)
    this.state.set(key, parsed)
    this.pendingWrites.set(key, parsed)
    if (!Object.is(previous, parsed)) this.notifyChangeListeners(key)
    void this.persistPendingSettings()
  }

  /** Codex `onDidChange` */
  onDidChange(key: string, listener: ChangeListener): () => void {
    const listeners = this.changeListeners.get(key) ?? new Set<ChangeListener>()
    listeners.add(listener)
    this.changeListeners.set(key, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.changeListeners.delete(key)
    }
  }

  /** Codex `get-settings` 的响应（`getConfiguredSettingValues` + `getSettingValues`） */
  snapshot(): SettingsSnapshot {
    const configuredValues: Record<string, unknown> = {}
    const values: Record<string, unknown> = {}
    for (const definition of ALL_SETTINGS) {
      const configured = this.get(definition.key)
      if (configured !== undefined) configuredValues[definition.key] = configured
      values[definition.key] = this.getEffective(definition.key)
    }
    return { configuredValues, values }
  }

  /** Codex `flush()` —— 退出前把未落盘的写出去 */
  flush(): Promise<void> {
    return this.persistQueued.then(() => this.persistPendingSettings())
  }

  private notifyChangeListeners(key: string): void {
    for (const listener of this.changeListeners.get(key) ?? []) listener()
  }

  /**
   * 串行队列 + 批量写（Codex `persistPendingSettings`）。
   *
   * 为什么要队列而不是每次直接写：主题选择器是三连点也很常见的控件，
   * 并发的 config 写会互相覆盖版本；串起来之后每一轮把当时所有 pending
   * 合成一个 batchWrite，最后一次点击必然是最后写进去的那个。
   */
  private persistPendingSettings(): Promise<void> {
    const client = this.configClient
    if (client == null) return this.persistQueued
    this.persistQueued = this.persistQueued
      .catch(() => undefined)
      .then(async () => {
        const inFlight = new Map(this.pendingWrites)
        if (inFlight.size === 0) return
        try {
          await client.batchWriteConfigValues({
            edits: [...inFlight].map(([key, value]) => ({
              keyPath: `desktop.${key}`,
              mergeStrategy: 'replace',
              value
            }))
          })
          // 只清掉"这一轮写出去的那个值"——期间又被改过的键留给下一轮
          for (const [key, value] of inFlight) {
            if (Object.is(this.pendingWrites.get(key), value)) this.pendingWrites.delete(key)
          }
        } catch (error) {
          console.warn('[settings] failed to persist desktop settings', error)
        }
      })
    return this.persistQueued
  }
}

/** config 的 `[desktop]` 表 —— 形状不对就当空表（Codex 同样是"告警 + 丢弃"） */
function readDesktopTable(config: unknown): Record<string, unknown> {
  if (config == null || typeof config !== 'object') return {}
  const desktop = (config as { desktop?: unknown }).desktop
  if (desktop == null || typeof desktop !== 'object' || Array.isArray(desktop)) return {}
  return desktop as Record<string, unknown>
}

export type { SettingDefinition }
