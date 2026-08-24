/**
 * 推理标题提取 —— Codex `reasoning-item-heading-pM5srCoy.js` 的 `c()`
 *(`extractLastHeading`)。
 *
 * 它服务的是**轮次级状态行**:turn 还在跑、手边没有正在执行的工具时,
 * 状态行不显示干巴巴的 "Thinking",而显示最新一段推理的最后一行
 * ("正在核对求值规则…" 这种)。Codex 从尾部往前找第一条
 * 「非空、非注释」的行,剥掉 markdown 标记后当标题。
 *
 * 与 `entryToContent.ts` 旧的 `reasoningTitle` 不是一回事:那个取开头的
 * 加粗小标题,给已删除的推理折叠块当表头;这个取**末尾**的一行,
 * 流式期间跟着推理的进展走。两者服务的表面不同,Codex 里也是两个函数。
 *
 * Codex 用 markdown AST 判定"整行只有一个 strong"并剥标记;这里没有解析器,
 * 用等价的正则完成同样两件事(整行加粗判定、行内标记剥除)。
 */

/** Codex 的 `l()` —— 该行是否只由 `<!-- -->` 注释组成(含没闭合的半截注释) */
function isCommentOnly(line: string): boolean {
  let rest = line
  while (rest.startsWith('<!--')) {
    const end = rest.indexOf('-->')
    if (end === -1) return true
    rest = rest.slice(end + 3).trimStart()
  }
  return !rest || '<!--'.startsWith(rest)
}

/** 行内 markdown → 纯文本(尽力而为,覆盖推理正文里实际出现的构造) */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .trim()
}

/**
 * 从一段推理文本里提取状态行标题;取不到返回 null。
 *
 * 整行只有一个加粗(`**…**`)时剥开递归 ——  Codex 里那个分支处理的是
 * 模型把"标题"写在最后一行的情形。
 */
export function extractLastHeading(text: string): string | null {
  const lines = text.trimEnd().split(/\r?\n/)
  let last: string | null = null
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim()
    if (line && !isCommentOnly(line)) {
      last = line
      break
    }
  }
  if (last == null) return null
  const bold = /^\*\*([^*]+)\*\*$/.exec(last)
  if (bold) {
    const inner = bold[1].trim()
    return extractLastHeading(inner) ?? (inner || null)
  }
  return stripInlineMarkdown(last) || null
}
