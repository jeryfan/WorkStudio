import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

/**
 * 终端要起哪个 shell。
 *
 * 取证：Codex `$we`（getAvailableShells）/ `eTe`（命令行）/ `e82`（显示名）/
 * `hTe`（shellKind）。这里逐项照搬，包括几个看起来多余的分支 —— 它们都是
 * Windows 上真实存在的坑。
 */

export type TerminalShellPreference = 'powershell' | 'commandPrompt' | 'gitBash' | 'wsl'

/** Codex `hTe` 的返回值：决定 cwd 怎么换算 */
export type ShellKind = 'posix' | 'windows' | 'wsl'

/** Codex `Qwe`：git-bash 必须带这两个参数，否则不读用户的 profile */
const GIT_BASH_ARGS = ['--login', '-i'] as const

/** Codex `Zwe`：Windows 上恒定可用的两个 */
const ALWAYS_AVAILABLE_ON_WINDOWS: TerminalShellPreference[] = ['powershell', 'commandPrompt']

/** Codex `n.Gn()`：默认 shell */
export function defaultShellCommand(): string {
  const fromEnv = process.env.SHELL
  if (fromEnv != null && fromEnv.length > 0) return fromEnv
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh'
}

/** 在 PATH 里找一个可执行文件（Codex `bc`） */
function whichSync(executable: string): string | null {
  const raw = process.env.PATH ?? ''
  for (const entry of raw.split(delimiter)) {
    if (entry === '') continue
    const candidate = join(entry, executable)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Codex `t8`：pwsh 优先于内置 powershell */
function findPowerShell(): string | null {
  for (const name of ['pwsh.exe', 'powershell.exe']) {
    const found = whichSync(name)
    if (found != null) return found
  }
  return null
}

/** Codex `n8`：cmd 的路径来自 COMSPEC */
function findCommandPrompt(): string {
  const comspec = process.env.COMSPEC?.trim()
  return comspec != null && comspec.length > 0 ? comspec : 'cmd.exe'
}

/**
 * Codex `r8`：git-bash 的三段查找。
 * 直接找 `git-bash.exe` 常常找不到（它不在 PATH 里），所以退到 `git.exe`
 * 再从它的安装目录推 `bash.exe`。
 */
function findGitBash(): string | null {
  const direct = whichSync('git-bash.exe')
  if (direct != null) return direct
  const git = whichSync('git.exe')
  if (git != null) {
    const binDir = dirname(git)
    for (const candidate of [join(binDir, 'bash.exe'), join(dirname(binDir), 'bin', 'bash.exe')]) {
      if (existsSync(candidate)) return candidate
    }
  }
  const programFiles = process.env.ProgramFiles
  if (programFiles != null && programFiles !== '') {
    const candidate = join(programFiles, 'Git', 'bin', 'bash.exe')
    if (existsSync(candidate)) return candidate
  }
  return null
}

function findWsl(): string | null {
  return whichSync('wsl.exe')
}

/** Codex `$we` */
export function getAvailableShells(): TerminalShellPreference[] {
  if (process.platform !== 'win32') return []
  const shells = [...ALWAYS_AVAILABLE_ON_WINDOWS]
  if (findGitBash() != null) shells.push('gitBash')
  if (findWsl() != null) shells.push('wsl')
  return shells
}

/** Codex `eTe`：偏好 → 实际命令行（argv 数组） */
export function resolveTerminalCommand(preference: TerminalShellPreference | null): string[] {
  if (process.platform !== 'win32') return [defaultShellCommand()]
  if (preference === 'powershell') {
    const pwsh = findPowerShell()
    if (pwsh != null) return [pwsh]
  }
  if (preference === 'commandPrompt') return [findCommandPrompt()]
  if (preference === 'gitBash') {
    const bash = findGitBash()
    if (bash != null) return [bash, ...GIT_BASH_ARGS]
  }
  if (preference === 'wsl') {
    const wsl = findWsl()
    if (wsl != null) return [wsl]
  }
  // 兜底顺序也照搬：pwsh 优先，没有才回 cmd
  const fallback = findPowerShell()
  return fallback == null ? [findCommandPrompt()] : [fallback]
}

/** Codex `e82`：给渲染层显示的 shell 名 */
export function shellDisplayName(command: readonly string[]): string {
  const executable = command[0]
  if (executable == null || executable.length === 0) return 'Shell'
  const base = executable.split(/[/\\]/).at(-1)?.toLowerCase()
  if (process.platform === 'win32') {
    if (base === 'wsl' || base === 'wsl.exe') return 'wsl'
    if (base === 'pwsh' || base === 'pwsh.exe') return 'powershell'
    if (base === 'powershell' || base === 'powershell.exe') return 'powershell'
    if (base === 'cmd' || base === 'cmd.exe') return 'commandPrompt'
    if (base === 'git-bash.exe' || (base === 'bash.exe' && /[\\/]Git[\\/]/i.test(executable))) {
      return 'gitBash'
    }
  }
  const stripped = base?.replace(/\.exe$/i, '') ?? executable
  return stripped.length > 0 ? stripped : 'Shell'
}

/** Codex `hTe` */
export function shellKindOf(command: readonly string[]): ShellKind {
  if (process.platform !== 'win32') return 'posix'
  const base = command[0]?.split(/[/\\]/).at(-1)?.toLowerCase()
  if (base === 'wsl' || base === 'wsl.exe') return 'wsl'
  return 'windows'
}
