import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalEvent } from '@shared/host/appHost'
import { whenHostServicesReady } from '../../host/appHost'
import type { TerminalTabRenderProps } from './terminalTabDescriptor'
import { readTerminalTheme, subscribeThemeChange } from './terminalTheme'

/**
 * Terminal tab —— 接主进程的 `terminal` 服务（node-pty）。
 *
 * 取证：Codex 的终端面板是 xterm（asar 里有 `webview/assets/xterm-output-panel-*.js`），
 * pty 在主进程（`node_modules/node-pty` 也在 asar 里）。数据面是
 *   渲染层 → 宿主   `terminal.write(sessionId, data)`
 *   宿主 → 渲染层   `terminal.subscribe(cb)` 的 `data` / `attached` / `exit` / …
 *
 * 三条不能省的接线：
 *
 * 1. **先 subscribe 再 create**。`attached` 与首屏输出是在 create 里同步发出去的
 *    （宿主 `sendAttached` 紧跟 create），晚订阅就永远收不到那批。
 * 2. **按 conversationId attach 而不是 create**。切 tab / 关面板会卸载这个组件，
 *    但 pty 必须活着（可能正在跑构建）。回来时 `attach` 拿回同一个会话，宿主
 *    还会把回放缓冲重发一遍。
 * 3. **resize 要真的报上去**。pty 的 cols/rows 不跟着变的话，shell 按 80×24 换行，
 *    宽面板里看到的是提前折断的行。
 */
export function TerminalTab({ conversationId, cwd }: TerminalTabRenderProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = hostRef.current
    if (container == null) return

    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontSize: 12,
      /*
       * **不确定**：Codex 的终端字号/字体族没有取证，这里用等宽栈兜底。
       * 配色不是猜的 —— 见 terminalTheme.ts，全部取主题已有的
       * `--color-token-terminal-*`（xterm 自带的默认主题是黑底，与本项目的
       * 亮色主表面对不上）。
       */
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      theme: readTerminalTheme(container),
      allowProposedApi: true
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    fit.fit()

    let sessionId: string | null = null
    let disposed = false

    const unsubscribeService = { current: null as null | (() => void) }

    void whenHostServicesReady().then(async (services) => {
      if (disposed) return
      const onEvent = (event: TerminalEvent): void => {
        // 只认自己这个会话的事件：一个窗口可能同时开着多个终端 tab
        if (sessionId != null && event.sessionId !== sessionId) return
        switch (event.type) {
          case 'data':
            terminal.write(event.data)
            return
          case 'init-log':
            terminal.writeln(`\x1b[2m${event.log}\x1b[0m`)
            return
          case 'error':
            terminal.writeln(`\x1b[31m${event.message}\x1b[0m`)
            return
          case 'exit':
            terminal.writeln(
              `\x1b[2m[process exited${event.code == null ? '' : ` with code ${event.code}`}${
                event.signal == null ? '' : ` (${event.signal})`
              }]\x1b[0m`
            )
            return
          case 'attached':
            // cwd/shell 已经由宿主决定，这里不覆盖任何东西
            return
        }
      }
      // 1) 先订阅
      await services.terminal.subscribe(onEvent)
      unsubscribeService.current = () => void services.terminal.unsubscribe()
      if (disposed) return
      // 2) 再 attach（宿主找不到已有会话时会自己新建）
      const created = await services.terminal.attach({
        conversationId,
        cols: terminal.cols,
        rows: terminal.rows,
        ...(cwd == null ? {} : { cwd }),
        // 面板卸载不该杀掉 pty —— 见上面第 2 条
        preserveOnOwnerDestroy: true
      })
      if (disposed || created == null) return
      sessionId = created
      terminal.onData((data) => void services.terminal.write(created, data))
      terminal.onResize(({ cols, rows }) => void services.terminal.resize(created, cols, rows))
      await services.terminal.resize(created, terminal.cols, terminal.rows)
    })

    /*
     * 面板宽高由外部布局决定（拖分栏、开合侧栏都会变），必须观察容器而不是
     * 监听 window resize —— 后者拖分栏时根本不触发。
     */
    const observer = new ResizeObserver(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      fit.fit()
    })
    observer.observe(container)

    // 切明暗主题时重算配色（token 的计算值变了，xterm 不会自己知道）
    const unsubscribeTheme = subscribeThemeChange(() => {
      terminal.options.theme = readTerminalTheme(container)
    })

    return () => {
      disposed = true
      unsubscribeTheme()
      observer.disconnect()
      unsubscribeService.current?.()
      terminal.dispose()
      // 刻意不 close 会话：pty 要活过这个组件（见上面第 2 条）
    }
  }, [conversationId, cwd])

  return <div ref={hostRef} className="h-full min-h-0 w-full min-w-0 overflow-hidden" />
}
