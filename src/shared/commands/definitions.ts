/**
 * 命令注册表 —— 从 Codex 的 `commands` workspace 包移植（实测数组 `TX` / `CX`）。
 *
 * 这张表是**三端唯一真源**：
 *   - 主进程用它生成原生应用菜单的 label 与 accelerator（不再硬编码键位）；
 *   - 渲染层用它做命令面板、快捷键提示、命令处理器分发；
 *   - 键位命中由 Electron 的菜单 accelerator 原生完成，命中后主进程发
 *     `run-command` 宿主消息 —— 与 Codex 完全同一条链路。
 *
 * 字段语义（Codex 原名）：
 *   requiredAccess              需要本地访问能力才可用（不满足时菜单项隐藏）
 *   shortcutScope 'app'         只在应用内生效，不进原生菜单
 *   shortcutScope 'os-global'   全局热键（需要 globalShortcut，本项目未实现）
 *   availableIn                 限定宿主形态；缺省表示不限
 *   allowsKeyRepeat             长按连发（tab 循环切换要）
 *   electron.isOverridableByBrowserWebpage
 *     ★ 该键位**故意不注册到原生菜单**，让内置浏览器里的网页自己吃掉
 *      （⌘R / ⌘F / ⌘←），否则页面内的刷新与查找会被宿主抢走。
 */

export type CommandRequiredAccess = 'codexLocal' | 'workLocal' | 'codexOrWorkLocal'
export type CommandShortcutScope = 'app' | 'os-global'
export type CommandHostKind = 'electron' | 'browser'

export type CommandMenuGroupKey =
  'thread' | 'navigation' | 'panels' | 'workspace' | 'configure' | 'skills' | 'app'

export interface CommandKeybinding {
  /** Electron accelerator 语法；`MouseBack`/`MouseForward` 是 Codex 的伪键位 */
  key: string
}

export interface CommandElectronDefinition {
  menuTitle?: string
  defaultKeybindings?: CommandKeybinding[]
  platformDefaultKeybindings?: {
    macOS?: CommandKeybinding[]
    default?: CommandKeybinding[]
  }
  isOverridableByBrowserWebpage?: boolean
}

export interface CommandDefinition {
  id: string
  /** 命令面板里的标题；缺省回落到 electron.menuTitle */
  title?: string
  requiredAccess?: CommandRequiredAccess
  shortcutScope?: CommandShortcutScope
  availableIn?: CommandHostKind[]
  commandMenu?: boolean
  commandMenuGroupKey?: CommandMenuGroupKey
  allowsKeyRepeat?: boolean
  electron?: CommandElectronDefinition
}

/** 本项目尚未落地处理器的命令：定义先在，菜单项按 Codex 显示但不接 */
export const UNIMPLEMENTED_COMMAND_IDS: ReadonlySet<string> = new Set([
  'openThreadInNewWindow',
  'openSideChat',
  'openReviewTab',
  'toggleReviewTab',
  'togglePinnedSummary',
  'logOut',
  'showKeyboardShortcuts',
  'copyConversationPath',
  'copyDeeplink',
  'copySessionId',
  'copyWorkingDirectory',
  'previousRecentThread',
  'nextRecentThread'
])

