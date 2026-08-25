import { useSyncExternalStore } from 'react'
import {
  SETTINGS_QUERY_KEY,
  type SettingDefinition,
  type SettingsSnapshot
} from '@shared/settings/definitions'
import { onQueryCacheInvalidated, whenHostServicesReady } from '../host/appHost'

/**
 * 设置在渲染层的**镜像**。
 *
 * 取证（Codex 渲染层 `app-initial-*.js`）：
 *
 *   - 数据源是一个名为 `get-settings` 的 query，响应 `{configuredValues, values}`。
 *   - 读取是 `values[definition.key] ?? definition.default`（Codex `G8e`）。
 *   - 写入是 `set-setting`，成功后 invalidate 这个 query（Codex `Km`）。
 *   - 主题那一项的写入带 **`optimistic: false`**（`la` 里逐字如此）：缓存只在
 *     宿主确认之后才更新，不做乐观回填。理由是 appearanceTheme 的可见结果
 *     不是这个单选框，而是整窗换色 —— 乐观回填会让"选中态先变、颜色后变"，
 *     中间那一帧看起来像点错了。
 *
 * 这里没有第二份状态：`snapshot` 就是宿主那份的缓存，写入一律经宿主，
 * 变更靠宿主广播的 query 失效通知回流（Codex `broadcastQueryCacheInvalidation`）。
 */

let snapshot: SettingsSnapshot | null = null
let fetching: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of Array.from(listeners)) listener()
}

async function fetchSnapshot(): Promise<void> {
  const services = await whenHostServicesReady()
  const next = await services.settings.getSettings()
  snapshot = next
  emit()
}

/** 拉一次（并发调用合并成同一次请求） */
function ensureFetched(): void {
  if (fetching != null) return
  fetching = fetchSnapshot()
    .catch((error: unknown) => {
      console.warn('[settings] failed to read settings', error)
    })
    .finally(() => {
      fetching = null
    })
}

function refetch(): void {
  // 失效后必须重新发一次，不能因为"正在飞"就跳过 —— 飞在路上的那一发可能
  // 读的是写入之前的值
  const previous = fetching ?? Promise.resolve()
  fetching = previous
    .catch(() => undefined)
    .then(() => fetchSnapshot())
    .catch((error: unknown) => {
      console.warn('[settings] failed to refresh settings', error)
    })
    .finally(() => {
      fetching = null
    })
}

let subscribedToInvalidation = false

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!subscribedToInvalidation) {
    subscribedToInvalidation = true
    onQueryCacheInvalidated((queryKey) => {
      if (queryKey.length === SETTINGS_QUERY_KEY.length && queryKey[0] === SETTINGS_QUERY_KEY[0]) {
        refetch()
      }
    })
  }
  ensureFetched()
  return () => {
    listeners.delete(listener)
  }
}

/** Codex `B(definition)` —— 生效值 = 配置值 ?? default */
export function useSetting<T>(definition: SettingDefinition<T>): T {
  return useSyncExternalStore(subscribe, () => readSetting(definition))
}

export function readSetting<T>(definition: SettingDefinition<T>): T {
  const raw = snapshot?.values[definition.key]
  if (raw === undefined) return definition.default
  const parsed = definition.schema.safeParse(raw)
  return parsed.success ? parsed.data : definition.default
}

/**
 * Codex `z(scope, definition, value, options)`。
 *
 * `optimistic` 默认 true（与 Codex 的 `r?.optimistic ?? !0` 一致）：先把镜像改掉，
 * 失败再回滚。`optimistic: false` 时完全不动镜像，等宿主广播的失效通知把新值带回来。
 */
export async function writeSetting<T>(
  definition: SettingDefinition<T>,
  value: T,
  options?: { optimistic?: boolean }
): Promise<void> {
  const optimistic = options?.optimistic ?? true
  const previous = snapshot
  if (optimistic && previous != null) {
    snapshot = {
      configuredValues: { ...previous.configuredValues, [definition.key]: value },
      values: { ...previous.values, [definition.key]: value }
    }
    emit()
  }
  try {
    const services = await whenHostServicesReady()
    await services.settings.setSetting(definition.key, value)
  } catch (error) {
    if (optimistic) {
      snapshot = previous
      emit()
    }
    throw error
  }
}
