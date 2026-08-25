import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 协议类型、宿主消息信封与命令表由主进程、preload、渲染进程三端共享，
// 三个构建目标都需要能解析 @shared。
const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        /*
         * 两个 main 产物：
         *   index      —— 主进程
         *   git.worker —— `worker_threads` 里跑的 git worker
         *
         * worker 必须是**同一次构建**产出的独立 chunk，与 index.js 同目录：
         * `new Worker(path)` 要的是磁盘上的真实文件，打包后没有 ts 源码可指。
         */
        input: {
          index: resolve('src/main/index.ts'),
          'git.worker': resolve('src/main/workers/git.worker.ts')
        }
      }
    }
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
