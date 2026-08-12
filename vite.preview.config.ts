import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 临时预览用：在浏览器里核对对话区视觉，不参与 electron 构建 */
export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react(), tailwindcss()],
  server: { port: 5199 }
})
