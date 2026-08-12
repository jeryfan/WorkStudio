import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 协议类型与 RPC 传输层由主进程、preload、渲染进程三端共享，
// 三个构建目标都需要能解析 @shared。
const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias }
  },
  preload: {
    resolve: { alias: sharedAlias }
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
