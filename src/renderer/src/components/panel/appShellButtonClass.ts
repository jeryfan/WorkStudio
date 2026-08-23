/**
 * Codex 的共享按钮基类 —— header 按钮 / Expand panel / 「+」/ browser 工具栏按钮
 * 实测全是这一个类串(bundle 设计系统的 Button,color=ghost + size=toolbar + uniform)。
 * 关闭按钮等变体在其上追加自己的类(rounded-md、尺寸、显隐规则)。
 */
export const APP_SHELL_BUTTON_CLASS =
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-lg text-token-text-tertiary enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px] aspect-square shrink-0 items-center justify-center !px-0'

/**
 * color=secondary 变体(实测:Expand panel 按钮在 full-width 态就切这个)——
 * 基类的 `text-token-text-tertiary enabled:hover:bg-token-list-hover-background
 * data-[state=open]:bg-token-list-hover-background` 换成
 * `text-token-foreground bg-token-foreground/5 enabled:hover:bg-token-foreground/10
 * data-[state=open]:bg-token-foreground/10`。
 */
export const APP_SHELL_BUTTON_SECONDARY_CLASS =
  'no-drag cursor-interaction items-center gap-1 border whitespace-nowrap select-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex rounded-lg text-token-foreground bg-token-foreground/5 enabled:hover:bg-token-foreground/10 data-[state=open]:bg-token-foreground/10 border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px] aspect-square shrink-0 items-center justify-center !px-0'
