# Codex 对齐审计(2026-08-21 实测)

**方法**:双端同时挂 CDP 逐项比对,不靠读压缩源码猜。

| 端 | 入口 | CDP |
|---|---|---|
| Codex | `http://127.0.0.1:8214/`(headless Chrome) | 9250 |
| WorkStudio | dev 渲染进程 | 9333 |

比对维度:归一化 DOM 子树(类名排序 + data 属性)、计算样式、CSS 变量继承链、全站类名词表 diff。
工具在 `/tmp/cmp/`(`ev.mjs` 通用求值、`sub.sh` 按选择器取子树)。

> **采集条件**:Codex 侧栏 267.7px / 视口 1512×895,WS 侧栏 340px / 视口 1200×800。
> **宽度类数字不可直接比**;高度、内边距、圆角、字号、颜色、结构、类名与视口无关。
> 两端 `<html>` 都标 `data-codex-window-type="electron"`,`electron:` / `browser:` 变体可比。

---

## 一、已正确对齐(有实测证据)

1. **Token 层** — 13 个关键变量逐一相同:`--color-token-{foreground,border,text-tertiary,description-foreground,
   main-surface-primary,list-hover-background,input-placeholder-foreground,dropdown-background}`、
   `--height-toolbar: 46px`、`--color-accent-orange: #e25507`。
