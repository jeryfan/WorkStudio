import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { existsSync, copyFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { homedir } from 'os'

/**
 * Open in —— 探测已安装的编辑器并代为打开文件(对齐 Codex 宿主的 openIn 能力:
 * 渲染层拿到 targets 列表 [{target, label, appPath, iconFile, kind}],
 * 选择后回调 open({path, target, appPath, line, column}))。
 *
 * Codex 的编辑器目录来自宿主(不在 webview bundle 里);已知目标的图标资源
 * 与 Codex 的 assets/apps 同名对齐(reverse/webview-dump/apps)。
 *
 * 行号跳转:编辑器 bundle 内的 CLI(code/cursor/zed/sublime…)支持
 * `-g file:line:col`;找不到 CLI 退化为 `open -a`(仅打开文件)。
 */

export interface OpenTarget {
  /** 稳定 id(Codex target 名,如 'vscode') */
  target: string
  label: string
  /** /Applications 下的 .app 绝对路径 */
  appPath: string
  /** 渲染层 assets/apps 里的图标文件名 */
  iconFile: string
  kind: 'editor'
}

interface EditorSpec {
  target: string
  label: string
  appName: string
  iconFile: string
  /** app bundle 内 CLI 相对路径(支持 -g 行号跳转) */
  cli?: string
}

/** Codex apps/ 目录里的编辑器(终端类不算 editor target) */
const EDITOR_SPECS: EditorSpec[] = [
  {
    target: 'vscode',
    label: 'VS Code',
    appName: 'Visual Studio Code',
    iconFile: 'vscode.png',
    cli: 'Contents/Resources/app/bin/code'
  },
  {
    target: 'vscode-insiders',
    label: 'VS Code Insiders',
    appName: 'Visual Studio Code - Insiders',
    iconFile: 'vscode-insiders.png',
    cli: 'Contents/Resources/app/bin/code'
  },
  {
    target: 'cursor',
    label: 'Cursor',
    appName: 'Cursor',
    iconFile: 'cursor.png',
    cli: 'Contents/Resources/app/bin/cursor'
  },
  { target: 'zed', label: 'Zed', appName: 'Zed', iconFile: 'zed.png', cli: 'Contents/MacOS/cli' },
  {
    target: 'sublime-text',
    label: 'Sublime Text',
    appName: 'Sublime Text',
    iconFile: 'sublime-text.png',
    cli: 'Contents/SharedSupport/bin/subl'
  },
  {
    target: 'windsurf',
    label: 'Windsurf',
    appName: 'Windsurf',
    iconFile: 'windsurf.png',
    cli: 'Contents/Resources/app/bin/windsurf'
  },
  { target: 'webstorm', label: 'WebStorm', appName: 'WebStorm', iconFile: 'webstorm.svg' },
  {
    target: 'intellij',
    label: 'IntelliJ IDEA',
    appName: 'IntelliJ IDEA',
    iconFile: 'intellij.png'
  },
  { target: 'pycharm', label: 'PyCharm', appName: 'PyCharm', iconFile: 'pycharm.png' },
  { target: 'goland', label: 'GoLand', appName: 'GoLand', iconFile: 'goland.png' },
  { target: 'phpstorm', label: 'PhpStorm', appName: 'PhpStorm', iconFile: 'phpstorm.png' },
  { target: 'rider', label: 'Rider', appName: 'Rider', iconFile: 'rider.png' },
  { target: 'rustrover', label: 'RustRover', appName: 'RustRover', iconFile: 'rustrover.png' },
  {
    target: 'android-studio',
    label: 'Android Studio',
    appName: 'Android Studio',
    iconFile: 'android-studio.png'
  },
  {
    target: 'antigravity',
    label: 'Antigravity',
    appName: 'Antigravity',
    iconFile: 'antigravity.png'
  },
  { target: 'xcode', label: 'Xcode', appName: 'Xcode', iconFile: 'xcode.png' },
  { target: 'textmate', label: 'TextMate', appName: 'TextMate', iconFile: 'textmate.png' },
  { target: 'bbedit', label: 'BBEdit', appName: 'BBEdit', iconFile: 'bbedit.png' },
  { target: 'emacs', label: 'Emacs', appName: 'Emacs', iconFile: 'emacs.png' }
]

/** 终端类目标(Codex 实测出现在 Open options 列表:Terminal/Ghostty) */
const TERMINAL_SPECS: EditorSpec[] = [
  { target: 'terminal', label: 'Terminal', appName: 'Terminal', iconFile: 'terminal.png' },
  { target: 'iterm2', label: 'iTerm2', appName: 'iTerm', iconFile: 'iterm2.png' },
  { target: 'ghostty', label: 'Ghostty', appName: 'Ghostty', iconFile: 'ghostty.png' },
  { target: 'kitty', label: 'kitty', appName: 'kitty', iconFile: 'kitty.png' },
  { target: 'warp', label: 'Warp', appName: 'Warp', iconFile: 'warp.png' }
]

function detectTargets(): OpenTarget[] {
  const dirs = ['/Applications', join(homedir(), 'Applications')]
  const found: OpenTarget[] = []
  for (const spec of [...EDITOR_SPECS, ...TERMINAL_SPECS]) {
    for (const dir of dirs) {
      const appPath = join(dir, `${spec.appName}.app`)
      if (existsSync(appPath)) {
        found.push({
          target: spec.target,
          label: spec.label,
          appPath,
          iconFile: spec.iconFile,
          kind: 'editor'
        })
        break
      }
    }
  }
  return found
}

interface OpenRequest {
  /** 绝对路径(主进程不信任渲染层的相对路径语义,直接用绝对路径) */
  path: string
  target: string
  appPath?: string
  line?: number
  column?: number
}

async function openPath(req: OpenRequest): Promise<void> {
  const { path: target, target: kind, appPath, line, column } = req
  if (kind === 'fileManager') {
    shell.showItemInFolder(target)
    return
  }
  if (kind === 'systemDefault') {
    await shell.openPath(target)
    return
  }
  const spec = [...EDITOR_SPECS, ...TERMINAL_SPECS].find((s) => s.target === kind)
  const base = appPath ?? (spec ? `/Applications/${spec.appName}.app` : undefined)
  if (!base) return
  // 终端:打开文件所在目录(无行号语义)
  if (TERMINAL_SPECS.includes(spec as EditorSpec)) {
    const child = spawn('open', ['-a', base, dirname(target)], { detached: true, stdio: 'ignore' })
    child.unref()
    return
  }
  // 带行号时优先用 app bundle 内 CLI(-g file:line:col,code 系协议)
  if (line != null && spec?.cli) {
    const cli = join(base, spec.cli)
    if (existsSync(cli)) {
      const arg = column != null ? `${target}:${line}:${column}` : `${target}:${line}`
      const child = spawn(cli, ['-g', arg], { detached: true, stdio: 'ignore' })
      child.unref()
      return
    }
  }
  const child = spawn('open', ['-a', base, target], { detached: true, stdio: 'ignore' })
  child.unref()
}

export function registerOpenInIpc(): void {
  ipcMain.handle('open-in:list-targets', () => detectTargets())
  ipcMain.handle('open-in:open', (_e, req: OpenRequest) => openPath(req))
  // Codex `Bm.workspaceFiles.saveCopy`:另存为(系统保存对话框 + 复制)
  ipcMain.handle('open-in:save-copy', async (_e, absolutePath: string, suggestedName?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const options = {
      defaultPath: join(homedir(), 'Downloads', suggestedName ?? basename(absolutePath))
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    copyFileSync(absolutePath, result.filePath)
    return true
  })
}
