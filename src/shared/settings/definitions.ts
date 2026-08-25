/**
 * 桌面端设置的定义表。
 *
 * 取证（Codex webview `app-initial` 的 `ld`，导出名 `uwt`）：每一项都是
 *
 *     { agentAccess, default, description, key, schema }
 *
 * `key` 是**落盘用的名字**（config.toml `[desktop]` 表里的键），逻辑名
 *（`theme`）只在代码里用。`agentAccess: 'read-write'` 表示 agent 也能读写
 * 这一项，所以真值必须在 config 里，任何进程内的副本都只是镜像。
 *
 * 本轮只落 appearance 的 `theme` 一项。同一命名空间下 Codex 还有
 * `appearanceLightChromeTheme` / `appearanceDarkChromeTheme` /
 * `appearanceLightCodeThemeId` / `appearanceDarkCodeThemeId` /
 * `appearanceDiffMarkerStyle` —— 结构按"多项"设计，加它们只是往
 * `APPEARANCE_SETTINGS` 里再写条目，不需要改形状。
 *
 * 与 Codex 的一处**有意差异**：Codex 的 `schema` 是 zod schema，本项目没有
 * zod 依赖，这里用同名同语义的最小 `parse` / `safeParse` 两件套代替
 *（`n.zi(key).parse(v)` / `.safeParse(v)` 的调用点形状原样保留）。
 */

export type SettingAgentAccess = 'read-write' | 'read-only' | 'hidden'

export type SafeParseResult<T> = { success: true; data: T } | { success: false }

/** Codex 的 zod schema 在本项目里收窄成这两个方法 —— 调用点形状一致 */
export interface SettingSchema<T> {
  parse(value: unknown): T
  safeParse(value: unknown): SafeParseResult<T>
}

export interface SettingDefinition<T> {
  agentAccess: SettingAgentAccess
  default: T
  description: string
  key: string
  schema: SettingSchema<T>
}

/** 枚举 schema（Codex `Il([...])`） */
export function enumOf<const T extends readonly string[]>(values: T): SettingSchema<T[number]> {
  const allowed = new Set<string>(values)
  return {
    parse(value) {
      if (typeof value !== 'string' || !allowed.has(value)) {
        throw new Error(`Expected one of ${values.join(' | ')}, received ${JSON.stringify(value)}`)
      }
      return value as T[number]
    },
    safeParse(value) {
      return typeof value === 'string' && allowed.has(value)
        ? { success: true, data: value as T[number] }
        : { success: false }
    }
  }
}

export const APPEARANCE_THEMES = ['system', 'light', 'dark'] as const
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number]

/** appearance 命名空间（Codex `ld` / 导出名 `uwt`） */
export const APPEARANCE_SETTINGS = {
  theme: {
    agentAccess: 'read-write',
    default: 'system',
    description: 'Preferred app appearance mode',
    key: 'appearanceTheme',
    schema: enumOf(APPEARANCE_THEMES)
  } satisfies SettingDefinition<AppearanceTheme>
} as const

/**
 * 全部设置项的平铺清单（Codex `n.Bi`）。
 *
 * 主进程的 store 用它做两件事：把 config 的 `[desktop]` 表筛成"我认识的键"，
 * 以及给渲染层拼 `values` / `configuredValues` 两张表。
 */
export const ALL_SETTINGS: ReadonlyArray<SettingDefinition<unknown>> = [APPEARANCE_SETTINGS.theme]

const BY_KEY = new Map(ALL_SETTINGS.map((definition) => [definition.key, definition]))

/** Codex `n.Ri(key)` */
export function settingByKey(key: string): SettingDefinition<unknown> | undefined {
  return BY_KEY.get(key)
}

/** Codex `n.zi(key)` */
export function settingSchema(key: string): SettingSchema<unknown> | undefined {
  return BY_KEY.get(key)?.schema
}

/** 渲染层 ↔ 主进程之间传的两张表（Codex `get-settings` 的响应形状） */
export interface SettingsSnapshot {
  /** 显式配置过的键（config.toml 里真的有那一行） */
  configuredValues: Record<string, unknown>
  /** 生效值 = 配置值 ?? 定义里的 default */
  values: Record<string, unknown>
}

/**
 * 设置快照在渲染层的 query key（Codex 的 `get-settings` query）。
 *
 * 主进程写完设置后广播 `invalidateQueryCache(SETTINGS_QUERY_KEY)`，
 * 渲染层据此重取 —— 两侧必须用同一个常量，所以放在 shared 里。
 */
export const SETTINGS_QUERY_KEY: readonly string[] = ['get-settings']
