/// <reference types="vite/client" />

/** Electron <webview> 标签的 JSX 声明（BrowserTab 使用） */
declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
          src?: string
          partition?: string
          webpreferences?: string
          allowpopups?: string
        }
      }
    }
  }
}

export {}
