import { useEffect } from 'react'
import {
  subscribeCaptureSurfaceRequests,
  useBrowserSurfaces,
  type BrowserSurface
} from '../../host/browserSurfaces'
import { TAB_PREVIEW_PIN_EXEMPT } from './AppShellTabPanel'

/**
 * 内置浏览器的 webview 持久层 —— 全程挂载一次，webview 住在这里。
 *
 * 摆放规则（见 host/browserSurfaces.ts 的说明）：
 *   有锚点   → 盖到锚点矩形上，用户看到的就是"webview 在面板里"
 *   没有锚点 → 停到视口内 1×1 的 `opacity:0` 位置
 *
 * 为什么"没有锚点"也要留在视口内而不是 `display:none`：
 *   1. `display:none` 会让 guest 失去合成表面，CDP 截图与 screencast 都拿不到帧；
 *   2. 从 DOM 摘掉 webview 会直接销毁 guest —— 而页面必须活过面板。
 * 停靠位置放在左上角 1×1、`pointer-events:none`、`opacity:0`，既不挡交互也不可见。
 */
const PARKED_STYLE: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
  zIndex: -1
}

function styleFor(surface: BrowserSurface): React.CSSProperties {
  const rect = surface.rect
  if (rect == null) return PARKED_STYLE
  return {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: 0
  }
}

export function BrowserSurfaceLayer(): React.JSX.Element {
  const surfaces = useBrowserSurfaces()

  // 宿主要求捕获表面时把停靠位保住（这里只需要订阅，摆放逻辑在 styleFor）
  useEffect(() => subscribeCaptureSurfaceRequests(), [])

  return (
    <>
      {/* 只渲染已登记的页面：未登记就 attach 会被宿主拒掉（见 browserSurfaces.ts） */}
      {surfaces
        .filter((surface) => surface.registered)
        .map((surface) => (
          <div
            key={`${surface.conversationId}::${surface.browserTabId}`}
            data-browser-surface="true"
            data-browser-surface-conversation={surface.conversationId}
            data-browser-surface-tab={surface.browserTabId}
            style={styleFor(surface)}
          >
            {/*
            src 固定 about:blank，**不是**目标地址。
            两件事都需要它：
              1. `<webview>` 没有 src 根本不会 attach（guest 是 attach 时才创建的），
                 所以必须给一个；
              2. 目标地址由宿主在 attach 后自己 loadURL（宿主会在
                 will-attach 里把 params.src 清掉），"谁在导航"只有一个答案。
          */}
            <webview
              src="about:blank"
              className="h-full w-full"
              {...{ [TAB_PREVIEW_PIN_EXEMPT]: 'true' }}
            />
          </div>
        ))}
    </>
  )
}
