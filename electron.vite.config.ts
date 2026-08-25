import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 协议类型、宿主消息信封与命令表由主进程、preload、渲染进程三端共享，
// 三个构建目标都需要能解析 @shared。
const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias }
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        /*
         * 两个 preload：
         *   index       —— 应用窗口的宿主桥（electronBridge）
         *   browserPage —— 内置浏览器 <webview> 页面内的 preload。
         *
         * 后者必须是独立产物：它跑在 sandbox:true 的页面里，由主进程在
         * will-attach-webview 时按绝对路径注入，不能和应用窗口的 preload 共用
         * 一个文件（那个文件暴露 electronBridge，注进网页等于把宿主能力交给页面）。
         */
        input: {
          index: resolve('src/preload/index.ts'),
          browserPage: resolve('src/preload/browserPage.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        ...sharedAlias
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