2. **字体系统** — 全等:body `-apple-system…` 16px/24px **weight 445**、行 13px/**18.5714px**、
   `.font-openai-sans` 17px/24px weight 600;`OpenAI Sans` 已加载;
   `--font-sans` / `--font-openai-sans` / `--default-font-family` 三个变量值完全一致。
3. **行几何** — `.sidebar-item` 圆角 **12.5px + `corner-shape: superellipse(1.5)`**、高 30px、
   `padding-inline` 8px、字号 13px:全等。
4. **侧栏滚动区** — 类集合全等(含 `[--height-token-row:30px]` `[--radius-token-row:10px]`
   `[contain:layout_paint]`、`scroll-pb-[calc(var(--sidebar-footer-height)+var(--padding-row-x))]`、
   `-mt-[var(--sidebar-scroll-header-spacing,8px)]` / `pt-[var(--sidebar-scroll-content-top-padding,…)]` 组合)。
5. **跑马灯标题** — 四层结构逐字节一致,连保留哈希 `_content_19mhu_28` 和
   `data-marquee-text` / `data-thread-title` / `draggable="false"` 都对。**这是全项目最干净的一块。**
6. **侧栏分节骨架** — `section[data-app-action-sidebar-section][-collapsed][-heading]`、
   `group/nav-section-title`、`group/section-toggle`、`sidebar-hover-icon-tint` 一致。
7. **项目行主体** — `group/folder-row`、操作区 `max-w-[50%]`、`button.sr-only[data-app-action-sidebar-select-project]`、
   `data-sidebar-project-drop-zone="project-icon"`、左侧 32px 落区遮罩:一致。
8. **会话行主体** — `data-[app-action-sidebar-thread-selected=true]:bg-token-list-hover-background`、
   `ps-[var(--padding-row-cell-x,var(--padding-row-x))]`、`pe-row-y`、
   `div.contents[data-hover-card-open-immediately]`、状态槽 span 层级:一致。
9. **footer 定位** — 是 nav 的绝对定位兄弟 `div.absolute.bottom-0.inset-x-0.z-20`,发丝线 0.5px / top-0 / z-10:位置对。
10. **图标路径** — 大量 `d=` 与 Codex 完全相同,提取管线可信。
11. `--sidebar-footer-height: 46px`、`<html>` 的 `data-codex-window-type/os/window-chrome` + `electron-light`:一致。

---

## 二、偏离清单

### A 架构级(会持续渗漏视觉差异)

**A1 主区域壳层缺三层 CSS Module + 全部 data 属性**

```
Codex: main._MainContentSurface[data-app-shell-main-surface]
       ├ div.pointer-events-none.absolute.inset-y-0.start-0
       ├ header …(在 main 内)
       └ div.relative.isolate.flex.min-h-0.flex-1.overflow-hidden
         └ _MainContentViewport[data-app-shell-main-content-layout][data-app-shell-right-panel-full-width]
           └ _MainContentFrame[data-app-shell-thread-edge-divider]
             └ div.relative.flex.min-h-0.flex-1
               ├ _MainContentTopFade[data-app-shell-main-content-top-fade]
               └ div.h-full.min-h-0.min-w-0.flex-1
                 └ div.flex.h-full.flex-col[data-vscode-context][tabindex=0]
WS:    main.codex-MainContentSurface > div.flex.h-full.min-h-0.flex-col.pt-11 > 直接内容
```
Viewport / Frame / TopFade 三层全缺 → 顶部渐隐、右面板全宽、thread 边缘分隔线三套状态无处挂。

**A2 react-resizable-panels 渗漏** — `[data-panel]` WS 6 个 / Codex 0 个;`[role=separator]` 3 / 1。

- Codex:aside 内联 `style="padding-top: var(--height-toolbar); width: 267.713px;"`,
  宽度源 `--codex-sidebar-preferred-width`;resize 手柄在 **aside 内部**:
  `div.-top-toolbar.absolute.right-0.bottom-0.w-4.translate-x-2.z-20.group.cursor-col-resize[role=separator]`
  → 内含 `div.sidebar-resize-handle-line.w-px.h-full.m-auto.opacity-0.group-hover:opacity-100.bg-gradient-to-b.from-transparent.via-token-foreground/25.to-transparent`。
- WS:panel 库的兄弟 separator,`w-[10px]` / `-mx-[5px]`,**永久可见 `bg-token-border` 1px 线(Codex 没有)**,
  hover 线用 `via-token-text-primary/25`(token 名错),缺 `-top-toolbar`。
- 连带:aside `flex-direction` row(Codex) vs column(WS);`padding-top` 46px vs `pt-11`(44px)。

**A3 会话视图是 VS Code Chat 的克隆,不是 Codex**

- WS 出现且 Codex 完全为 0 的类:`interactive-session` / `interactive-list` / `interactive-item-container` /
  `interactive-request` / `interactive-response` / `chat-most-recent-response` / `chat-used-context*` /
  `chat-thinking-*` / `chat-footer-toolbar` / `chat-response-timing` / `rendered-markdown` / `codicon*`;
  外加 react-virtuoso `[data-testid=virtuoso-scroller]` 与 `codicon` 字体。
- Codex 真实结构:
  `div.thread-scroll-container.relative.h-full.overflow-y-auto.[overflow-anchor:none].[scroll-padding-bottom:var(--thread-scroll-padding-bottom,0px)].electron:[scrollbar-gutter:stable_both-edges].pt-(--thread-content-top-inset)`
  → `div[data-thread-find-target="conversation"].flex.flex-col.gap-3`
  → `div[data-turn-key]` → `div.contents[data-content-search-turn-key]` → `div.flex.flex-col.gap-0`。
  **不做窗口化虚拟滚动**,靠外层 `[content-visibility:auto]` + `[&_[data-virtualized-turn-content]]:[content-visibility:visible]`。
- 用户气泡:`div.bg-token-foreground/5.max-w-[77%].min-w-0.overflow-hidden.break-words.rounded-2xl.px-3.py-2[data-user-m…]`,
  前面有 `h4.sr-only.select-none«You said:»`。
- 助手条目:`div.flex.flex-col.gap-[var(--conversation-item-gap,16px)]`,每项 `div.min-w-0.text-size-chat.relative.overflow-visible.py-0`。

**A4 Composer 完全不同**

- Codex:`div[data-codex-composer-root][data-composer-placement="home"]` + `div[data-above-composer-portal="true"]`;
  `_ComposerLayoutRoot[data-composer-layout][data-composer-radius-variant][data-composer-surface-overflow][data-composer-surface-variant][data-composer-utility-bar-variant]`
  / `_ComposerLayoutBody` / `_ComposerLayoutAttachments` / `_ComposerLayoutFooter[data-composer-footer-responsive]`;
  输入是 **ProseMirror**:`_RichTextInput[data-rich-text-layout=multiline]` >
  `div.ProseMirror[contenteditable][role=textbox][data-codex-composer][aria-label="Do anything"]` > `p.placeholder[data-placeholder]`;
  下拉统一走 `_ComposerDropdownLabel{,Icon,Text,Value,ValueContent,Chevron,SecondaryChevron}` +
  `h-token-button-composer-sm`;项目选择器 `_ActiveProjectSelectorTrigger` + `_ActiveProjectSelectorTriggerClearButton`;
  工具条 `_ComposerFooter._ComposerHomeUtilityBar[data-composer-home-utility-bar-position="above"]`
  外套 `div.horizontal-scroll-fade-mask.hide-scrollbar.overflow-x-auto[data-composer-utility-bar-scroll-area][role=group]`。
- WS:手写 `textarea` + 硬编码值 —— `h-12`、`leading-[22px]`、`text-[13px]`、`size-[26px]`、
  `bg-[rgba(28,28,30,0.5)]`、`text-[#8b8b90]`、`text-[#f4f4f5]`、`border-black/5`、`hover:bg-black/5`、
  `backdrop-blur-[16px]`、`-mb-[23px]` / `pb-[27px]`。`[data-codex-composer-root]` 0 个。

**A5 首页是像素定位的原型稿**

- WS:`div.absolute.top-[433px].left-1/2.-translate-x-1/2.w-[714px]`(建议卡)+
  `div.absolute.bottom-[15px].left-1/2.w-[738px]`(composer)。`HomeView.tsx` 注释写着"对应 prototype/1.html"。
- Codex:`div.[container-type:size].[container-name:home-main-content].overflow-y-auto.[scrollbar-gutter:stable_both-edges]`
  → `.home-banners` + `div.min-h-0.w-full.flex-1.pt-6.flex.flex-col`,内含两个 `grow basis-0` 半区
  (上半 `items-end justify-center pb-24 min-h-fit`,下半 `justify-end`);
  hero = `div.relative.size-14.cursor-interaction.opacity-30.transition-opacity.duration-basic.ease-enter-snappy.[@media(hover:hover)_and_(pointer:fine)]:hover:opacity-40`
  + `div.heading-xl…whitespace-pre-wrap.select-none[data-feature="game-source"]`;
  建议卡是相对 hero 的 `div.absolute.inset-x-[var(--composer-suggestion-inline-inset)].top-full.mt-8`
  → `section.group/home-suggestions`;宽度全靠 `--thread-content-max-width` / `px-toolbar` / `px-panel`。

**A6 TopBar**

- Codex header 在 `main` 内:`h-toolbar`(46px)、`bg-[var(--codex-titlebar-tint,transparent)]`、
  `data-app-shell-application-menu-bar` / `data-app-shell-header-edge-scroll` / `data-pip-*`;
  左右各一份**不可见测量副本**(`invisible.pointer-events-none.fixed.min-w-max.[&_*]:![view-transition-name:none]`)
  + 真实槽 `div[data-test-id="header-shell-slot"].[container-type:inline-size]`;
  中间 `div[data-testid="app-shell-header-context-menu-surface"]` 用 `grid-cols-[minmax(0,1fr)_auto]`;
  左槽内边距 `ps-[max(var(--spacing-token-safe-header-left),0.5rem)]`。
- WS header 是 `#root` 子树的兄弟、`h-11`(44px)、`justify-between`、`pr-2`,只有左右两组按钮;
  无测量副本 / slot / context-menu-surface / 任何 data 属性;按钮不走 Codex 按钮基类而是 `size-8 rounded-lg`,
  svg 20px(Codex `icon-xs` = 16px),且缺 `span.contents[data-state]` tooltip 包装。

**A7 缺三个 portal 层**

- Codex `body` 有 `div.pointer-events-none.fixed.z-[60]`(浮动/DragOverlay 层,内含
  `span.absolute.inset-y-0.start-0.mx-auto.my-2.flex.max-w-(--composer-adjacent-max-width)…`)
  与 `div.pointer-events-none.fixed.top-2.z-[55].flex.justify-end`(toast);
  `#root` 有 3 个子节点(首尾两个 a11y announcer `span`)。WS 全无,`#root` 只 1 个子节点。
- dnd 描述节点 Codex 4 个(项目 + 会话两个 DndContext),WS 2 个 → **会话行未纳入拖拽**。

### B 主题机制级

**B1 缺运行时内联注入** — Codex 在 `<html>` 上内联写 **68** 个变量(优先级最高):
`--codex-sidebar-preferred-width`、`--text-{xs..4xl,heading-sm/md/lg}`、`--codex-base-{accent,contrast,ink,surface}`、
50 个 `--color-*`(`background-button-*`、`background-elevated-*`、`border-*`、`icon-*`、`text-*` …);
`<body>` 再内联一份 `--vscode-font-size` / `--text-*` / `-webkit-font-smoothing`。**WS 内联 0 个。**

后果:层级关系被反转。`app-theme.css:10` 的
`--color-background-elevated-primary: var(--color-background-elevated-primary-opaque)` 在 WS 生效 →
弹起面板 / Composer 表面变成不透明 `rgb(255,255,255)`,Codex 是 `rgba(255,255,255,0.96)`,
`backdrop-blur-[16px]` 因此完全失效。此类 `-opaque` 别名在 `app-theme.css` 里共 4 处。

**B2 body 作用域的 16 个覆盖全部丢失** — 提取脚本对 6 个生成文件只产出 1 处 `body` 选择器。

| 变量 | Codex `body` | WS |
|---|---|---|
| `--cursor-interaction` | **default** | pointer |
| `--padding-row-y` | `calc(--spacing*1.25)` = 5px | `*1` = 4px |
| `--height-token-nav-row` | 31px | 29px |
| `--thread-content-max-width` | 48rem | none |
| `--padding-panel` / `--padding-panel-base` | 20px | 12px |
| `--spacing-token-button-composer-sm` | 28px | 20px |
| `--composer-adjacent-max-width` | `calc(48rem + …)` | 100% |
| `--markdown-wide-block-max-width` | 56rem | 64rem |
| `--color-token-bg-fog` / `--color-background-primary-soft-alpha` | `rgba(255,255,255,.96)` | color-mix 2.5% |
| `--vscode-chat-font-size` / `-chat-editor-font-size` / `-editor-font-size` | 14 / 13 / 13px | ∅ / ∅ / 12px |
| `--vscode-editor-font-family` | `ui-monospace, SFMono-Regular, …` | ∅ |

最扎眼两项:`--cursor-interaction: default`(Codex 桌面端按钮是**箭头**,WS 全是手型);
`--padding-row-y` 已实测出差异 —— 会话行 padding 5px vs 4px,`pe-row-y` 让尾部图标错位 1px。

**B3 `--tw-*` 内部变量被当 token 全局注入**(`app-theme.css:15-20`)

WS `:root`:`--tw-font-weight:600`、`--tw-leading:1.625`、`--tw-ring-color:token-border-heavy`、
`--tw-ring-shadow:0 0 0 calc(.5px+0px) …`、`--tw-translate-x:-4px`、`--tw-translate-y:2px`、`--tw-brightness:brightness(100%)`。
Codex `:root` 上这些是空 / 中性(`--tw-ring-shadow: 0 0 #0000`、translate `0`)。
这是 Tailwind 的**按元素内部状态变量**,全局设值会给任何用到 ring/shadow/translate/leading 的元素
叠上 0.5px 描边和 -4px/+2px 位移。属于既有陷阱清单里"@theme 键必须剔除"的同一族问题。

**B4 nav 容器缺 4 个内联变量** — Codex 那层是
`[--height-token-mode-switch:32px] [--height-token-nav-row:30px] [--padding-row-cell-x:8px] [--padding-row-x:8px] [--radius-token-row:10px]`,
WS 只有第一个。`--sidebar-footer-height` 等也应挂这层(WS 挂在 `aside` 上)。

### C 工具类使用级(系统性)

| 项 | Codex | WS |
|---|---|---|
| `.icon-xs` | 57 次 | **0 次** |
| `.icon-sm` / `.icon-2xs` | 有 / 14 次 | 0 / 3 次 |
| `.text-fade-truncate`(mask 渐隐) | 9 次 | **0 次**,全换成 `truncate`(省略号) |
| `h-toolbar` / `px-toolbar` | 有 | 0,改用 `h-11` / `h-[46px]` |

- C1 图标尺寸:WS 把尺寸烧进 svg `width/height`(把 `viewBox="0 0 20 21"` 的图标写成 `width="14"`)
  或用 `size-4`/`size-5`。TopBar 与 footer 图标因此是 20px,Codex 是 16px。两个 utility 在
  `utilities.css:44/344`(`icon-xs`)、`:62`(`text-fade-truncate`)、`:251`(`h-toolbar`) **早已存在**,是没用。
- C4 **逻辑属性 → 物理属性**:WS 用 `pl-1` `pr-1` `pr-2` `ml-1` `ml-auto` `mr-0.5` `text-left` `left-1/2` `top-1/2`;
  Codex 一律 `ps-*` `pe-*` `ms-*` `me-*` `text-start` `start-*` `end-*`(`<html dir="ltr">`,整体 RTL-ready)。
- C5 硬编码色值:`bg-[rgba(28,28,30,0.5)]`、`text-[#8b8b90]`、`text-[#f4f4f5]`、`border-black/5`、`hover:bg-black/5`;
  token 名错:`bg-token-text-primary/10`(Codex `token-foreground/10`)、`via-token-text-primary/25`(Codex `token-foreground/25`)。
- C6 WS 自加 Codex 没有的过渡:分节操作区 / 项目行操作区上的 `transition-opacity duration-100`、`transition-[min-width]`。
- C7 tooltip 包装 `span.contents[data-state="closed"]` 大面积缺失(Codex 全站用它包图标按钮),WS 有的地方写成裸 `span.contents`。

### D 侧栏局部细节

| # | 偏离 |
|---|---|
| D1 | `nav` 缺 `role="navigation"` + `aria-label="Scheduled task folders"` |
| D2 | 头部导航行缺 `div.flex.flex-col.gap-px` 包装层 |
| D3 | `.sidebar-item` 内缺内容层 `div.flex.min-w-0.items-center.text-base.gap-2.flex-1.text-token-foreground`;WS 把子元素直接摊在 button 下并多加 `group` |
| D4 | New chat 行多了 Codex 没有的 `kbd ⌘N` 徽标 |
| D5 | Search 按钮缺容器 `div.ms-auto.flex.items-center.gap-1`(WS 把 `ms-auto` 挪到按钮);`electron:[&>svg]:icon-xs` 应为 `icon-sm` |
| D6 | 模式切换按钮缺 `disabled:cursor-not-allowed` `disabled:opacity-40` `py-0.5` `leading-[18px]` `rounded-full` `text-sm` 基类;不是 Radix trigger(缺 `aria-haspopup="menu"` / `aria-expanded`) |
| D7 | 分节标题缺 `div.flex.flex-1.min-w-0` 包装;Codex 的 toggle 本身 sortable(`aria-roledescription="sortable"`),WS 不是;WS 操作区 3 个按钮而 Codex 2 个,且缺内层 `div.flex.items-center.gap-1` |
| D8 | 折叠容器 Codex 带动画(`div.overflow-hidden[style="height:…;opacity:…;overflow:…"]`),WS 无;WS 内层缺 `pt-1` |
| D9 | 项目列表缺 `div.flex.flex-col[role="list"][tabindex="-1"]`、缺 sortable 包装(`div.after:block.after:h-px.last:after:hidden.touch-none[aria-roledescription="sortable"]`)、缺 `group/cwd`、缺 hover-card 触发 `span.contents[data-state]` |
| D10 | 项目图标 Codex 是 `span` + 16px `svg.icon-xs.shrink-0`,WS 做成 `button` + 20px svg |
| D11 | 项目名 `span.pe-1.text-fade-truncate` → WS `span.pr-1.truncate` |
| D12 | 会话列表缺 `div[data-app-action-sidebar-project-list-id][data-app-action-sidebar-project-show-all]`(Show more 机制)与 `div[role="list"][aria-label="Scheduled tasks in X"]`;会话行未 sortable |
| D13 | footer:缺上方插槽 `div.relative.z-20.[&>*>*]:pb-2.[&>*>*]:px-row-x`(WS 换成 `div.pointer-events-none` 包一层);行缺 `px-row-x`(横向无内边距)、用 `h-[46px]` 而非 `h-toolbar`、缺 `browser:h-16`;缺 `div.flex-1.min-w-0` + `div.sidebar-item.flex.flex-1.items-center.gap-0.min-w-0` 两层(WS 把 `sidebar-item` 放 button 上);图标 20px vs 16px;发丝线用 `bg-token-text-primary/10`(应 `bg-token-foreground/10`)且缺 `aria-hidden`;文案显示 "Settings",Codex 显示账户名 |
| D14 | 项目行操作区 `div.grid`:Codex `grid-cols-1 min-w-6 shrink me-0.5`,WS `grid-cols-[1fr] min-w-0 shrink-0 mr-0.5` + 多余 transition |
| D15 | 项目行 `⋯` 菜单缺 `div.cursor-interaction.outline-hidden.pe-0.5` 触发包装;行本身多了 `w-full` |
| D16 | 会话行操作按钮缺 `electron:[&>svg]:icon-sm`;`translate-x-px` 被写成内联 `style="transform: translateX(1px)"` |

---

## 三、修复顺序

1. **B1 + B2 + B3 + B4** — 主题机制。一次改动全局收敛,成本最低收益最大。
2. **C1–C7** — 工具类回归 Codex 词表,机械替换,可脚本化。
3. **D1–D16** — 侧栏结构细节。
4. **A6 + A1** — TopBar 归位到 `main` 内 + 补三层 CSS Module + 46px。
5. **A2** — 去 react-resizable-panels,改 Codex 的内联宽度 + aside 内 resize 手柄。
6. **A5 + A4** — 首页改流式布局;Composer 重写(含 ProseMirror)。
7. **A3** — 会话视图重写,去 VS Code chat 类与 react-virtuoso。
8. **A7** — 补 portal 层与会话行拖拽。

---

## 四、修复记录

### 已完成:B 主题机制(全部)

**验收:`<html>` 上 984 个共有变量,值差 0 项**(改前 21 项不同、16 项多余)。

四个根因都在 `scripts/extract-codex-tokens.mjs` 的**选择器匹配过宽**:

| 原写法 | 问题 | 现写法 |
|---|---|---|
| `/data-codex-window-type=electron/.test(p)` 子串匹配 | 把 `… body`、`.electron-opaque body`、`:not(…) body` 全吸进同一个根块 | `isWindowTypeRoot(p)` —— 剥掉成对括号后不含后代组合符才算根 |
| 同上 | body 层 16 个覆盖被 `:root` 反压 | 新增 `collectRules(css, isWindowTypeBody)`,逐规则输出、选择器逐字保留 |
| `/\.electron-light\b/.test(p)` 子串匹配 | 把任意属性 utility `.electron-light .[.electron-light_&]:[--color-token-text-link-foreground:var(--blue-400)]` 并进全局 `.electron-light`,链接色 #339cff → #0285ff | `p.trim() === '.electron-light'` 精确匹配 |
| `--tw-*` 当 token 输出 | Tailwind 按元素内部状态变量变成全局默认:0.5px 描边 + (-4px,+2px) 位移 | `TW_INTERNAL` 过滤 |

另外两处:

- **`main.css` 层序**:`runtime-{light,dark}.css` 移到 `app-theme.css` **之后**。
  两者特异性都是 (0,1,0),只能靠源码顺序决胜。排在前面时 `app-theme.css` 里
  "绕回 `--vscode-*` 的别名"会反压运行时值形成取值环 ——
  `--color-background-surface-under` ⇄ `--vscode-sideBar-background` 双双算成空,
  侧栏底色和整套 sideBar 系 `--vscode-*` 全丢。
- **`ThemeProvider`**:补上 Codex 的字号标度内联注入(`<html>` 14 项 / `<body>` 13 项)
  + `lang="en-US"` / `dir="ltr"` / `<body tabindex="0">` + `outline:none`。
  必须内联:Codex 的 body 层写着 `--text-heading-md: 18px`,实际用的是 20px,
  差异正是靠内联压掉的。颜色仍走 `runtime-*.css`,不把颜色推导拖进启动路径。

**副产品**:`--padding-row-y` 回到 5px(B2),行内边距、`--cursor-interaction: default`
(桌面端按钮变箭头光标)、`--thread-content-max-width: 48rem` 一并归位。

### 已完成:侧栏 header / footer / 分节标题

逐节点 diff 通过(工具:`/tmp/cmp/sub.sh` + 类名集合比对):

- **New chat 行**:与 Codex **逐字节一致**。补回内容层
  `div.flex.min-w-0.items-center.text-base.gap-2.flex-1.text-token-foreground`(D3)、
  标签换 `text-fade-truncate`(C2)、图标交给 `icon-xs`(C1)、去掉 Codex 没有的
  `kbd ⌘N`(D4)、补 `gap-px` 包装(D2)。`NavRow` 另加 `status` 槽,形状照 Scheduled 行。
- **Search 按钮**:补 `div.ms-auto.flex.items-center.gap-1` + `span.contents` 包装(D5),
  尺寸 26×26 / svg 16px,与 Codex 一致。
- **footer**:16 个节点类名集合全等(D13)。补上方插槽兄弟、`h-toolbar`、`px-row-x`、
  两层 `div.min-w-0.flex-1` + `sidebar-item`、发丝线换 `bg-token-foreground/10` + `aria-hidden`、
  图标 `icon-xs`/`icon-sm`、主按钮显示账户名。
- **分节标题**:补 `div.flex.min-w-0.flex-1`、控制组内层 `div.flex.items-center.gap-1`、
  去掉 Codex 没有的 `transition-opacity`、改用 `has-[[data-state=open]]` 钉住、
  删掉 Codex 不存在的独立 "Collapse all" 按钮(它在 Organize sidebar 子菜单里)、
  `title` → `aria-label`(D7)。
- **图标**:4 个把尺寸写死的组件(`ChevronIcon` / `ExternalLinkIcon` / `AddReviewIcon` /
  `VsCodeIcon`)恢复 viewBox 固有尺寸,尺寸交回 `icon-*`。

### 两处刻意偏离(有实测依据)

1. **`electron:[&>svg]:icon-sm` 一律不抄。** Codex 的编译产物里含 `icon-sm` 的选择器
   **只有 `.icon-sm`** 一条 —— 那个组合类从未被编译,是死类名,实际生效的是 svg 自带的
   `icon-xs`(16px)。WS 的 Tailwind 会把它编出来且特异性更高,照抄会把图标顶成 18px、
   按钮 28×28(实测)。渲染一致优先于抄一个上游无效的 token。
2. **`IconButtonSm` 基类多一个 `outline-hidden`。** Codex 的 "Add new project" 按钮没有它、
   "Project sidebar options" 有;两者共用一个基类组件更划算,而该声明与同存的
   `focus:outline-none` 效果重叠,无视觉差异。

### 已完成:A6 + A1 TopBar 与主区域壳层

**验收:header 结构逐字一致(diff 空),main 壳层 10 层逐字一致**(第 11 层起是首页内容,归 A5)。

- header 从 `#root` 的兄弟移进 `main` 内部 —— 它用 `fixed inset-x-0 top-0` 逃出父盒子
  横跨整窗,实测宽度仍等于窗口宽度,几何不变但归属正确。
- `h-11`(44px) → `h-toolbar`(46px);连带 aside 的 `padding-top` 也改成
  `var(--height-toolbar)`,两处终于同源。
- 补上 Codex 的五兄弟结构:左测量副本 / 左槽 / context-menu-surface / 右测量副本 / 右槽。
  测量副本(`invisible fixed min-w-max [&_*]:![view-transition-name:none]`)是必需的 ——
  槽是 `[container-type:inline-size]` 容器,中间那层要靠容器查询知道两侧宽度,
  而容器宽度不能由内容决定,只能先量一遍。
- 按钮改用 Codex 基类:**28×28**(`h-token-button-composer` + `aspect-square` + `!px-0`),
  svg `icon-xs`(16px),外套 `span.contents[data-state]`。
  **删掉 tinted 激活态** —— Codex 的 Hide sidebar 在侧栏打开时类名和其他按钮完全一样,
  不给底色;类里的 `data-[state=open]:…` 是给弹层开合用的,不是面板开关。
  也删掉 Codex 不存在的"最大化面板"按钮。
- 红绿灯安全区:`TRAFFIC_LIGHT_INSET = 80` → `SAFE_HEADER_LEFT = 88`(Codex 实测),
  改成 Codex 的做法 —— 以 `--spacing-token-safe-header-left` 内联在应用根节点,
  槽用 `ps-[max(var(--spacing-token-safe-header-left),0.5rem)]` 消费。
- 应用根节点对齐 `div.relative.flex.flex-col` + `width/height: calc(100vw|vh / var(--codex-window-zoom))`
  + `zoom`,不再用 `h-screen`。安全区是物理像素,靠 zoom 抵掉缩放。
- `ContentArea` 补 `MainContentViewport` / `MainContentFrame` / `MainContentTopFade` 三层
  + 全部 data 属性,并接受 `topFade` / `threadEdgeDivider` / `rightPanelFullWidth` 参数。
  46px 顶部让位现在归 Frame 管,调用方不用再写 pt。
- `main` 上只留 `codex-MainContentSurface` 一个类 —— 模块 CSS 已含
  isolate/flex/flex-col/flex-1/min-height:0/relative。

### 已完成:A2 祖先链(去 react-resizable-panels)

> **教训(记在这里,别再犯)**:上一轮我按 Codex 的类名列表从 aside / main 上删掉了
> `h-full w-full`,却没意识到 WorkStudio 的**祖先链**不同 —— Codex 的 aside/main 是
> 「有确定高度的 flex 行容器」的子项,靠 `align-items: stretch` 拿高度;WorkStudio 当时
> 还套在 react-resizable-panels 的**块级** Panel 里,没有 stretch 可继承。
> 实测后果:aside 高度退化成内容高度(1200×800 窗口下 329×**3519**)、main 塌成 871×**46**、
> 侧栏 `scrollHeight == clientHeight` 完全不能滚、footer 被推出可视区、首页 composer
> 因为 `bottom` 定位失去参照跑到顶部。
>
> 我当时只验了 DOM 结构和计算变量,**没有看渲染结果**,所以没发现。两条纪律:
> 1. **祖先链必须先对齐**,再动下层类名 —— 否则每个下层修复都在补偿一个错误的父级,
>    补偿越多离 Codex 越远。
> 2. 每轮改完除了结构 diff,必须再验 **几何**(关键节点 rect)+ **截图** + **控制台**。

祖先链现在与 Codex **逐行一致**(结构 + 计算布局值 display/flex-direction/height/width/min-height/flex/overflow):

```
div#root                                                     display:block
└ div.relative.flex.flex-col                                 display:flex column
  style: --spacing-token-safe-header-left/right + width/height: calc(100v* / var(--codex-window-zoom)) + zoom
  └ div.relative.isolate.flex.max-h-full.min-h-0.w-full.flex-1    display:flex **row**
    ├ aside.app-shell-left-panel  style: padding-top: var(--height-toolbar); width: <n>px
    │ └ …  + ResizeHandle(sidebar-end)                       ← 手柄是 aside 自己的子元素
    └ main.codex-MainContentSurface                          flex:1 来自模块 CSS
      └ div.relative.isolate.flex.min-h-0.flex-1.overflow-hidden   display:flex **row**
        ├ div.codex-MainContentViewport → Frame → …
        └ aside[data-app-shell-focus-area="right-panel"]     ← 右面板是 Viewport 的**兄弟**
```

验收数据:

| 项 | 改前 | 改后 | Codex |
|---|---|---|---|
| `[data-panel]` | 6 | **0** | 0 |
| `[role=separator]` | 3 | **1** | 1 |
| `.sidebar-resize-handle-line` | 0 | **1** | 1 |
| aside | 329×3519 | **340×800** | stretch 等高 |
| main | 871×46 | **860×800** | stretch 等高 |
| 侧栏滚动 | scrollHeight==clientHeight | **3404 / 685** | 可滚 |
| `-top-toolbar` | 未使用 | **-46px** | -46px |
| 控制台 | — | **无 error/warning/异常** | — |

拖拽行为(CDP 真实鼠标事件,非合成)逐档对齐实测规格:

| 指针 x | 440 | 520 | 600 | 235 | 200 | 150 | 90 |
|---|---|---|---|---|---|---|---|
| 侧栏宽度 | 440 | 520 | **520** | **240** | 240 | 240 | **0** |

—— 上限 520 是固定值(不随视口)、240→~100 是**死区**(防误触折叠)、越过 ~100 才折叠。
这段死区是 react-resizable-panels 做不到的(它是「低于 minSize 立即折叠」),
也是必须换掉它的直接原因。折叠/展开走 toolbar 按钮时恢复到折叠前那一档,不回默认值。

新增两个组件:
- `layout/ResizeHandle.tsx` —— Codex 配方,`w-4` 热区 + `translate-x-±2` 跨边界,
  线默认 `opacity-0` 仅 hover/active/focus 淡入,**没有常驻可见的边框线**
  (Codex 的边界感来自两侧色差 + MainContentSurface 的 box-shadow hairline)。
  侧栏那份带 `-top-toolbar`,向上伸进工具栏区,否则顶部 46px 拖不动。
- `layout/RightPanel.tsx` —— 左缘投影(独立 1px 元素)+ `border-l` 双层、
  内层 absolute + 同值 `min-width/width`(宽度动画时内容不重排)。

`PanelContext` 从命令式 panelRef 改成宽度状态(`sidebarWidth` / `rightPanelWidth`),
折叠用 `width: 0` 表达 —— Codex 也没有单独的 collapsed 标志。

**仍保留 `react-resizable-panels` 依赖**:`panel/file/FileTab.tsx` 内部的
文件树/预览分栏还在用它。那是右面板**内容**的对齐问题,与外壳无关,单独一轮再处理。

**Codex 侧无法取证的一项**:底部面板。Codex 的 "Toggle bottom panel" 点下去
DOM 里不产生任何节点(实测),没有可对齐的目标结构。现放在 `main` 的 flex 列末尾 ——
那是语义上唯一说得通的位置,等能复现出来再按实测调整。

### 未完成(按原修复顺序)
6. **A5 + A4** 首页流式布局 + Composer 重写(需引入 ProseMirror)。
7. **A3 + A7** 会话视图重写(去 VS Code chat 类与 react-virtuoso)+ 补 portal 层。
8. **D 剩余项**:D8(折叠动画)、D9〜D12(项目/会话行 sortable 包装、`group/cwd`、
   hover-card 触发、`role="list"`、Show-more 包装)、D14〜D16。

### 既有 lint 债(非本次改动引入)

`ProjectRow.tsx` / `SortableProjects.tsx` 共 9 个 error:dnd-kit 的 `setNodeRef`
触发 `react-hooks/refs`,以及 `react-refresh/only-export-components`。本次改动的文件
全部 lint 干净。
