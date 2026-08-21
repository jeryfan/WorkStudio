/**
 * 平台检测：主进程在 macOS 使用 hiddenInset（红绿灯按钮悬浮在左上角，
 * trafficLightPosition { x: 13, y: 15 }），AppShellHeader 需要让位。
 */
export const isMacOS: boolean = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)

/**
 * 红绿灯安全区 —— Codex 实测值。
 *
 * Codex 把它以 `--spacing-token-safe-header-left` 内联写在应用根节点上,
 * header 的两个槽再用 `ps-[max(var(--spacing-token-safe-header-left),0.5rem)]` 消费。
 * macOS + native chrome 下实测 **88px**(之前这里按几何估的 80px 少了 8px);
 * 非 macOS 为 0,由 max() 落到 0.5rem。
 */
export const SAFE_HEADER_LEFT = isMacOS ? 88 : 0
/** 右侧安全区:Codex 实测恒为 0(Windows 的窗口控件走另一套 data 属性) */
export const SAFE_HEADER_RIGHT = 0
