/**
 * Codex 的 `Ae` —— 剥掉沙箱/shell 包装,留展示用命令。
 *
 * 服务端给的 `command` 可能是 `/bin/zsh -lc '…'` 或层层引号包起来的形态,
 * 那一串对读的人没有意义。这里逐层剥掉:引号归一、`zsh -lc` 包装拆掉。
 */
export function displayCommand(command: string): string {
  const unwrapQuotes = (s: string): string => {
    let t = s.trim()
    let changed = true
    while (changed) {
      changed = false
      if (t.startsWith(`$'`) && t.endsWith(`'`)) {
        t = t.slice(2, -1).replace(/\\'/g, `'`)
        changed = true
        continue
      }
      if ((t.startsWith(`'`) && t.endsWith(`'`)) || (t.startsWith(`"`) && t.endsWith(`"`))) {
        t = t.slice(1, -1).replace(/'"'"'/g, `'`).replace(/\\"/g, `"`)
        changed = true
      }
    }
    return t
  }
  const stripShell = (s: string): string => {
    let t = s.trim().replace(/^\$\s+/, '')
    t = t.replace(/'"'"'/g, `'`).replace(/\\'/g, `'`).replace(/\\"/g, `"`)
    let changed = true
    while (changed) {
      changed = false
      if ((t.startsWith(`'`) && t.endsWith(`'`)) || (t.startsWith(`"`) && t.endsWith(`"`))) {
        t = t.slice(1, -1).trim()
        changed = true
      }
    }
    return t
      .replace(/^['"]+/, '')
      .replace(/['"]+$/, '')
      .trim()
  }
  const cleaned = unwrapQuotes(stripShell(command))
  const match = /^(?:\/bin\/zsh|\/bin\/bash|zsh|bash)\s+-lc\s+([\s\S]+)$/.exec(cleaned)
  if (match) return stripShell(unwrapQuotes(match[1]?.trim() ?? ''))
  const loose = /(?:\/bin\/zsh|\/bin\/bash|zsh|bash)\s+-lc\s+([\s\S]+)$/.exec(command)
  return loose ? stripShell(unwrapQuotes(loose[1]?.trim() ?? '')) : cleaned
}
