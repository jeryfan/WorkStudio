import type { ElectronBridge } from './index'

declare global {
  interface Window {
    /** Codex 用它区分 Electron 宿主与 web/iframe 宿主 */
    codexWindowType: 'electron'
    /** 宿主桥；非 Electron 宿主下为 undefined，调用方必须判空 */
    electronBridge?: ElectronBridge
  }
}

export {}
