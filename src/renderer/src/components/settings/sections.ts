/**
 * 设置分区的清单、标题与侧栏分组 —— 全部逐字取自 Codex 产物。
 *
 * 三处来源：
 *   1. slug 清单：路由表里那张懒加载 map 的键（`app-initial` 的
 *      `{ 'general-settings': D$(…), import: D$(…), … }`）。
 *   2. 标题：slug→标题的 switch（`I$c`，导出名 `Ra`，消息 id
 *      `settings.section.<slug>`）。注意几处**标题与 slug 不同名**：
 *      agent → "Configuration"、data-controls → "Archived chats"、
 *      chronicle → "Computer history"、browser-use → "Browser"、
 *      local-environments → "Environments"、environments → "Cloud Environments"。
 *   3. 侧栏分组：`vn`（四组 Personal / Integrations / Coding / Archived，
 *      每组一个 slug 顺序表）。分组函数 `fn` 的语义是：按组内 slug 顺序取出
 *      可见分区，**没被任何组认领的分区追加到最后一组**，空组丢掉。
 */

export const SETTINGS_SECTION_TITLES: Record<string, string> = {
  'general-settings': 'General',
  import: 'Import',
  profile: 'Profile',
  'keyboard-shortcuts': 'Keyboard shortcuts',
  'codex-micro': 'Codex Micro',
  appshots: 'Appshots',
  appearance: 'Appearance',
  voice: 'Voice',
  pets: 'Pets',
  agent: 'Configuration',
  'git-settings': 'Git',
  'data-controls': 'Archived chats',
  'code-review': 'Code review',
  'cloud-settings': 'Cloud preferences',
  'cloud-environments': 'Cloud environments',
  personalization: 'Personalization',
  chronicle: 'Computer history',
  usage: 'Usage & billing',
  debug: 'Debug',
  'computer-use': 'Computer use',
  'browser-use': 'Browser',
  'local-environments': 'Environments',
  worktrees: 'Worktrees',
  environments: 'Cloud Environments',
  'mcp-settings': 'MCP servers',
  'hooks-settings': 'Hooks',
  connections: 'Connections',
  'plugins-settings': 'Plugins',
  'skills-settings': 'Skills'
}

/** Codex 路由表里已知的 section 全集 */
export const SETTINGS_SECTIONS: readonly string[] = Object.keys(SETTINGS_SECTION_TITLES)

/** Codex `X9o.find(…)?.slug ?? 'general-settings'` 里的那个兜底 */
export const DEFAULT_SETTINGS_SECTION = 'general-settings'

export interface SettingsNavGroup {
  key: string
  heading: string
  slugs: readonly string[]
}

/** Codex `vn` */
export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    key: 'personal',
    heading: 'Personal',
    slugs: [
      'general-settings',
      'import',
      'profile',
      'appearance',
      'voice',
      'agent',
      'personalization',
      'pets',
      'keyboard-shortcuts',
      'usage',
      'debug'
    ]
  },
  {
    key: 'integrations',
    heading: 'Integrations',
    slugs: [
      'chronicle',
      'appshots',
      'codex-micro',
      'mcp-settings',
      'plugins-settings',
      'skills-settings',
      'browser-use',
      'computer-use'
    ]
  },
  {
    key: 'coding',
    heading: 'Coding',
    slugs: [
      'hooks-settings',
      'connections',
      'cloud-settings',
      'cloud-environments',
      'code-review',
      'git-settings',
      'local-environments',
      'environments',
      'worktrees'
    ]
  },
  { key: 'archived', heading: 'Archived', slugs: ['data-controls'] }
]

/**
 * Codex `fn(sections, groups)`：按组认领 slug，剩下的追加到最后一组，空组丢掉。
 * 传入的是"当前可见"的分区清单 —— Codex 会按 host / 实验开关裁剪它。
 */
export function groupSettingsSections(
  visible: readonly string[]
): Array<{ key: string; heading: string; slugs: string[] }> {
  const remaining = new Set(visible)
  const groups = SETTINGS_NAV_GROUPS.map((group) => ({
    key: group.key,
    heading: group.heading,
    slugs: group.slugs.filter((slug) => remaining.delete(slug))
  }))
  const leftovers = [...remaining]
  if (leftovers.length > 0) groups[groups.length - 1]?.slugs.push(...leftovers)
  return groups.filter((group) => group.slugs.length > 0)
}
