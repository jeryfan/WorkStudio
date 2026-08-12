/**
 * 补丁文本 → 两侧文本。
 *
 * 为什么需要它：协议的 `FileUpdateChange.diff` 给的是补丁，而 Monaco 的
 * DiffEditor 要的是改动前后两个完整模型。上游 VSCode 不用做这一步——它把编辑
 * 应用在真实的文件模型上，两侧都是现成的。
 *
 * **这个模块对补丁的具体方言不做假设。** 目前只确认了字段名与类型，没能拿到
 * 线上真实样本核对格式（本机的历史会话里没有文件编辑记录）。所以：
 *
 *   能识别出 hunk  → 还原两侧，交给 DiffEditor（有语法高亮、能左右对照）
 *   识别不出       → 返回 null，调用方退回"按 diff 语法高亮原样显示补丁"
 *
 * 后一条永远是对的，所以格式猜错的最坏结果是少一层体验，不是显示错误内容。
 */

export interface ParsedDiff {
  original: string
  modified: string
  added: number
  removed: number
}

/** 统一 diff 的 hunk 头：`@@ -1,4 +1,6 @@` */
const HUNK_HEADER = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/

/**
 * 解析补丁。
 *
 * 多个 hunk 之间**不补空缺**：还原出来的两侧是各 hunk 依次拼接的结果，
 * 中间跳过的原文不出现。行号因此对不上真实文件——这是有意的取舍，因为我们
 * 本来就拿不到完整原文。DiffEditor 关掉行号即可（见 FileEditToolPart）。
 */
export function parseDiff(diff: string): ParsedDiff | null {
  const lines = diff.split('\n')
  const original: string[] = []
  const modified: string[] = []
  let added = 0
  let removed = 0
  let inHunk = false

  for (const line of lines) {
    if (HUNK_HEADER.test(line)) {
      inHunk = true
      continue
    }
    if (!inHunk) {
      // hunk 之前是文件头（`--- a/x`、`+++ b/x`、`*** Update File: x`），跳过
      continue
    }

    // 空行在补丁里表示一行未改动的空行
    if (line === '') {
      original.push('')
      modified.push('')
      continue
    }

    const marker = line[0]
    const text = line.slice(1)
    switch (marker) {
      case '+':
        modified.push(text)
        added++
        break
      case '-':
        original.push(text)
        removed++
        break
      case ' ':
        original.push(text)
        modified.push(text)
        break
      case '\\':
        // `\ No newline at end of file`
        break
      default:
        // 不认识的行意味着这不是我们能处理的方言，整体放弃而不是猜
        return null
    }
  }

  if (!inHunk) return null
  if (added === 0 && removed === 0) return null

  return { original: original.join('\n'), modified: modified.join('\n'), added, removed }
}

/**
 * 增删行数。
 *
 * 单独一个函数是因为它比还原两侧宽容得多：即使方言不认识、还原不出来，
 * 数一数 `+` / `-` 开头的行仍然是对的，标题上的 `+12 −3` 不该因此消失。
 */
export function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++
    else if (line.startsWith('-') && !line.startsWith('---')) removed++
  }
  return { added, removed }
}
