import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { themeClassName, THEME_VARIANTS, type ThemeVariant } from './themes'
import { setTheme as publishTheme } from './themeStore'
import { ThemeContext, type ThemeValue } from './themeContext'
import { isMacOS } from '../../utils/platform'

/**
 * 主题 —— 对齐 Codex。
 *
 * Codex 的做法:订阅宿主上报的系统外观(electronBridge.subscribeToSystemThemeVariant),
 * 在 <html> 上切 electron-light / electron-dark。这里复刻同一套。
 *
 * **注意这条链的上游有用户选择。** Codex 有应用内主题选择器(设置项
 * `appearanceTheme`,三档 system/light/dark,落盘在 app-server config 的
 * `[desktop]` 表),但它作用在**主进程**:主进程把该值写进
 * `nativeTheme.themeSource`,Electron 据此算出 shouldUseDarkColors,再经
 * `system-theme-variant-updated` 广播下来。所以这一层拿到的始终只是
 * 明/暗两态,既不需要读设置,也不该在这里再判一次 —— 渲染层若自持一份
 * 「当前选的是哪档」,就会和 config 里的真值形成两份状态。
 * 也不读 localStorage:真值在 config 里,agent 也能读写它。
 *
 * 语义 token 的落地方式有一处**有意的差异**:Codex 是用 JS 把 60 多个已解析的
 * --color-* 内联注入 <html>(它的颜色引擎在运行时从四个种子推导)。WorkStudio
 * 直接把两套实测值写成 CSS(assets/codex/runtime-{light,dark}.css,选择器就是
 * .electron-light / .electron-dark),结果等价但不需要在启动路径上跑一遍颜色计算,
 * 也不会有首帧无样式的窗口。种子值变了就重新捕获一次。
 *
 * Monaco 是唯一不吃 CSS 变量的消费者(它有自己的主题注册表),所以这里把外观名
 * 再发一份到 themeStore,由 Monaco 自己订阅 —— 这个方向不能反,反过来会把整个
 * Monaco 拖进应用启动路径。
 */

/** 宿主环境标记 —— Codex 在 <html> 上挂的同一组属性,平台 variant 与 CSS 都依赖它们 */
function applyHostAttributes(): void {
  const html = document.documentElement
  html.lang = 'en-US'
  html.dir = 'ltr'
  html.dataset.codexWindowType = 'electron'
  html.dataset.windowType = 'electron'
  html.dataset.codexOs = isMacOS
    ? 'darwin'
    : navigator.platform.toLowerCase().includes('win')
      ? 'win32'
      : 'linux'
  // 无边框窗口 + 系统红绿灯,与 Codex 在 macOS 上的取值一致
  html.dataset.codexWindowChrome = 'native'
  // Codex 的 body 是可聚焦的 —— 全局快捷键挂在它上面,所以要连 outline 一起关掉
  document.body.tabIndex = 0
  document.body.style.outline = 'none'
}

/**
 * 字号标度 —— Codex 把它**内联**写在 <html> 和 <body> 上,这里照做。
 *
 * 为什么必须内联而不能塞进 CSS:Codex 的 `… body` 层里有
 * `--text-heading-md: 18px`,而应用实际用的是 20px —— 差异正是靠内联压掉的
 * (内联优先级高于任何选择器)。把标度放进 CSS 就没法复现这个覆盖方向。
 *
 * 两处的键**不完全一样**:body 少一个 --vscode-editor-font-size,
 * 所以 body 上该变量会落回 `… body` 层的 var(--text-sm)=13px,而 <html> 是 12px。
 * 这不是笔误,是 Codex 的实测形态。
 *
 * 注意这里只搬字号,不搬那 50 个 --color-* —— 颜色仍走 runtime-{light,dark}.css
 * (见上方注释),避免把颜色推导拖进启动路径。
 */
const FONT_SCALE: ReadonlyArray<readonly [string, string]> = [
  ['--vscode-font-size', '14px'],
  ['--text-4xl', '72px'],
  ['--text-3xl', '48px'],
  ['--text-2xl', '36px'],
  ['--text-xl', '28px'],
  ['--text-lg', '16px'],
  ['--text-base', '14px'],
  ['--text-sm', '13px'],
  ['--text-xs', '12px'],
  ['--text-heading-lg', '24px'],
  ['--text-heading-md', '20px'],
  ['--text-heading-sm', '18px']
]

function applyFontScale(): void {
  const html = document.documentElement
  html.style.setProperty('--vscode-editor-font-size', '12px')
  for (const el of [html, document.body]) {
    for (const [k, v] of FONT_SCALE) el.style.setProperty(k, v)
    el.style.setProperty('-webkit-font-smoothing', 'antialiased')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // 首帧不能等 IPC 往返,否则会闪一下错误配色。先按系统媒体查询猜一个,
  // 宿主上报到了再纠正 —— 两者不一致的窗口极窄,肉眼看不到。
  const [variant, setVariant] = useState<ThemeVariant>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )

  useEffect(() => {
    applyHostAttributes()
    applyFontScale()
  }, [])

  useEffect(() => {
    const bridge = window.electronBridge
    if (!bridge) return

    let disposed = false
    const accept = (next: unknown): void => {
      if (disposed) return
      if (THEME_VARIANTS.includes(next as ThemeVariant)) setVariant(next as ThemeVariant)
    }

    // 首屏值是同步的（preload 阶段已用 sendSync 取好），不产生一帧错色
    accept(bridge.getSystemThemeVariant())
    const unsubscribe = bridge.subscribeToSystemThemeVariant(accept)

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const html = document.documentElement
    // 两个 electron-* 类互斥,切换时必须先摘掉另一个
    for (const v of THEME_VARIANTS) html.classList.toggle(themeClassName(v), v === variant)
    // color-scheme 决定原生滚动条、表单控件和 canvas 默认色
    html.style.colorScheme = variant
    publishTheme(variant)
  }, [variant])

  const value = useMemo<ThemeValue>(() => ({ variant }), [variant])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
