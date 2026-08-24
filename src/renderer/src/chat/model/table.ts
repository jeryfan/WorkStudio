/**
 * 表格的序列化 —— Codex 复制表格时的双格式(`bV({text/plain, text/html})`)。
 * text/plain 是 markdown 源文,text/html 是独立的 `<table>`。
 */

/** 表格的 markdown 源文 */
export function toMarkdownTable(head: string[], rows: string[][]): string {
  const line = (cells: string[]): string => `| ${cells.join(' | ')} |`
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n')
}

/** 表格的独立 HTML */
export function buildTableHtml(head: string[], rows: string[][]): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const th = head.map((c) => `<th>${esc(c)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
}
