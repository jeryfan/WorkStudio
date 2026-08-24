/**
 * 复制文本到剪贴板。
 *
 * `navigator.clipboard` 在文档失焦时会直接 reject（NotAllowedError），而复制
 * 按钮恰恰经常在失焦状态下被点——从别的窗口切回来，顺手就点了。只用它的话
 * 这一下会静默失败：没复制上，也没有任何提示。
 *
 * 失败时退回一次 execCommand。它已经废弃了，但不要求焦点，能救回绝大多数
 * 情况；两条路都不通才返回 false，由调用方决定不给"已复制"的反馈。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 继续走兜底
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/**
 * 复制富文本(text/plain + text/html)—— Codex 复制表格时的双格式
 *(`bV({"text/plain": markdownSource, "text/html": htmlText})`)。
 * ClipboardItem 不可用时退化成纯文本。
 */
export async function copyRichText(plain: string, html: string): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })
    ])
    return true
  } catch {
    return copyText(plain)
  }
}
