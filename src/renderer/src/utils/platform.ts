/**
 * 平台检测：主进程在 macOS 使用 hiddenInset（红绿灯按钮悬浮在左上角，
 * trafficLightPosition { x: 13, y: 15 }），TopBar 需要让位。
 */
export const isMacOS: boolean = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)

/** macOS 红绿灯占用宽度：x=13 + 3×16 + 2×8 ≈ 77px，取 80px 留余量 */
export const TRAFFIC_LIGHT_INSET = 80