export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  // ── 会话 ──
  {
    id: 'newTask',
    title: 'New Chat',
    commandMenu: true,
    commandMenuGroupKey: 'thread',
    electron: {
      menuTitle: 'New Chat',
      defaultKeybindings: [{ key: 'CmdOrCtrl+N' }, { key: 'CmdOrCtrl+Shift+O' }]
    }
  },
  {
    id: 'newProjectlessTask',
    title: 'New standalone chat',
    requiredAccess: 'codexLocal',
    availableIn: ['electron'],
    commandMenu: true,
    commandMenuGroupKey: 'thread',
    electron: {
      menuTitle: 'New standalone chat',
      defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+O' }]
    }
  },
  {
    id: 'openThreadInNewWindow',
    title: 'Open in New Window',
    commandMenu: true,
    commandMenuGroupKey: 'thread',
    electron: { menuTitle: 'Open in New Window' }
  },
  {
    id: 'archiveThread',
    title: 'Archive chat',
    commandMenu: true,
    commandMenuGroupKey: 'thread',
    electron: { menuTitle: 'Archive chat', defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+A' }] }
  },
  {
    id: 'toggleThreadPin',
    title: 'Pin/unpin chat',
    commandMenu: true,
    commandMenuGroupKey: 'thread',
    electron: { menuTitle: 'Pin/unpin chat', defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+P' }] }
  },
  {
    id: 'renameThread',
    title: 'Rename chat',
    electron: { menuTitle: 'Rename chat', defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+R' }] }
  },
  {
    id: 'openSideChat',
    requiredAccess: 'codexLocal',
    shortcutScope: 'app',
    availableIn: ['electron'],
    commandMenu: true,
    commandMenuGroupKey: 'thread',
    electron: { defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+S' }] }
  },

  // ── 导航 ──
  {
    id: 'searchChats',
    title: 'Search Chats…',
    availableIn: ['electron'],
    commandMenu: true,
    commandMenuGroupKey: 'navigation',
    electron: { menuTitle: 'Search Chats…' }
  },
  {
    id: 'searchFiles',
    title: 'Search Files…',
    requiredAccess: 'codexLocal',
    electron: { menuTitle: 'Search Files…', defaultKeybindings: [{ key: 'CmdOrCtrl+P' }] }
  },
  {
    id: 'openCommandMenu',
    title: 'Open command menu',
    electron: {
      menuTitle: 'Open command menu',
      defaultKeybindings: [{ key: 'CmdOrCtrl+K' }, { key: 'CmdOrCtrl+Shift+P' }]
    }
  },
  {
    id: 'previousTab',
    shortcutScope: 'app',
    availableIn: ['electron'],
    commandMenuGroupKey: 'navigation',
    allowsKeyRepeat: true,
    electron: {
      defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+[' }],
      platformDefaultKeybindings: {
        macOS: [{ key: 'Ctrl+Shift+Tab' }, { key: 'Command+Shift+[' }, { key: 'Command+Alt+Left' }],
        default: [{ key: 'Ctrl+Shift+Tab' }, { key: 'Ctrl+Shift+[' }, { key: 'Ctrl+PageUp' }]
      }
    }
  },
  {
    id: 'nextTab',
    shortcutScope: 'app',
    availableIn: ['electron'],
    commandMenuGroupKey: 'navigation',
    allowsKeyRepeat: true,
    electron: {
      defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+]' }],
      platformDefaultKeybindings: {
        macOS: [{ key: 'Ctrl+Tab' }, { key: 'Command+Shift+]' }, { key: 'Command+Alt+Right' }],
        default: [{ key: 'Ctrl+Tab' }, { key: 'Ctrl+Shift+]' }, { key: 'Ctrl+PageDown' }]
      }
    }
  },
  {
    id: 'previousThread',
    title: 'Previous Chat',
    commandMenu: true,
    commandMenuGroupKey: 'navigation',
    electron: {
      menuTitle: 'Previous Chat',
      defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+[' }],
      platformDefaultKeybindings: {
        macOS: [{ key: 'Command+Shift+[' }, { key: 'Command+Alt+Left' }],
        default: [{ key: 'Ctrl+Shift+[' }, { key: 'Ctrl+PageUp' }]
      }
    }
  },
  {
    id: 'nextThread',
    title: 'Next Chat',
    commandMenu: true,
    commandMenuGroupKey: 'navigation',
    electron: {
      menuTitle: 'Next Chat',
      defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+]' }],
      platformDefaultKeybindings: {
        macOS: [{ key: 'Command+Shift+]' }, { key: 'Command+Alt+Right' }],
        default: [{ key: 'Ctrl+Shift+]' }, { key: 'Ctrl+PageDown' }]
      }
    }
  },
  {
    id: 'navigateBack',
    title: 'Back',
    commandMenu: true,
    commandMenuGroupKey: 'navigation',
    electron: {
      menuTitle: 'Back',
      defaultKeybindings: [{ key: 'CmdOrCtrl+[' }, { key: 'MouseBack' }]
    }
  },
  {
    id: 'navigateForward',
    title: 'Forward',
    commandMenu: true,
    commandMenuGroupKey: 'navigation',
    electron: {
      menuTitle: 'Forward',
      defaultKeybindings: [{ key: 'CmdOrCtrl+]' }, { key: 'MouseForward' }]
    }
  },
  {
    id: 'findInThread',
    title: 'Find',
    commandMenu: true,
    commandMenuGroupKey: 'navigation',
    electron: {
      menuTitle: 'Find',
      defaultKeybindings: [{ key: 'CmdOrCtrl+F' }],
      platformDefaultKeybindings: { macOS: [{ key: 'Command+F' }], default: [{ key: 'Ctrl+F' }] },
      isOverridableByBrowserWebpage: true
    }
  },

  // ── 面板 ──
  {
    id: 'toggleSidebar',
    title: 'Toggle Sidebar',
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: { menuTitle: 'Toggle Sidebar', defaultKeybindings: [{ key: 'CmdOrCtrl+B' }] }
  },
  {
    id: 'toggleBottomPanel',
    title: 'Toggle Bottom Panel',
    requiredAccess: 'codexLocal',
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: { menuTitle: 'Toggle Bottom Panel', defaultKeybindings: [{ key: 'CmdOrCtrl+J' }] }
  },
  {
    id: 'togglePinnedSummary',
    title: 'Toggle Pinned Summary',
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: { menuTitle: 'Toggle Pinned Summary' }
  },
  {
    id: 'toggleTerminal',
    title: 'Open Terminal',
    requiredAccess: 'codexLocal',
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: { menuTitle: 'Open Terminal', defaultKeybindings: [{ key: 'Control+`' }] }
  },
  {
    id: 'toggleFileTreePanel',
    title: 'Toggle File Tree',
    requiredAccess: 'codexLocal',
    electron: { menuTitle: 'Toggle File Tree', defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+E' }] }
  },
  {
    id: 'toggleSidePanel',
    title: 'Toggle Review Panel',
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: { menuTitle: 'Toggle Review Panel', defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+B' }] }
  },
  { id: 'toggleMaximizeSidePanel', shortcutScope: 'app' },
  {
    id: 'openReviewTab',
    requiredAccess: 'codexLocal',
    shortcutScope: 'app',
    availableIn: ['electron', 'browser'],
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: { defaultKeybindings: [{ key: 'Ctrl+Shift+G' }] }
  },
  {
    id: 'toggleReviewTab',
    requiredAccess: 'codexLocal',
    shortcutScope: 'app',
    availableIn: ['electron', 'browser'],
    commandMenuGroupKey: 'panels'
  },

  // ── 内置浏览器 ──
  {
    id: 'openBrowserTab',
    title: 'Open Browser Tab',
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: { menuTitle: 'Open Browser Tab', defaultKeybindings: [{ key: 'CmdOrCtrl+T' }] }
  },
  {
    id: 'toggleBrowserPanel',
    title: 'Toggle Browser Panel',
    commandMenu: true,
    commandMenuGroupKey: 'panels',
    electron: {
      menuTitle: 'Toggle Browser Panel',
      defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+B' }]
    }
  },
  {
    id: 'focusBrowserAddressBar',
    title: 'Focus Browser Address Bar',
    commandMenu: true,
    commandMenuGroupKey: 'navigation',
    electron: {
      menuTitle: 'Focus Browser Address Bar',
      defaultKeybindings: [{ key: 'CmdOrCtrl+L' }]
    }
  },
  {
    id: 'reloadBrowserPage',
    title: 'Reload Browser Page',
    electron: {
      menuTitle: 'Reload Browser Page',
      defaultKeybindings: [{ key: 'CmdOrCtrl+R' }],
      isOverridableByBrowserWebpage: true
    }
  },
  {
    id: 'hardReloadBrowserPage',
    title: 'Force Reload Browser Page',
    electron: {
      menuTitle: 'Force Reload Browser Page',
      defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+R' }],
      isOverridableByBrowserWebpage: true
    }
  },
  {
    id: 'navigateBrowserBack',
    shortcutScope: 'app',
    availableIn: ['electron'],
    electron: {
      platformDefaultKeybindings: {
        macOS: [{ key: 'Command+Left' }],
        default: [{ key: 'Alt+Left' }]
      },
      isOverridableByBrowserWebpage: true
    }
  },
  {
    id: 'navigateBrowserForward',
    shortcutScope: 'app',
    availableIn: ['electron'],
    electron: {
      platformDefaultKeybindings: {
        macOS: [{ key: 'Command+Right' }],
        default: [{ key: 'Alt+Right' }]
      },
      isOverridableByBrowserWebpage: true
    }
  },

  // ── 标签页与窗口 ──
  {
    id: 'closeTab',
    title: 'Close Tab',
    electron: {
      menuTitle: 'Close Tab',
      defaultKeybindings: [{ key: 'CmdOrCtrl+W' }],
      platformDefaultKeybindings: { default: [{ key: 'Ctrl+W' }, { key: 'Ctrl+F4' }] }
    }
  },
  {
    id: 'closeWindow',
    title: 'Close',
    electron: {
      menuTitle: 'Close',
      defaultKeybindings: [{ key: 'CmdOrCtrl+W' }],
      platformDefaultKeybindings: { default: [{ key: 'Ctrl+W' }, { key: 'Ctrl+F4' }] }
    }
  },
  { id: 'newWindow', title: 'New Window', electron: { menuTitle: 'New Window' } },

  // ── 工作区与应用 ──
  {
    id: 'openFolder',
    title: 'Open Folder…',
    requiredAccess: 'codexOrWorkLocal',
    commandMenu: true,
    commandMenuGroupKey: 'workspace',
    electron: { menuTitle: 'Open Folder…', defaultKeybindings: [{ key: 'CmdOrCtrl+O' }] }
  },
  {
    id: 'settings',
    title: 'Settings…',
    commandMenu: true,
    commandMenuGroupKey: 'app',
    electron: { menuTitle: 'Settings…', defaultKeybindings: [{ key: 'CmdOrCtrl+,' }] }
  },
  {
    id: 'showKeyboardShortcuts',
    title: 'Keyboard Shortcuts',
    shortcutScope: 'app',
    availableIn: ['electron'],
    electron: { menuTitle: 'Keyboard Shortcuts', defaultKeybindings: [{ key: 'CmdOrCtrl+/' }] }
  },
  {
    id: 'logOut',
    title: 'Log Out',
    commandMenu: true,
    commandMenuGroupKey: 'app',
    electron: { menuTitle: 'Log Out' }
  },

  // ── 复制类 ──
  {
    id: 'copyConversationPath',
    requiredAccess: 'codexLocal',
    electron: {
      menuTitle: 'Copy conversation path',
      defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+Shift+C' }]
    }
  },
  {
    id: 'copyDeeplink',
    electron: { menuTitle: 'Copy deeplink', defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+L' }] }
  },
  {
    id: 'copySessionId',
    electron: { menuTitle: 'Copy session id', defaultKeybindings: [{ key: 'CmdOrCtrl+Alt+C' }] }
  },
  {
    id: 'copyWorkingDirectory',
    requiredAccess: 'codexLocal',
    electron: {
      menuTitle: 'Copy working directory',
      defaultKeybindings: [{ key: 'CmdOrCtrl+Shift+C' }]
    }
  },

  // ── 跳转到第 N 个会话 ──
  ...Array.from({ length: 9 }, (_, index) => {
    const n = index + 1
    return {
      id: `thread${n}`,
      title: `Go to Chat ${n}`,
      electron: {
        menuTitle: `Go to Chat ${n}`,
        defaultKeybindings: [{ key: `CmdOrCtrl+${n}` }]
      }
    } satisfies CommandDefinition
  })
]

const BY_ID = new Map(COMMAND_DEFINITIONS.map((def) => [def.id, def]))

export function findCommand(id: string): CommandDefinition | undefined {
  return BY_ID.get(id)
}
