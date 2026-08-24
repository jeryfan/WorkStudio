/**
 * ANSI 转义序列 → 结构化 span —— 移植自 Codex bundle 里的 ansi-to-html 定制版
 * (`worktree-init-tool-activities-*.js` 的 `be` 模块,`ansiToJson(json:true,
 * remove_empty:true, use_classes:true)` 那一支)。
 *
 * 不用 npm 的 ansi-to-html@0.7 的原因:它的 `use_classes` 产出的类名与 Codex
 * bundle 的不一致(没有 `-fg`/`-bg` 后缀、调色板处理不同)—— Codex 跑的是
 * 一个更新/定制过的版本。这里按 bundle 逐行移植,输出与 Codex 完全一致:
 *
 * - 颜色类:`ansi-red-fg` / `ansi-bright-green-bg` / `ansi-palette-N-fg` /
 *   `ansi-truecolor-fg`(配 `data-ansi-truecolor-fg="r, g, b"`)
 * - 装饰:bold / dim / italic / underline / blink / hidden / strikethrough,
 *   由渲染层翻成行内样式(见 `decorationStyle`)
 * - `reverse` 不做成装饰:交换前后景色并标 `data-ansi-is-inverted`
 * - `\r` 覆盖语义(`resolveCarriageReturns`)与 `\b` 退格(`stripBackspaces`)
 *   在转换前先归一
 */

export interface AnsiChunk {
  content: string
  fg: string | null
  bg: string | null
  fgTruecolor: string | null
  bgTruecolor: string | null
  isInverted: boolean
  decorations: string[]
  wasProcessed: boolean
  isEmpty: boolean
}

const BASIC: { color: string; cls: string }[][] = [
  [
    { color: '0, 0, 0', cls: 'ansi-black' },
    { color: '187, 0, 0', cls: 'ansi-red' },
    { color: '0, 187, 0', cls: 'ansi-green' },
    { color: '187, 187, 0', cls: 'ansi-yellow' },
    { color: '0, 0, 187', cls: 'ansi-blue' },
    { color: '187, 0, 187', cls: 'ansi-magenta' },
    { color: '0, 187, 187', cls: 'ansi-cyan' },
    { color: '255,255,255', cls: 'ansi-white' }
  ],
  [
    { color: '85, 85, 85', cls: 'ansi-bright-black' },
    { color: '255, 85, 85', cls: 'ansi-bright-red' },
    { color: '0, 255, 0', cls: 'ansi-bright-green' },
    { color: '255, 255, 85', cls: 'ansi-bright-yellow' },
    { color: '85, 85, 255', cls: 'ansi-bright-blue' },
    { color: '255, 85, 255', cls: 'ansi-bright-magenta' },
    { color: '85, 255, 255', cls: 'ansi-bright-cyan' },
    { color: '255, 255, 255', cls: 'ansi-bright-white' }
  ]
]

/** `\r` 的行内覆盖语义:回车把后续文本盖到行首(\r\n 先归一成 \n) */
export function resolveCarriageReturns(text: string): string {
  if (!/\r/.test(text)) return text
  let result = text.replace(/\r+\n/gm, '\n')
  while (/\r./.test(result)) {
    result = result.replace(/^([^\r\n]*)\r+([^\r\n]+)/gm, (_m, before: string, after: string) => {
      return after + before.slice(after.length)
    })
  }
  return result
}

/** 退格字符:逐轮剥掉 `字符 + \b`(Codex 的 `Ee`) */
export function stripBackspaces(text: string): string {
  let current = text
  // eslint-disable-next-line no-control-regex -- 匹配的就是控制字符(退格),有意为之
  const re = /[^\n]\x08/g
  let next = current.replace(re, '')
  while (next.length < current.length) {
    current = next
    next = current.replace(re, '')
  }
  return current
}

class Parser {
  fg: string | null = null
  bg: string | null = null
  fgTruecolor: string | null = null
  bgTruecolor: string | null = null
  decorations: string[] = []

  removeDecoration(name: string): void {
    const i = this.decorations.indexOf(name)
    if (i >= 0) this.decorations.splice(i, 1)
  }

