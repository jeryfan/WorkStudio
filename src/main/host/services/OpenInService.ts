import { BrowserWindow, dialog, nativeImage, shell } from 'electron'
import { RpcTarget } from 'capnweb'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type {
  OpenInRequest,
  OpenInService as OpenInContract,
  OpenInTarget
} from '@shared/host/appHost'

/**
 * Open in —— 探测已安装的编辑器/终端并代为打开文件。
 *
 * 取证：Codex 的 `openIn` 服务（`ohe`）方法是
 * `getTargets / detectTarget / loadTargetIcon / open / setGlobalPreferredTarget`。
 * 编辑器目录来自宿主（不在 webview bundle 里），图标也由宿主读盘后交给渲染层 ——
 * 所以这里的 `loadTargetIcon` 返回 data URL，而不是让渲染层自己打包一份图标。
 *
 * 行号跳转：编辑器 bundle 内的 CLI（code/cursor/zed/subl…）支持 `-g file:line:col`；
 * 找不到 CLI 就退化为 `open -a`（只打开文件，不跳行）。
 */

interface EditorSpec {
  target: string
  label: string
  appName: string
  kind: 'editor' | 'terminal'
  /** app bundle 内 CLI 相对路径（支持 -g 行号跳转） */
  cli?: string
}

const SPECS: EditorSpec[] = [
  {
    target: 'vscode',
    label: 'VS Code',
    appName: 'Visual Studio Code',
    kind: 'editor',
    cli: 'Contents/Resources/app/bin/code'
  },
  {
    target: 'vscode-insiders',
    label: 'VS Code Insiders',
    appName: 'Visual Studio Code - Insiders',
    kind: 'editor',
    cli: 'Contents/Resources/app/bin/code'
  },
  {
    target: 'cursor',
    label: 'Cursor',
    appName: 'Cursor',
    kind: 'editor',
    cli: 'Contents/Resources/app/bin/cursor'
  },
  { target: 'zed', label: 'Zed', appName: 'Zed', kind: 'editor', cli: 'Contents/MacOS/cli' },
  {
    target: 'sublime-text',
    label: 'Sublime Text',
    appName: 'Sublime Text',
    kind: 'editor',
    cli: 'Contents/SharedSupport/bin/subl'
  },
  {
    target: 'windsurf',
    label: 'Windsurf',
    appName: 'Windsurf',
    kind: 'editor',
    cli: 'Contents/Resources/app/bin/windsurf'
  },
  { target: 'webstorm', label: 'WebStorm', appName: 'WebStorm', kind: 'editor' },
  { target: 'intellij', label: 'IntelliJ IDEA', appName: 'IntelliJ IDEA', kind: 'editor' },
  { target: 'pycharm', label: 'PyCharm', appName: 'PyCharm', kind: 'editor' },
  { target: 'goland', label: 'GoLand', appName: 'GoLand', kind: 'editor' },
  { target: 'phpstorm', label: 'PhpStorm', appName: 'PhpStorm', kind: 'editor' },
  { target: 'rider', label: 'Rider', appName: 'Rider', kind: 'editor' },
  { target: 'rustrover', label: 'RustRover', appName: 'RustRover', kind: 'editor' },
  { target: 'android-studio', label: 'Android Studio', appName: 'Android Studio', kind: 'editor' },
  { target: 'antigravity', label: 'Antigravity', appName: 'Antigravity', kind: 'editor' },
  { target: 'xcode', label: 'Xcode', appName: 'Xcode', kind: 'editor' },
  { target: 'textmate', label: 'TextMate', appName: 'TextMate', kind: 'editor' },
  { target: 'bbedit', label: 'BBEdit', appName: 'BBEdit', kind: 'editor' },
  { target: 'emacs', label: 'Emacs', appName: 'Emacs', kind: 'editor' },
  { target: 'terminal', label: 'Terminal', appName: 'Terminal', kind: 'terminal' },
  { target: 'iterm2', label: 'iTerm2', appName: 'iTerm', kind: 'terminal' },
  { target: 'ghostty', label: 'Ghostty', appName: 'Ghostty', kind: 'terminal' },
  { target: 'kitty', label: 'kitty', appName: 'kitty', kind: 'terminal' },
  { target: 'warp', label: 'Warp', appName: 'Warp', kind: 'terminal' }
]

const APP_DIRS = ['/Applications', join(homedir(), 'Applications')]

function findAppPath(spec: EditorSpec): string | null {
  for (const dir of APP_DIRS) {
    const appPath = join(dir, `${spec.appName}.app`)
    if (existsSync(appPath)) return appPath
  }
  return null
}

export class OpenInService extends RpcTarget implements OpenInContract {
  private preferredTarget: string | null = null

  async getTargets(): Promise<OpenInTarget[]> {
    const found: OpenInTarget[] = []
    for (const spec of SPECS) {
      const appPath = findAppPath(spec)
      if (appPath != null) {
        found.push({ target: spec.target, label: spec.label, appPath, kind: spec.kind })
      }
    }
    return found
  }

  async detectTarget(target: string): Promise<OpenInTarget | null> {
    const spec = SPECS.find((candidate) => candidate.target === target)
    if (spec == null) return null
    const appPath = findAppPath(spec)
    return appPath == null
      ? null
      : { target: spec.target, label: spec.label, appPath, kind: spec.kind }
  }

  /** 从 .app bundle 里取图标转 data URL（渲染层不再打包编辑器图标） */
  async loadTargetIcon(target: string): Promise<string | null> {
    const found = await this.detectTarget(target)
    if (found == null) return null
    try {
      const icon = await nativeImage.createThumbnailFromPath(found.appPath, {
        width: 32,
        height: 32
      })
      return icon.isEmpty() ? null : icon.toDataURL()
    } catch {
      return null
    }
  }

  async setGlobalPreferredTarget(target: string | null): Promise<void> {
    this.preferredTarget = target
  }

  async open(request: OpenInRequest): Promise<void> {
    const { path, target, appPath, line, column } = request
    if (target === 'fileManager') {
      shell.showItemInFolder(path)
      return
    }
    if (target === 'systemDefault') {
      await shell.openPath(path)
      return
    }
    const spec = SPECS.find((candidate) => candidate.target === target)
    const base = appPath ?? (spec == null ? null : findAppPath(spec))
    if (base == null) return

    // 终端：打开文件所在目录（没有行号语义）
    if (spec?.kind === 'terminal') {
      detached('open', ['-a', base, dirname(path)])
      return
    }
    // 带行号时优先用 bundle 内 CLI（code 系的 -g file:line:col 协议）
    if (line != null && spec?.cli != null) {
      const cli = join(base, spec.cli)
      if (existsSync(cli)) {
        detached(cli, ['-g', column == null ? `${path}:${line}` : `${path}:${line}:${column}`])
        return
      }
    }
    detached('open', ['-a', base, path])
  }

  /** 当前偏好目标（渲染层的 split button 默认项） */
  getPreferredTarget(): string | null {
    return this.preferredTarget
  }
}

function detached(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.unref()
}

/** 另存为：系统保存对话框 + 复制（Codex `workspaceFiles.saveCopy`） */
export async function saveCopyWithDialog(
  absolutePath: string,
  suggestedName?: string
): Promise<boolean> {
  const window = BrowserWindow.getFocusedWindow()
  const options = {
    defaultPath: join(homedir(), 'Downloads', suggestedName ?? basename(absolutePath))
  }
  const result =
    window != null
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return false
  await copyFile(absolutePath, result.filePath)
  return true
}
