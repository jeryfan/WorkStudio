# Codex 侧栏规格(实测)

来源:对本机 `http://127.0.0.1:8214/` 运行中的 Codex 用 CDP 逐项测量。
工具:`scripts/cdp-eval.mjs`(读计算样式)、`scripts/cdp-mouse.mjs`(真实鼠标)、
`scripts/cdp-drag.mjs`(拖拽)、`scripts/cdp-screenshot.mjs`(截图)。

> **宽度类数值只在给定侧栏宽度下成立。** 高度、内边距、圆角、字号、颜色、
> 结构与类名与视口无关。下表标注了各值的采集条件。

## 尺寸约束

| 项 | 值 | 说明 |
|---|---|---|
| 侧栏默认宽 | 339.6px | 与视口无关,恒定 |
| 最小宽 | 240px | 指针 235 及以下锁死在 240 |
| 最大宽 | 520px | **固定值**,非视口百分比 |
| 折叠阈值 | 指针 ~100px | 240→140 是死区,防误触 |

## 层级结构

```
aside.app-shell-left-panel                    背景 editor-background 70% 半透明
                                              ::after 向右伸 --radius-2xl(20px)桥接主区圆角
└ div.max-w-full.overflow-hidden
  └ div.select-none.box-border.isolate.flex-col.[contain:layout_paint]
    └ div.relative.min-h-0.flex-1.overflow-hidden.[--height-token-mode-switch:32px]
      ├ nav.codex-Navigation
      │ ├ header  relative z-10 flex-col gap-2 px-row-x pb-(--sidebar-scroll-header-spacing)
      │ │ ├ 品牌行  ms-2 flex items-center pe-1                          316×32
      │ │ │ ├ 模式切换器 86×32  文字(font-openai-sans font-semibold 50×24)+ chevron 14×14
      │ │ │ └ Search 26×26     svg 16×16(icon-xs)
      │ │ └ 导航行  flex flex-col gap-1                                  仅 New chat
      │ └ 滚动区  vertical-scroll-fade-mask codex-headerFadeMask scrollbar-on-hover
      │           gap-4  pb=footer高+行内边距  [--height-token-row:30px] [--radius-token-row:10px]
      │           data-app-action-sidebar-scroll
      └ footer  absolute inset-x-0 bottom-0 z-20                        340×46
        顶部发丝线 absolute inset-x-0 top-0 z-10 h-[0.5px] 前景色 10%
        profile 行 284×29 + help 32×32
```

**关键:footer 是 nav 的兄弟,不是 aside 的子元素** —— 那层包装带
`overflow-hidden` 和 `[contain:layout_paint]`,footer 的裁剪归它管。

## 间距(实测相邻行间隙)

```
品牌行 → New chat        8px
New chat → Pull requests 1px
行与行之间               1px      ← 首节是四层嵌套,有效间距来自最内层 gap-px
分节之间                16px
```

首节嵌套(每层只有一个子元素,外层 gap 不显现):
`gap-2` → `px-row-x` → `gap-1` → `gap-px`(三行在这里)

## 行规格

| | 项目行 | 会话行 |
|---|---|---|
| 标签 | `<div>` | `<div>` |
| 高度 | `var(--height-token-row)` = 30 | 同 |
| 字号 | 13px | 13px |
| 圆角 | 12.5px + `corner-shape: superellipse(1.5)` | 同 |
| 命名 group | `/folder-row` | 匿名 `group` |
| data 属性 | project-row/-id/-label/-collapsed | thread-row/-id/-title/-kind/-active/-pinned/-selected |
| 子元素 | 内容区 + 操作区 `max-w-[50%]` + `button.sr-only` | `div.contents` + [状态槽] + 内容行 |

**会话行标题是跑马灯**,四层:
`codex-viewport` → `codex-clipViewport` → `codex-track` → `_content_19mhu_28`
- `viewport`:`white-space:nowrap; width:100%` + 四个 marquee 变量
- `clipViewport`:`width: calc(100% + var(--marquee-left-fade))` + 负 margin-left + `overflow:hidden`
- `track`:`min-width: max-content; display: inline-flex`
hover 时滚动,`stopAtEnd` 滚完停住,右侧有 `marqueeTextFadeRightMask` 渐隐。

**行内不显示时间** —— 时间移到了悬浮面板里。

**状态槽**(仅非空闲行):`absolute end-0 top-0 z-10 min-w-[52px] group-hover:hidden`
→ span 20×20 → div `size-5 text-token-description-foreground` → `span.icon-xs.scale-50` 8×8
→ `span.absolute.inset-0.rounded-full` 内联 `background-color: var(--vscode-textLink-foreground)`
**静态圆点,无动画。**

## 浮层层级

| | 圆角 | 模糊 | 尺寸 |
|---|---|---|---|
| 菜单 | 15px | blur(8px) | profile 菜单 324×103,项目菜单 214×179 |
| 项目悬浮面板 | 15px | blur(8px) | 320 固定 |
| 会话悬浮面板 | 15px | blur(8px) | `w-fit min-w-56 max-w-[min(20rem,calc(100vw-16px))]` |
| 弹窗 | **25px** | **blur(24px)** | 520×309 |

共同点:底色 `token-dropdown-background/90`、**无 border**(边缘只靠 box-shadow 0.5px ring)。
遮罩 `rgba(0,0,0,0.133)`,**不带 backdrop-filter**。

## 交互

**内联改名**(项目名 / 会话标题):
输入框 `h-6 rounded-md border-token-focus-border bg-token-input-background px-1.5 text-base font-medium leading-6 outline-none`
自动聚焦 + **全选**。Enter / 失焦 / Escape **三条路径都关闭整个面板** —— 面板是 hover 打开的瞬时容器。

**悬浮延时**:250ms 开 / 200ms 关(关闭延迟是为了让鼠标能滑进面板)。

**拖拽排序**:dnd-kit。DragOverlay 模式 —— 被拖行留在原地,克隆体渲染在
`div.pointer-events-none.fixed.z-[60]` 全屏层里,靠 translateY 跟随。
副本是**整组**(项目 + 其下会话),不是单行。id 格式 `codex:project:<uuid>`。
`aria-live` 播报 `Draggable item <id>`。

## 菜单内容

**Project actions**(214×179,6 项各 206×29 @13px,无分隔线):
`Unpin project` / `Reveal in Finder` / `Create permanent worktree` /
`Edit project` / `Archive chats` / `Remove`

**profile 菜单**(324×103,3 项各 316×29):账户名 / 分隔线 / `Show pet` / `Settings ⌘,`

## 术语

**不是全局统一用 task**:
- 面向用户的动作文案用 **chat**:`Pin chat`、`Archive chat`、`Start new chat in X`、`Chat sidebar options`
- 计数与内部模型用 **task**:`4 tasks`、`localTaskRow`

## 待测

- `data-app-action-sidebar-project-show-all` 的折叠阈值与展开机制
- 会话行状态点在**待审批 / 报错**下的样式(需 MutationObserver 录制完整任务周期)