  processChunk(raw: string): AnsiChunk {
    const chunk: AnsiChunk = {
      content: raw,
      fg: null,
      bg: null,
      fgTruecolor: null,
      bgTruecolor: null,
      isInverted: false,
      decorations: [],
      wasProcessed: false,
      isEmpty: raw.length === 0
    }
    const m = /^([!<-\x3f]*)([\d;]*)([\x20-\x2c]*[\x40-\x7e])([\s\S]*)/m.exec(raw)
    if (!m) return chunk
    chunk.content = m[4]
    const codes = m[2].split(';')
    // 只有 SGR(结尾 m)才处理;其余控制序列内容原样保留
    if (m[1] !== '' || m[3] !== 'm') return chunk

    while (codes.length > 0) {
      const code = codes.shift() as string
      const n = parseInt(code, 10)
      if (isNaN(n) || n === 0) {
        this.fg = this.bg = null
        this.decorations = []
      } else if (n === 1) this.decorations.push('bold')
      else if (n === 2) this.decorations.push('dim')
      else if (n === 3) this.decorations.push('italic')
      else if (n === 4) this.decorations.push('underline')
      else if (n === 5) this.decorations.push('blink')
      else if (n === 7) this.decorations.push('reverse')
      else if (n === 8) this.decorations.push('hidden')
      else if (n === 9) this.decorations.push('strikethrough')
      else if (n === 21) this.removeDecoration('bold')
      else if (n === 22) {
        this.removeDecoration('bold')
        this.removeDecoration('dim')
      } else if (n === 23) this.removeDecoration('italic')
      else if (n === 24) this.removeDecoration('underline')
      else if (n === 25) this.removeDecoration('blink')
      else if (n === 27) this.removeDecoration('reverse')
      else if (n === 28) this.removeDecoration('hidden')
      else if (n === 29) this.removeDecoration('strikethrough')
      else if (n === 39) this.fg = null
      else if (n === 49) this.bg = null
      else if (n >= 30 && n < 38) this.fg = BASIC[0][n % 10].cls
      else if (n >= 90 && n < 98) this.fg = BASIC[1][n % 10].cls
      else if (n >= 40 && n < 48) this.bg = BASIC[0][n % 10].cls
      else if (n >= 100 && n < 108) this.bg = BASIC[1][n % 10].cls
      else if (n === 38 || n === 48) {
        const isFg = n === 38
        if (codes.length >= 1) {
          const mode = codes.shift() as string
          if (mode === '5' && codes.length >= 1) {
            const idx = parseInt(codes.shift() as string, 10)
            if (idx >= 0 && idx <= 255) {
              const cls = idx >= 16 ? `ansi-palette-${idx}` : BASIC[idx > 7 ? 1 : 0][idx % 8].cls
              if (isFg) this.fg = cls
              else this.bg = cls
            }
          } else if (mode === '2' && codes.length >= 3) {
            const r = parseInt(codes.shift() as string, 10)
            const g = parseInt(codes.shift() as string, 10)
            const b = parseInt(codes.shift() as string, 10)
            if ([r, g, b].every((v) => v >= 0 && v <= 255)) {
              const rgb = `${r}, ${g}, ${b}`
              if (isFg) {
                this.fg = 'ansi-truecolor'
                this.fgTruecolor = rgb
              } else {
                this.bg = 'ansi-truecolor'
                this.bgTruecolor = rgb
              }
            }
          }
        }
      }
    }

    if (this.fg === null && this.bg === null && this.decorations.length === 0) return chunk
    chunk.fg = this.fg
    chunk.bg = this.bg
    chunk.fgTruecolor = this.fgTruecolor
    chunk.bgTruecolor = this.bgTruecolor
    chunk.decorations = [...this.decorations]
    chunk.wasProcessed = true
    return chunk
  }
}

/**
 * 文本 → ANSI 块数组。`reverse` 装饰在这里被解析成前后景互换 + isInverted。
 * remove_empty:没有内容且没有样式的块丢掉(Codex 调用点带这个开关)。
 */
export function ansiToJson(text: string): AnsiChunk[] {
  const parser = new Parser()
  const parts = text.split('\x1b[')
  const first = parts.shift() ?? ''

  const head: AnsiChunk = {
    content: first,
    fg: null,
    bg: null,
    fgTruecolor: null,
    bgTruecolor: null,
    isInverted: false,
    decorations: [],
    wasProcessed: false,
    isEmpty: first.length === 0
  }
  const chunks = [head, ...parts.map((part) => parser.processChunk(part))]

  return chunks
    .map((chunk) => {
      // reverse:交换前后景,不保留为装饰
      const decorations = chunk.decorations.filter((d) => {
        if (d === 'reverse') {
          if (!chunk.fg) chunk.fg = BASIC[0][7].cls
          if (!chunk.bg) chunk.bg = BASIC[0][0].cls
          const fg = chunk.fg
          chunk.fg = chunk.bg
          chunk.bg = fg
          const fgTruecolor = chunk.fgTruecolor
          chunk.fgTruecolor = chunk.bgTruecolor
          chunk.bgTruecolor = fgTruecolor
          chunk.isInverted = true
          return false
        }
        return true
      })
      return { ...chunk, decorations }
    })
    .filter((chunk) => !(chunk.isEmpty && !chunk.wasProcessed))
}

/** Codex `Te`/`D` —— 装饰数组 → 行内样式 */
export function decorationStyle(decorations: string[]): React.CSSProperties | undefined {
  if (decorations.length === 0) return undefined
  const style: React.CSSProperties = {}
  const line: string[] = []
  if (decorations.includes('bold')) style.fontWeight = 'bold'
  if (decorations.includes('dim')) style.opacity = '0.5'
  if (decorations.includes('italic')) style.fontStyle = 'italic'
  if (decorations.includes('hidden')) style.visibility = 'hidden'
  if (decorations.includes('underline')) line.push('underline')
  if (decorations.includes('strikethrough')) line.push('line-through')
  if (line.length > 0) style.textDecorationLine = line.join(' ')
  return style
}

/** ANSI 块的类名(Codex `Te` 的 className 拼装) */
export function ansiClassName(chunk: AnsiChunk): string {
  return [chunk.fg != null && `${chunk.fg}-fg`, chunk.bg != null && `${chunk.bg}-bg`]
    .filter(Boolean)
    .join(' ')
}
