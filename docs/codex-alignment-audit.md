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

~~仍保留 `react-resizable-panels` 依赖~~ → **已彻底移除**,见下一节。

**Codex 侧无法取证的一项**:底部面板。Codex 的 "Toggle bottom panel" 点下去
DOM 里不产生任何节点(实测),没有可对齐的目标结构。现放在 `main` 的 flex 列末尾 ——
那是语义上唯一说得通的位置,等能复现出来再按实测调整。

### 已完成:命名对齐 + 彻底移除 panels 库

**命名证据来源(比 DOM 更硬)**:Codex 的 bundle `app-initial-Biw83Aiz.js` 是**格式化过**的
(20MB / 换行完整),而且**解构参数名没被压缩** —— 组件 props 与内部状态名可直接读出。
再配合 CSS Modules 的 `_Name_hash_line` 形态按 hash 分组,能确认哪些类同属一个源文件。

关键分组 `[1e9gb]`:`MainContentSurface` / `MainContentViewport` / `MainContentFrame` /
`MainContentTopFade` / `ApplicationMenuTopBar` / `FloatingHeader` —— 证实这是 AppShell 域。

从 bundle 挖到的真实词汇(× 是出现次数):
- `leftPanelWidth`×4 `leftPanelAnimatedWidth`×4 `leftPanelSlot`×4 `LeftPanel`×3 `floatingLeftPanelWidth`×2
- `rightPanelOpen`×8 `rightPanelFullWidth`×9 `rightPanelWidth`×4 `rightPanelDefaultWidth`×4
  `rightPanelWidthMode`×3 `RightPanelOutlet` `RightPanelTabs` `AppShellTabPanel`
- `AppShell`×1 `AppShellLayoutMotionContext` `appShellTabPanelController` `ThreadAppShellChrome`
  → **`AppShell` 这个名字 Codex 确实在用**,保留。
- `sidebarThreadRow`×11 `sidebarProjectRow`×8 `sidebarFooter`×8 `sidebarItems`×3
- `mainContentWidth`×15 `MainContentLayout`×1
- `headerLeftWidth`×4 `headerRightWidth`×3 `upsertHeaderSlotElement`×10

据此重命名(`git mv` 保留历史):

| 原名 | 新名 | 证据 |
|---|---|---|
| `Sidebar.tsx` | `LeftPanel.tsx` | `LeftPanel` / `leftPanelWidth` |
| `NavRow.tsx` | `SidebarItem.tsx` | `sidebarItems` + DOM 类 `.sidebar-item` |
| `ChatRow.tsx` | `SidebarThreadRow.tsx` | `sidebarThreadRow` |
| `ProjectRow.tsx` | `SidebarProjectRow.tsx` | `sidebarProjectRow` |
| `ContentArea.tsx` | `MainContentLayout.tsx` | `MainContentLayout` |
| `TopBar.tsx` | `AppShellHeader.tsx` | `data-app-shell-header-*` + `headerLeftWidth` |
| `PanelShell.tsx` | `AppShellTabPanel.tsx` | `AppShellTabPanel` |
| `AppShell.tsx` | *(不变)* | Codex 自己就叫这个 |

**`ResizeHandle` 从 bundle 逆出了完整组件形态**(渲染 `sidebar-resize-handle-line` 的那个函数):

```
props = { ariaLabel, currentSize, edge, isKeyboardResizable, isResizing,
          maximumSize, minimumSize, onClick, onKeyDown, onPointerDown }
edge: 'left' | 'right' | 'top' | 'bottom'      ← 四向,不是我原先自创的 placement
right  → z-20  -top-toolbar right-0 bottom-0 w-4 translate-x-2
left   → z-40  top-0 bottom-0 left-0 w-4 -translate-x-2
top    →       top-0 right-0 left-0 h-4 -translate-y-2
bottom →       right-0 bottom-0 left-0 h-4 translate-y-2
```

两个只有读源码才知道的点,已照做:
1. **手柄自己不管拖拽状态**,只抛 `onPointerDown`,拖拽由父级持有再用 `isResizing` 回传
   (拖拽中线 `opacity-100` 常亮)。拖拽逻辑因此抽成 `utils/usePanelResize.ts`。
2. **键盘可调整是可选的**(`isKeyboardResizable`):关闭时 `tabIndex`/`aria-label`/
   `aria-valuemin|max|now`/`onKeyDown` **全部是 undefined**,不是给默认值。

**panels 库已彻底移除**:`package.json` 依赖删除、`separators.tsx` 删除、
`FileTab.tsx` 内部分栏改成同一套(宽度 state + `ResizeHandle edge="left"`)、
`PanelContext` 从命令式 panelRef 改成宽度 state。源码零引用。

拖拽逐档复测(CDP 真实鼠标,每档从 340 起):

| 指针 x | 440 | 520 | 600 | 235 | 150 | 60 |
|---|---|---|---|---|---|---|
| 宽度 | 440 | 520 | **520** | **240** | 240 | **0** |

toggle 折叠 → 展开恢复到折叠前那一档。控制台无 error/warning/异常。

> **调试记录(避免重复踩)**:验证过程中三次误判为实现 bug,实际都是**测试脚本**的问题 ——
> ① 手柄跟着 aside 右缘移动,每步必须重读手柄位置再按下,固定坐标会按在手柄之外;
> ② 宽度归 0 后手柄消失,`HX()` 读到的是过期位置;
> ③ `mousePressed` 未配对 `mouseReleased` 会**阻塞 CDP 输入队列**,后续 `dispatchMouseEvent`
> 全部超时,看起来像渲染进程卡死。用 MutationObserver 观察 aside 内联 width 的变化序列
> 才最终确认实现是对的(284 → 0)。
>
> 真实实现 bug 只有一个,已修:`usePanelResize` 最初用 `useCallback([onResize])` +
> ref 存 cleanup,连续拖拽时旧监听摘不掉、多个 move 处理器各持 `startSize` 互相覆写,
> 宽度卡住不动。改成**一次拖拽 = 一个 AbortController**,不跨拖拽存任何状态。

### 已完成:A5 首页流式布局 + A4 Composer

**验收:首页 60 个节点、Composer 98 个节点,标签/缩进/类名集合逐一全等(diff 0 处)。**
(比对脚本 `/tmp/cmp/cmpnode.py`:归一化 CSS Module 哈希 `_Name_xxxxx_NN` → `codex-Name`
后逐节点比标签、缩进深度、类名集合。)

**A5 首页** —— 从像素绝对定位改成 Codex 的流式骨架:

```
div.@container/left-panel.relative.flex.h-full.min-h-0.flex-col
└ div.[container-type:size].[container-name:home-main-content]…overflow-y-auto
  ├ div.mx-auto…px-toolbar > div.home-banners…empty:hidden.pt-2        ← 横幅槽(常空)
  └ div.min-h-0.w-full.flex-1.pt-6.flex.flex-col
    ├ div.flex.grow.basis-0.items-end.justify-center.pb-24.min-h-fit   ← 上半区
    │ └ div.relative.mx-auto…px-panel
    │   ├ div.flex.min-h-28.w-full.items-end.justify-center → HomeHero
    │   └ div.absolute.inset-x-[…].top-full.mt-8 → HomeSuggestions     ← hero 的 absolute 兄弟
    └ div.flex…shrink-0.grow.basis-0.flex-col.min-h-fit.justify-end    ← 下半区
      ├ div.mx-auto…gap-2.-mt-16 > [data-home-ambient-suggestions]
      └ div.relative.z-20.pt-1.5.pb-4 > div.mx-auto…gap-2 > Composer
```

机制上的三点(绝对定位做不到):
1. **两个 `grow basis-0` 半区**对半分可用高度,上半 `items-end` / 下半 `justify-end`,
   窗口变高时 hero 与 composer 一起往中间靠。
2. 建议卡是 hero 的 `absolute` 兄弟(`top-full mt-8`),位置永远跟着 hero,不需要知道 hero 多高。
3. 宽度全走 token(`--thread-content-max-width` + `px-toolbar` / `px-panel`),
   删掉了 `top-[289px]` / `top-[433px]` / `w-[714px]` / `bottom-[15px]` 这些原型稿遗留。

顺带修掉的:
- **两层路由容器**(`div.relative.min-h-0.flex-1 > div.h-full.min-h-0`)原先整个缺失,
  导致首页与 Codex 整体错位 2 层。它们归 `MainContentLayout`(视图切换时不重建,
  滚动位置与动画上下文才保得住),按 `routeLayout` 选 home/thread 两档类名。
- `HomeLogoIcon` 用错了图标 —— 换成 Codex 运行时的真实 svg(`viewBox="149 149 418 418"`,
  `<mask>` + 巨型 path 描边 + 两条 `stroke-width="24"` 的 `>_` 提示符)。
- 建议卡数据是空数组 → 补上 Codex 的 4 条固定文案与 `token-charts-*` 配色。
- 卡片网格从 `grid-cols-4` + `w-[714px]` 换成
  `grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]` + 三条 `@container` 断点;
  Electron 下无 border,靠 `ring-[0.5px]`。
- `Hero`/`SuggestionCards` → `HomeHero`/`HomeSuggestions`(与 Codex 的 `Home*` 前缀一致)。

**A4 Composer** —— 重写为 Codex 的 `ComposerLayout*` 结构:

- `ComposerLayoutFooter` 是 **grid**,三槽用 `col-start`/`row-start` 显式定位:
  输入区第 1 行 `col-span-full`,控件第 2 行左右分列。原先 flex + `ml-auto` 的换行行为不同。
- 抽出 `ComposerDropdownLabel` 承载 6 处复用,含两个关键 data 属性:
  `data-composer-dropdown-foreground`(primary/tertiary/warning,前景色不靠 text-* 类)
  与 `data-composer-footer-collapse`(none/xs/sm,窄工具条的折叠优先级)。
- chevron 三种形态实测各不相同,**不能统一**:项目选择器无 chevron、
  运行位置是**裸 svg**`.codex-ComposerDropdownLabelChevron`、分支才包
  `span.codex-ComposerDropdownLabelSecondaryChevron`。
- 6 个按钮的尺寸类逐个对齐实测值(`h-token-button-composer-sm` + `px-1.5 text-sm`
  + `in-data-[composer-placement=home]:px-2` 等),删掉硬编码的
  `bg-[rgba(28,28,30,0.5)]` / `text-[#8b8b90]` / `border-black/5` / `backdrop-blur-[16px]`。
- 表面色/圆角/模糊改由 `codex-ComposerLayoutRoot` 的模块 CSS + 4 个 `data-composer-*` 属性给。
- `inline` 布尔 prop 删除,改成 Codex 的 `data-composer-placement`('home' | 'thread')。

**输入区换成 ProseMirror**(`RichTextInput.tsx`,新增 6 个 prosemirror-* 依赖):
DOM 契约与 Codex 完全一致 —— `div.ProseMirror[contenteditable][aria-multiline][dir="auto"]
[role="textbox"][translate="no"][data-virtualkeyboard][data-codex-composer]`
+ 内联 `style="font-size: var(--codex-chat-font-size); height: auto; resize: none;
min-height: 2.75rem;"`,空文档时 `p.placeholder[data-placeholder]`。

两个踩过的坑:
1. **占位符必须走 decoration**,不能在事务后 `classList.add`。ProseMirror 每次重绘
   都按 state 重建 DOM,手动加的类会被下一次重绘抹掉 —— 实测表现是 `<p>` 上 class 恒为空。
2. Codex 的占位符 CSS 是 **`.ProseMirror .placeholder:after`**(不是 `:before`,
   也不是 input 的 placeholder 属性)。提取器原先漏了**裸 `.ProseMirror`** 选择器那一层
   (它不带模块哈希),导致 `white-space: break-spaces` 缺失、ProseMirror 在控制台告警,
   且占位符完全不显示。已把 `ProseMirror` 加进提取器的 NAMED 列表(90 条规则)。
   同时补了 `shadow-md-strong` 等 3 个 shadow 标度(Tailwind 生成但不在 @theme 里)。

交互验证(CDP 真实键盘事件):输入 → 占位符消失、发送键启用;退格清空 → 占位符恢复。
控制台无 error/warning/异常。

### 已完成:A3 会话视图骨架 + A7 portal 层

**A7 验收:`<body>` 两个 portal 层 + `#root` 三子元素(两个 a11y announcer 夹住应用)
与 Codex 逐字一致。**

portal 必须是 `<body>` 的子元素而非 `#root` 内:应用根那层有
`zoom: var(--codex-window-zoom)`,而 `zoom` 会给后代建立新的包含块 ——
放在里面的 `fixed` 会相对那一层定位而不是视口,窗口缩放时浮层跟着漂。
z 轴次序:z-[60](拖拽克隆体)> z-[55](toast)> z-40(thread 浮动面板)>
z-30(header)> z-20(侧栏 footer / resize 手柄)。

**A3 骨架验收:thread 11 层骨架 + 滚动容器类名集合与 Codex 完全一致。**

新增三个组件:
- `ThreadScrollContainer` —— `thread-scroll-container` 那一层及其外壳
- `ThreadTurn` / `ThreadUserMessage` / `ThreadAssistantMessage` / `ThreadItems` / `ThreadItem`
- `AppPortals` + 两个 announcer

**最重要的发现:Codex 的贴底跟随靠 `flex flex-col-reverse`,不是 JS。**
滚动容器本身是反向 flex,滚动原点在底部(实测 `scrollTop: 0` 即在底部),
内容长高时浏览器自动保持贴底,不需要任何 scrollTop 计算,也不会和流式输出打架;
用户往上翻时正常离开底部,是布局的自然行为而非特例逻辑。
配合 `[overflow-anchor:none]` 关掉浏览器自己的锚定(会和反向 flex 冲突)。
我最初写了 ResizeObserver + scrollTop 手动跟随,行为接近但不等价(流式时会抖),
发现这个类之后整段删掉了。

滚动容器另外三个容易漏的类:
- `[container-type:inline-size]` + `[container-name:thread-content]` ——
  内容块的容器查询靠它(宽块、表格按容器宽度切档),少了那些 `@container` 规则全失效
- `[&:has([data-thread-scroll-footer='true']:focus-within)]:[scroll-padding-bottom:0px]` ——
  输入框聚焦时取消滚动内边距,否则光标被自己的 padding 顶出视口

其他结构性改动:
- **不再是"请求行 + 回复行"扁平列表**。Codex 以 turn 为单位:一个 `data-turn-key`
  里依次是用户消息 → 中间条目 → 最终回复,段间用空的 `div.w-full` 分隔。
  之前跟 VS Code Chat 拆两行是为了虚拟滚动按行测高,Codex 不做窗口化,该约束不存在。
- **react-virtuoso 已彻底移除**(package.json + 源码零引用),`ChatList.tsx` 删除。
- 输入区移到 sticky 底槽 `[data-thread-scroll-footer]`,是消息流的兄弟。
- `MainContentLayout` 的两层路由容器补上 thread 档类名。⚠️ 我一开始把
  `data-vscode-context` 写在最外层,顺序反了 —— 实测 thread 态高度链断掉、
  滚动容器量到 0 高。正确顺序是**路由容器在外,data-vscode-context 在最里**。
- markdown 块类名换到 Codex 模块类:`codex-Paragraph` / `codex-Heading` /
  `codex-List{,codex-Ordered/UnorderedList}` / `codex-ListItem` / `codex-Blockquote` /
  `codex-HorizontalRule`,表格拆成
  `codex-TableContainer > codex-TableScroller > codex-TableWrapper` + `codex-TableActions`,
  加粗用 `font-semibold`(不是默认 bold)。`.rendered-markdown` 已归零。
- `MarkdownPart` 加 `withRoot` —— 助手回复由 `ChatView` 套 `codex-MarkdownRoot`
  (它要挂标注属性),避免嵌两层让 `[&>*:last-child]:mb-0` 打在错误的层上。

**顺手修掉一个我自己引入的命名错误**:上一轮全局重命名把 `chat/model/rows.ts` 里的
`ChatRow`(会话流行类型)误伤成了 `SidebarThreadRow` —— 那是侧栏的名字,语义完全不同。
已改为 `ThreadRow`。

### 已完成:D-c 悬浮面板 + D-d 拖拽 + D8〜D15

**最重要的发现:悬浮卡片和普通 tooltip 是同一个组件。** Codex 没有独立的
HoverCard —— 侧栏那张卡片是 `Lh`(tooltip)的 `variant="rich"` + `interactive`。
之前 WS 自己写的 `useHoverCard` + 固定定位卡片,DOM 契约完全不同。已重写为
`components/tooltip/Tooltip.tsx`(TooltipProvider + Tooltip + 内容层 portal),
定位用 floating-ui(新增 `@floating-ui/react-dom`,Codex 也是它 —— 卡片的
`max-width` 内联值直接引用 `--radix-tooltip-content-available-width`,
那三个变量由 `size` 中间件的 apply 写入)。

时序常量全部来自 bundle,别凭手感改:

| 常量 | 值 | 出处 |
|---|---|---|
| 默认开启延迟 | **700ms** | `Ett` |
| 免延迟窗口 | 300ms | `Dtt` |
| `delayOpen` 短延迟 | 250ms | `utt` 里 `t && (n = 250)` |
| interactive 交接定时器 | 100ms | `ktt` |

外加一条**空间**规则:指针进入 `[data-hover-card-open-immediately]` 子树时延迟归 0
(`bjc`)。侧栏把它挂在会话行的操作区与状态槽上。
关闭不是"延时",是**安全三角**交接(`ntt`/`rtt`/`itt`,padding 8px):以指针为顶点、
浮层靠触发器那条边为底边构成三角形,走出三角形立刻关 —— 方向维度的宽容,
所以横扫一列行时上一张卡片不会挂着。

**悬浮卡片只对「归属某个项目」的会话出现。** 这是从源码推出来的,不是产品取舍:
`SRc` 里 `disableHoverCard: c || (E == null && !Ee)`,`E = hoverCardProjectLabel`;
而侧栏会话列表(`DRc` 调用点)**根本不传这个 prop**,于是
`W = s ?? H?.label ?? null` 退化成 `H?.label`,`H = Po(w8o, threadKey)` 就是
该会话的项目组 —— 没项目就没 label,卡片关闭。实测两侧复核:
hover Recents/Pinned 里的会话,body 下不出现 `[role=tooltip]`;
展开项目后 hover 它下面的会话,卡片出现(Codex 224×86 / WS 224×62,
差的 24px 是 WS 这条会话没有 git 分支行)。

**层级是两级,靠一个空槽拉开缩进。** 项目下的会话嵌在项目组内,无项目的会话
与**项目行**同级(不是与项目下的会话同级)。缩进不是靠 padding 而是
`reserveLeadingSlot`(= `isGrouped`):分组行前面渲染一个**空的**
`div.flex.w-4.shrink-0…`,16px + 内容行 `gap-2` 的 8px = 24px。实测标题左缘:

| | Codex | WS 改前 | WS 改后 |
|---|---|---|---|
| 项目名 x | 40 | 40 | 40 |
| 项目下会话标题 x | **40** | 16 ✗ | **40** ✓ |
| 无项目会话标题 x | 16 | 16 | 16 |

卡片计算样式两侧逐项相同:圆角 15px、`backdrop-filter: blur(8px)`、
底色 `oklab(… / 0.9)`、box-shadow 六段全等、`max-width: 320px`、z-index 50、
portal 到 `document.body`。

**D-d 四类拖拽** —— 一个 DndContext 管全部(实测 Codex 侧栏所有可拖项的
`aria-describedby` 都指向 `DndDescribedBy-0`)。id 命名从 aria-live 播报逆出来:

| | id 形态 | 注册方式 |
|---|---|---|
| 项目组 | `codex:project:<uuid>` | useSortable |
| 会话(可排序) | `codex:thread:local:<uuid>` | useSortable |
| 会话(仅可拖) | `local:<uuid>` | useDraggable |
| 容器落点 | `sidebar-thread-container:<containerId>` | useDroppable |

containerId 命名空间(来自 `Agc`):`pinned` / `chats` / `project:<id>` /
`custom:<id>` / `cloud`。`R8(id)` = `pinned` 或 `custom:*`,即**分节级**容器,
**不含**项目容器 —— 我一开始理解反了。落点规则照抄 `Agc`。

三种包装形态是实测的差别,不能统一:

```
Pinned/Projects 的项(项目与会话共用):
  div[role=listitem][aria-roledescription=sortable].after:h-px.touch-none
  └ div.overflow-hidden[style=…] └ 行/项目组
项目内的会话:
  div[role=listitem].after:h-px            ← 无 touch-none
  └ div.cursor-grab.active:cursor-grabbing[aria-roledescription=sortable][role=button]
    └ div.overflow-hidden[style=…] └ 行
Recents 的会话:同上,但 aria-roledescription=**draggable**(Recents 不支持重排)
```

**拖拽副本不是行的克隆**,是一张专门的预览卡(实测):
`div.pointer-events-none[style="position:fixed;…z-index:2147483647"]`
→ `div[aria-hidden][inert].[--height-token-row:30px][style="height:calc(100%);width:calc(100%);transform:scale(1);transform-origin:left top"]`
→ `div.relative.flex.w-fit.max-w-80.flex-col.gap-1`
→ `div.sidebar-item.overflow-hidden.border.border-token-border.bg-token-bg-primary.opacity-70.shadow-lg`
→ `div.flex.h-[var(--height-token-row)].max-w-80.items-center.gap-2.px-2` + 图标 + `span.min-w-0.truncate`。
必须 **portal 到 body**:DndContext 在 aside 内,而 aside 的包装层有
`overflow-hidden` + `[contain:layout_paint]`,不 portal 拖出侧栏就消失
(实测第一版 body 下找不到任何 z-index 2147483647 的节点)。

**跨项目移动的确认框**(`KIc`)只在**目标项目缺源目录**时弹。判定是"覆盖"
而非"集合相等"(`LIc`):源目录等于目标某个目录、或在它之下,就算已覆盖。
文案逐字:标题 `Add folders to {projectName}?`、正文
`All chats in {projectName} will gain access to these folders:`、按钮 Cancel / Continue。

> **教训:落点判定不能用裸 `closestCenter`。** Codex 有一整套 kind-aware 的
> 碰撞检测(`oMc` + `Ngc` + `kgc`),我一开始图省事用了 dnd-kit 默认的
> closestCenter,**四类拖拽里三类静默失效**:拖项目时 over 落到别的项目
> **下面的会话**上,拖会话回 Recents 时落到某条会话上被当成跨项目移动、
> 弹出确认框。三级优先已照 Codex 补上:
> ① 按类型/`Agc` 先筛掉不合法落点 → ② pointerWithin 命中具体行(= 插到这一行)
> → ③ 命中容器(= 移进这个列表),其中「落在项目会话列表里」优先解释成
> **在列表内排序**(`isActiveInReorderBoundary`),只有 `project-icon` 落区
> 是保证的容器落点。
>
> **另一个只有实际操作才会暴露的 bug**:`SidebarSortableItem` 里我把
> `role="listitem"` 写在 `{...attributes}` **前面**,被 dnd-kit 的
> `attributes.role = 'button'` 覆盖了 —— Codex 那层是 `role="listitem"` +
> `aria-roledescription="sortable"` 并存。除了无障碍语义错,
> `[role=list] > [role=listitem]` 这类选择器会全部落空。

**Pinned 的混合顺序**(用户反馈的"项目与非项目会话应该平级"):Codex 侧栏状态
里存的是**一个混合的 itemKey 数组**(schema 实测:`codex:project:<uuid>` /
`codex:thread:local:<uuid>` / `codex:thread:remote:<id>` / `chatgpt:*`),
所以 Pinned 里项目行与会话行是同一个可排序列表的兄弟,可以互相穿插。
WS 原先拆成 `pinnedProjectIds` + `pinnedChatIds` 两个数组分别渲染,DOM 上永远是
"项目全在前、会话全在后"。已在 `ProjectRegistry` 加 `pinnedItemKeys`(混合顺序)
与 `projectThreadOrder`(项目内手工顺序),两个旧数组保留 —— 它们回答"是否置顶",
新数组只回答"排第几";缺失时由两者派生,旧状态文件可直接用。

**D8**:折叠是带动画的。三处(分节内容区、项目会话列表、每一行外壳)都是
`div.overflow-hidden` + 稳态内联 `height: auto; opacity: 1; overflow: visible;`
—— framer-motion 动画结束后的痕迹。折叠时**整块不渲染**,不是 height:0 常驻。

**D9〜D12 / D14 / D15** 一并补齐:`group/cwd`、左侧 32px 落区遮罩起点改成
`top-[var(--height-token-row)]`、项目图标 button → **span**(同时是
`project-icon` 落区)、项目名 `truncate` → `text-fade-truncate`、
`role="list"` + `aria-label="Scheduled tasks in X"`、
`[data-app-action-sidebar-project-list-id]` + `-show-all` 包装、
操作区 `grid-cols-1 min-w-6 shrink me-0.5`(min-w-6 **无条件**)、
`⋯` 外层菜单触发器包装、行上去掉 `w-full`、删掉 Codex 没有的 transition。

### 未完成(按原修复顺序)
8. **D 剩余项**:D16;分节标题的 sortable 只补了 aria 契约,还没接进 DnD 上下文
   (Codex 的 Projects / Recents 分节可互相重排,Pinned 固定在最上)。
### 已完成:侧栏顶部模式切换器(D6)

用户反馈"侧边栏顶部 logo 无法点击"。hit-test 实测排除了遮挡:
`elementFromPoint` 命中的就是那个 button 本身,`-webkit-app-region: none`、
`pointer-events: auto`,header 那层是 `pointer-events-none` 不吃事件
(它自己的按钮能点,空白处的点击穿透到下层 aside/main —— 那是 Codex 的设计)。
真正原因是**它没挂 handler**:D6 早就记了"不是 Radix trigger、缺
aria-haspopup / aria-expanded",一直是个死按钮。顺带纠正一点:
那不是 logo —— Codex 侧栏顶部**没有 logo**,只有「当前模式 + chevron」。

点开 Codex 的菜单抓到完整契约并实现(`SidebarModeSwitcher.tsx`):
菜单 `div[role=menu][data-radix-menu-content][data-side=bottom][data-align=start]`,
`w-[240px]` + `m-px` + `rounded-xl` + `ring-[0.5px]` + `shadow-xl-spread` +
`backdrop-blur-sm`;两个两行菜单项(`ChatGPT Work / Create, learn, and explore`、
`Codex / Build, debug, and ship`),当前项尾部一个 `icon-xs opacity-75` 的勾。
几何实测:菜单相对按钮 dx=+1 / 距按钮底 +5,其中各 1px 来自菜单自己的 `m-px`,
所以定位参数是 `side="bottom" align="start" sideOffset={4}` —— WS 实测
`translate(8px, 82px)` 与 Codex 的 (8, 82) 完全一致。触发器的基类也照 D6 补齐
(`disabled:cursor-not-allowed` / `disabled:opacity-40` / `py-0.5` /
`leading-[18px]` / `rounded-full` / `text-sm`,含 Codex 那些被后续类压掉的重复)。

**刻意偏离**:WS 没有 ChatGPT Work 模式,选它只关菜单不做别的 —— 不假装
一个还不存在的能力,DOM 与文案保持一致,接入模式概念时只换 onSelect。

**残留 2px 未解**:菜单高 WS 102.28 / Codex 104.25,差值来自每个菜单项第一行的
行盒(Codex 19.56 / WS 18.57)。已排除的因素:两侧 `OpenAI Sans` 字体面完全相同
(400 unloaded / 500 loaded,`check('600 13px')` 都为 true)、
菜单项继承字重都是 445、font-size 13px、line-height 18.5714px 全等;
反常的是 Codex 的**内层** span 反而更矮(15 vs 15.5)却把外层行盒撑得更高,
说明贡献来自别处(可能是那一行里还有别的行内盒或 vertical-align 差异)。
下一轮从这几个已排除项之后接着查,不用从头再来。

### 已实测:turn 的三段式 +「Worked for xx s」过程折叠

> **纠正**:上一轮我按字符串搜 `Worked for` 得到 0 命中,就断言"这份构建里没有"
> —— **错了**。它在 DOM 里确实存在(实测 `Worked for 1m 28s`),字符串搜不到
> 只说明它是运行时拼的 / 在 `app-initial` 之外的 chunk 里。
>
> 更值得记的是**方法错误**:我之前扫会话只筛 CSS Module 类(`/^_[A-Za-z]/`),
> 于是 14 条会话全报"只有 markdown"。而**过程段、工具活动行、折叠头全是
> 纯 Tailwind 工具类,一个模块类都没有** —— 筛选条件本身把要找的东西滤掉了。
> 以后扫构件要看**全部**类名,不能只看模块类。

**turn 是三段 + 两个空隔离元素**(`div.w-full[aria-hidden="true"]`):

```
div[data-turn-key].[&_[data-virtualized-turn-content]]:[content-visibility:visible]
└ div.contents[data-content-search-turn-key]
  └ div.flex.flex-col.gap-0
    ├ ① div.flex.flex-col                                        用户消息
    │   └ div.scroll-mt-4[data-content-search-unit-key][data-local-conversation-user-anchor="true"]
    │     └ div.flex.flex-col.items-end.gap-2
    │       ├ h4.sr-only.select-none «You said:»
    │       └ div.group.flex.w-full.flex-col.items-end.justify-end.gap-1
    │         ├ div[data-user-message-bubble="true"][tabindex="0"]
    │         │   .bg-token-foreground/5.max-w-[77%].min-w-0.overflow-hidden.break-words.rounded-2xl.px-3.py-2
    │         └ div.flex.flex-row-reverse.items-center.gap-1     hover 才显的操作
    │           └ div.me-1.ms-1.flex.items-center.gap-2.opacity-0.group-focus-within:opacity-100.group-hover:opacity-100
    │             ├ span.flex.opacity-0… > span.text-xs.text-token-text-tertiary «Friday 12:01 AM»
    │             └ div.flex.items-center.gap-0.5 > button[aria-label="Copy message"] + button[aria-label="Edit message"]
    ├ div.w-full[aria-hidden="true"]
    ├ ② div.flex.flex-col                                        **过程段(可折叠)**
    │   ├ div.text-size-chat.text-token-text-secondary
    │   │ └ button[type="button"][aria-expanded]
    │   │     .inline-flex.items-center.gap-1.rounded-md.border.border-transparent.text-size-chat
    │   │     .focus-visible:ring-2.focus-visible:ring-token-focus-border.focus-visible:outline-none
    │   │   └ span > span.text-token-conversation-body «Worked for 1m 28s»
    │   ├ div.pt-1.text-size-chat.text-token-text-secondary
    │   │ └ div.w-full.border-t.border-token-border              折叠态只剩这条发丝线
    │   └ [展开时才有的第三个兄弟] div
    │     ├ div.w-full[aria-hidden="true"]
    │     └ div.flex.flex-col.gap-[var(--conversation-item-gap,16px)]
    │       └ div        ← 每个过程条目外面一层匿名 div
    │         ├ 推理文字 → 与最终回复**同一套结构**(见下)
    │         └ 工具活动 → div.min-w-0.text-size-chat.relative.overflow-visible.py-0
    │                      └ div.flex.min-w-0.flex-col
    │                        └ button|div.group/activity-header.inline-flex.min-w-0.max-w-full
    │                            .self-start.items-center.gap-1.p-0  [aria-expanded?]
    │                          └ span.inline-flex.min-w-0.gap-1.5.items-center.shrink.truncate.text-size-chat
    ├ div.w-full[aria-hidden="true"]
    └ ③ div.flex.flex-col[data-local-conversation-final-assistant="true"]   最终回复
        └ div[data-content-search-unit-key]
          └ div.group.flex.min-w-0.flex-col[data-response-annotation-conversation][data-response-annotation-target="item-N"]
            ├ h4.sr-only.select-none «ChatGPT said:»
            └ div._MarkdownRoot_…[data-markdown-text-style="assistant-message"][data-selected-text-overlay-target][dir="auto"]
```

**用户那条猜测逐项核对**:

| 猜测 | 实测 |
|---|---|
| 发完消息出现 "Worked for xx s" | ✅ 存在,`Worked for 1m 28s` |
| 前面的思考、工具调用都会出现 | ✅ 都在过程段里 |
| 工作结束后过程折叠 | ✅ 重新打开已完成会话时 `aria-expanded="false"`,折叠态正文只剩一条 `border-t` 发丝线 |
| 只有最终输出展示 | ✅ 最终回复是过程段的**兄弟**(带 `data-local-conversation-final-assistant="true"`),不在折叠范围内 |

**三个只有实测才知道的点**:

1. **中间推理文字与最终回复用的是完全同一套结构** ——
   都是 `div.group.flex.min-w-0.flex-col[data-response-annotation-*]` +
   `h4.sr-only «ChatGPT said:»` + `div._MarkdownRoot_[data-markdown-text-style="assistant-message"]`。
   唯一区别是最终那段的父级带 `data-local-conversation-final-assistant="true"`。
   所以**不需要**为"中间回复"另做一种组件。
2. **工具活动行的标签是 `button` 还是 `div`,取决于它有没有可展开的细节** ——
   有细节的是 `button[aria-expanded="false"]`,没有的(例如只写
   "Searched the web")就是普通 `div`。两者都带 `group/activity-header`。
3. 过程条目之间的间距走 `--conversation-item-gap`(默认 16px),不是写死的 gap。

**这解决了 #15 的取证阻塞**:工具活动行 → `group/activity-header` 那套;
推理文字 → 已经迁好的 `codex-MarkdownRoot`;折叠头 → 上面那个 button。
下一轮可以直接照这份结构改 parts,不用再找。

### 分析(已被上面推翻):「Worked for xx s + 过程折叠」在这份构建里查不到

结论先说:**这份 Codex 构建里没有 "Worked for" 这个文案**。逐个搜过:

| 搜索串 | 命中 |
|---|---|
| `Worked for` | 0 |
| `Thought for` | 0 |
| `Reasoned` / `Ran for` / `Completed in` | 0 |

`Thinking` 有 13 处,但唯一那处当标签用的(369180)是
**@ 提agent 的选择器**:`active → statusSummary ?? 'Thinking'`、
`waiting → 'Waiting'`、`done → 'Done'`,给搜索打分用,不是会话里的工作指示。

所以这条要么来自比 `app-initial-Biw83Aiz.js` **更新**的 Codex(这个 bundle
与 8214 上跑的那份同名同源,已核对),要么是 Codex CLI / ChatGPT 的记忆串了。
**在拿到实测之前不动**。

**能确认的部分**:模型层确实区分"最终回复"与"过程" ——
状态里有 `finalAssistantStartedAtMs`,运行时 DOM 上有
`data-local-conversation-final-assistant` / `data-assistant-message-sent-time`,
turn 层是 `data-turn-key` + `data-content-search-turn-key` / `-unit-key`。
所以"过程与最终输出被分开对待"这个方向是对的,但**折叠机制本身没查到**。

**"Codex 没有就删掉"这条不能直接套用**:bundle 里明确存在
`localConversation.automaticApprovalReview.*`(审批控件,7 个 title + 5 个
actionSummary)与 `localConversation.mcpToolActivity.*`(工具活动,按工具名分档),
说明工具调用与审批 UI **Codex 是有的**,只是这台机器上的会话里没出现、
抓不到 DOM。基于"我在一个本来就没有富内容会话的 bundle 里没搜到"就删掉
20 个组件,风险远大于收益。

**要往下走只有一条路**:在 Codex 里真跑一条会触发工具调用的消息,
然后抓 DOM。这一步需要用户操作(会在他机器上真实执行命令)。

### 未完成(按原修复顺序)
9. **模式菜单的键盘导航**:Codex 是 Radix menu(↑↓ 选择、Home/End、typeahead),
   目前只实现了 Escape 与点击外部关闭。

10. **#15 parts 类名迁移** —— 已测绘,**卡在取证上**,没有动手改。

    现状(只统计 tsx,不含那 10 个 CSS):`interactive-*` / `chat-*` /
    `rendered-markdown` / `codicon` 分布在 **20 个组件**里,高频的是
    `interactive-item-container`(23)、`chat-thinking-box`(22)、
    `chat-used-context-label`(14)、`interactive-request`(13)、
    `chat-font-size-body-s`(13)。

    **卡点:本机运行的 Codex 里拿不到这些构件的 DOM。** 打开内容最长的那条会话
    (470 个节点)后,`.thread-scroll-container` 里出现的模块类只有 markdown 一族
    —— `_Paragraph_` / `_Heading_` / `_List(Item)_` / `_Blockquote_` /
    `_HorizontalRule_` / `_Table*_` / `_InlineMarkdown(Isolate)_` /
    `_MarkdownRoot_` / `_Mention_` / `_Icon(Container)_`,**这些已经迁过了**。
    工具调用、思考块、代码块、diff、TodoList、审批控件一个都没有,
    所以它们的 Codex 类名/层级此刻无法实测。照猜写等于自己编类名,不做。

    **已知可用的对位模块类**(在生成的 components.css 里已存在,可直接消费):
    `codex-CodeBlock` / `codex-CodeBlockPlaceholder`(代码块)、
    `codex-TaskList` / `codex-TaskListItem`(TodoList)、
    `codex-activityPill*` / `codex-ActivityText` / `codex-ActivityStackViewport`
    (工作中/活动条)、`codex-thinkingShimmer`(思考文字流光)、
    `codex-throbber` / `codex-throbberArc`(加载转圈,`stroke-dasharray` 以
    **度**为单位,由 `--browser-tab-throbber-sweep` 驱动)、
    `codex-timeline*`(时间线)、`codex-MermaidBlock` / `codex-MarkdownTablePreview`。

    **图标那一半也一样卡。** `Codicon.tsx` 产出的是 VS Code **字体**类名
    (`.codicon.codicon-x`),要移除 `@vscode/codicons` 就得把 18 个名字全换成 SVG:
    `check copy chevron-down chevron-right circle-filled file checklist loading
    edit terminal error warning info pass record circle-outline plug book`。
    其中能直接对上 WS 已有(从 Codex 提取的)图标的只有一小半
    (check→CheckIcon、copy→CopyIcon、chevron-*→ChevronIcon、file→DocumentsIcon、
    terminal→TerminalIcon、edit→EditIcon、info→InfoIcon);
    `pass / record / circle-outline / plug / book / checklist / error / warning /
    circle-filled` 在 Codex 侧没有取到对应物,混着编会污染"图标全部来自 Codex"这条底线。

    顺带查明一件事(改的时候能省一步):`ChatProgressMessagePart` 的 `loading`
    转圈**从来不可见** —— 上游 CSS 写着
    `.shimmer-progress > .codicon { display: none }`,shimmer 态图标被隐藏,
    只有静止态的 `check` 会显示。所以那一处不需要找转圈图标,直接条件渲染即可。

    **下一轮的正确起手式**:先在 Codex 里造出这些构件(发一条会触发工具调用/
    思考/代码块/TodoList 的消息),再逐个抓 DOM;拿不到实测之前不要动 parts。

    ### 更新:换了取证路径 —— 从 CSS dump 的**文件名**入手

    又扫了一遍 Codex 的 14 条会话,**没有一条**含工具调用/思考/代码块;
    所以走不通"打开会话抓 DOM"。改从 `reverse/webview-dump/assets/` 的
    **文件名**入手有效 —— 那些名字直接对应构件,而且每个文件里就那么几个类。

    **三个已排除的错误对位**(照猜会全错,记下来省下一轮的时间):

    | 我以为 | 实际是 | 怎么看出来的 |
    |---|---|---|
    | `codex-TaskList` = 计划/TodoList 组件 | markdown 的 GFM 复选框列表 | 模块 hash 是 `y8xrz`,与 `_Paragraph_y8xrz_82` / `_Table_y8xrz_39` 同一个 |
    | `codex-activityPill*` / `codex-ActivityText` / `codex-ActivityStackViewport` = 会话的"工作中"指示 | **桌宠/头像浮层** | 规则里全是 `data-avatar-overlay-stack-*`;CSS 文件名也是 `avatar-overlay-*` |
    | `codex-CodeBlock` = 工具输出的代码块 | markdown 的围栏代码块(这个能用) | 同样是 `y8xrz` hash |

    **两个可用的真实对位**:
    - `subagent-activity-chip-group-*.css` → `_chip_jj3nd_1`(= `codex-chip`),
      subagent 活动 chip,是"工具活动行"最接近的东西
    - `thinking-shimmer-*.css` → `_cadencedShimmer{,Active,Highlight,Sweep}_1q6es_*`
      (= `codex-cadencedShimmer*`),**会话里"正在做事"的文字流光** ✅ 已落地

### 已完成:文字流光迁到 Codex 的 cadencedShimmer

`chat-shimmer-text` 在 tsx 里**已归零**(6 处全换),新增
`chat/parts/CadencedShimmer.tsx`。

它不是"给文字加渐变背景"—— 文字渲染**两遍**:底层一份 +
`codex-cadencedShimmerSweep`(absolute 铺满 + 渐变 mask 开一条亮带)里再放一份
`codex-cadencedShimmerHighlight`。两层动画位移**方向相反**
(sweep `-50%→125%`,highlight `50%→-125%`),相消之后高亮副本在视觉上原地不动、
只有那条亮带扫过它 —— 单层 `background-clip:text` 做不出这个效果。
时序是 `steps(48,end)` 的 **1s 单次**(不是 infinite):是一次次"打拍子",
不是连续流动。

**载体类挑错过一次,值得记**:这一族只消费
`--shimmer-text-secondary` / `--shimmer-contrast`,自己不定义,必须同时挂载体。

| 载体 | contrast | 用途 |
|---|---|---|
| `loading-shimmer-pure-text` / `loading-shimmer` | `#ffffffbf`(白 75%) | 列表/侧栏 loading 态 |
| `codex-thinkingShimmer` | `color-mix(--color-token-foreground 50%, transparent)` | **会话内**的思考/工作文字 |

第一版挂了 `loading-shimmer-pure-text`,实测高亮算出来 `rgba(255,255,255,0.75)`
—— 浅色背景上**看不见**(那条规则是给深色表面写的,它的 `.dark` 变体反而给黑色,
语义是反的,应该是从 ChatGPT web 带过来的)。换成 `codex-thinkingShimmer` 后
两个值都由 `currentColor` / `--color-token-foreground` 推导,深浅色都成立。

顺带补了提取器的一个漏:`loading-shimmer` / `loading-shimmer-pure-text`
两个载体类原先没被收进来(侧栏 loading 态的 meta 文本也用它),已加进 NAMED 重跑。

**一个已排除的疑点**:`--shimmer-text-secondary` 里的 `var(--text-secondary)`
在 WS 解析为空,导致底层文字用满色而不是 50%。查了两侧 `html`/`body`,
**Codex 也是空** —— `--text-*` 那一族只在 `.loading-shimmer*` 作用域内自己定义。
所以这不是提取漏了,WS 复现的就是 Codex 的实际行为,不用管。

实测(在 WS 里现场造节点验 CSS):tokens 都解析、底色与高亮色不同、
sweep `absolute` + 渐变 mask、两条动画都绑上 `1s steps(48) x1`;控制台干净。

### 既有 lint 债(非本次改动引入)

`ProjectRow.tsx` / `SortableProjects.tsx` 共 9 个 error:dnd-kit 的 `setNodeRef`
触发 `react-hooks/refs`,以及 `react-refresh/only-export-components`。本次改动的文件
全部 lint 干净。

9. **A3 余项:parts 内部类名**。23 个 `chat/parts/` 组件内部仍用
   `interactive-*` / `chat-*` / `codicon`(工具调用、思考块、代码块、审批控件、
   TodoList 等),thread 态实测残留 `interactive-` 4 个 / `chat-` 6 个 / `.codicon` 4 个。
   这是一整个子系统(含 Monaco 代码块、diff 视图),单列一轮。
   10 个 VS Code chat CSS 已从被删的 `ChatList` 迁到 `main.tsx` 暂管;
   parts 换完后连同 `@vscode/codicons` 依赖一起移除。

---

## 取证方法的一次跃迁:webview-dump 里有**全部 4714 个 lazy chunk**

前面几轮一直在两个受限的来源之间挣扎:`app-initial-Biw83Aiz.js`(参数名未压缩,
但只有首屏那部分)与运行中 Codex 的 DOM(受限于"本机 14 条会话里没有工具调用")。
上一轮记的"从 CSS dump 的文件名入手"是这个困境的产物。

**其实 `reverse/webview-dump/assets/` 里躺着整个 webview 的 4714 个文件**,
按功能切分、文件名就是模块名。这一轮直接读到了:

| 文件 | 内容 |
|---|---|
| `tool-activity-disclosure-CkDQzSI4.js` | **整套活动行原语**(表头/箭头/行壳/展开体/disclosure) |
| `local-conversation-turn-DF8fx5gl.js` | turn 的三段式 + 「Worked for」折叠头 + 折叠摘要三档文案 |
| `subagent-activity-chip-group-DtZM0hSI.js` | 30479 行的会话渲染主体:32 种条目的扁平 switch、推理块、patch 行、计划 pill、图标映射 |
| `split-items-into-render-groups-CBZe4KAV.js` | **过程 / 最终回复的真实分段算法** |
| `reasoning-item-heading-pM5srCoy.js` | 推理正文的小标题剥离/提取 |
| `worktree-init-tool-activities-DMSULnlr.js` | shell 块(`default` / `embedded` 两档)+ ANSI 转换器 |
| `highlight-code-bx-gqOKs.js` | 代码高亮:**highlight.js**,注册 40 个语言 |
| `book-open-kevPl-ms.js` 等 | 单个图标一个 chunk |

**方法**:`grep -l '<某个特征类名或文案>' reverse/webview-dump/assets/*.js`
定位到 chunk,`npx prettier --parser babel` 展开,然后顺着 `import { x as y }`
的别名表往上追(`/tmp/cmp/resolve.py`)。这比按 CSS 文件名猜、比在 DOM 里
碰运气都可靠得多 —— **而且不需要会话里真出现那个构件**。

> sourcemap 走不通:8214 对 `*.js.map` 返回 index.html(200 但是 13570 字节的
> SPA 兜底),webview-dump 里也没有 `.map`。别再试。

### 还原出来的活动行原语(已 1:1 落地到 `chat/parts/activity/`)

| WS | Codex 源码 | 要点 |
|---|---|---|
| `ConversationItem` | `aZc`(app-initial) | `padding="offset"` → `min-w-0 text-size-chat relative overflow-visible py-0`;`default` 只有 `py-0` |
| `ActivityRow` | `j` | `ConversationItem` + `div.flex.min-w-0.flex-col` 装 [header, body] |
| `ActivityBody` | `G` | `default` = `gap-2 pt-2 pb-1`;`grouped` = `gap-[var(--conversation-grouped-item-gap,4px)] pt-1`;`indent` = `ps-6` |
| `ActivityHeaderContent` | `y` | `inline-flex min-w-0 gap-1.5` + `items-center`/`items-start` |
| `ActivityChevron` | `C` | **平时 `opacity-0`**,hover / focus-visible / 展开才显;展开加 `rotate-90` |
| `ActivityHeader` | `D` | 有 disclosure → `<button>`,没有 → `<div>`,类名基座相同,只多 `cursor-interaction` |
| `ActivityHeaderRow` | `F` | 见下 |
| `ToolActivityDisclosure` | `Y` | 见下 |
| `ScrollFadeStack` | `OT` | 见下 |
| `DiffCounts` | `CZ`(app-initial) | 见下 |
| `useElementHeight` | `B` | 回调 ref,挂上先用 `scrollHeight` 写一次;RO 读 `borderBoxSize[0].blockSize` |
| `DISCLOSURE_TRANSITION` | `Qj`(app-initial) | `{duration: 0.3, ease: [0.19, 1, 0.22, 1]}` |

#### ① 可展开的活动行**不是**把整行包进 `<button>`

```
div.group/activity-header.relative.inline-flex.max-w-full.min-w-0.items-center.gap-1.self-start
├ button.absolute.inset-0.cursor-interaction              ← 铺满整行的透明按钮
│   [aria-label|aria-labelledby][aria-expanded]
│   .focus-visible:ring-1.focus-visible:ring-token-focus-border.focus-visible:ring-inset
├ span.pointer-events-none.relative.shrink.truncate.text-size-chat
│   .[&_a]:pointer-events-auto.[&_button]:pointer-events-auto   ← 摘要
├ accessory                                               ← 增删行数等
└ span.pointer-events-none.relative.flex > chevron
```

这样摘要里的文件链接仍可点,行内空白处点哪都能展开。用 `<button>` 包整行做不到
—— 嵌套 interactive 元素非法,而且点链接会顺带展开。
**上一轮我从 DOM 快照倒推的那版少了 accessory 与 chevron,还把调用方传进来的
几层 span 当成了组件自身的结构** —— 这就是只有 DOM、没有源码时的典型误差。

#### ② `ToolActivityDisclosure` 有**两个**展开状态位

```js
const [runningExpanded, setRunningExpanded] = useState(false)
const [idleExpanded,    setIdleExpanded]    = useState(defaultExpanded)
const expanded = hasBody && (running ? !runningExpanded : idleExpanded)
//                                     ^^^ 取非
```

running 档取的是**非**:初值 false → **运行中默认展开**,点一下置 true 才收起
(这个 state 的语义是"用户主动收起过")。跑完切到 `idleExpanded`(默认 false)
→ 自动收起。换的是**读哪个 state**,不是去写另一个,所以不需要任何 effect 同步
—— 我第一版想成"一个 expanded + useEffect 在 status 变化时重置",那会在 status
抖动时把用户的展开操作抹掉。

#### ③ 贴底与淡出**全部由 CSS 承担**,一行 JS 都没有

`ScrollFadeStack`(`OT`)只有两层 div:

- **贴底跟随 = `flex flex-col-reverse`**(与 `ThreadScrollContainer` 同一手法)
- **上下淡出 = `vertical-scroll-fade-mask`**,靠 `animation-timeline: scroll(self y)`
  插值 `--top-fade` / `--bottom-fade`,遮罩自己跟着滚动位置变

所以 `ThinkingPart` 里整套 `ResizeObserver + scrollTop + onScroll 算淡出类` 全删了
—— 不是简化,是那两件事在 Codex 里根本不由 JS 做。

终端输出块还多一条:容器是 column-reverse 之后滚动进度方向翻转,遮罩动画必须配
**`[animation-direction:reverse]`**,否则上下两条淡出带会装反(贴底时淡下边)。

#### ④ 展开动画是**测出来的像素高度**,不是 `max-height` 也不是 grid `fr`

```jsx
<motion.div initial={false}
  animate={{height: expanded ? elementHeightPx : 0, opacity: expanded ? 1 : 0}}
  aria-hidden={!expanded} inert={!expanded}
  className={expanded ? 'overflow-visible' : 'overflow-hidden'}
  style={{pointerEvents: expanded ? 'auto' : 'none'}}
  transition={{duration: .3, ease: [.19, 1, .22, 1]}}>
  <ActivityBody ref={elementRef} …>{children}</ActivityBody>
</motion.div>
```

Codex 里这段在推理块 / patch 行 / 多 agent 动作 / 计划 / disclosure 至少五处
**逐字重复**(React Compiler 内联的结果),WS 抽成了 `DisclosureBody`,产出的 DOM 一样。
四个不能省的细节:`initial={false}`(否则重开历史会话时所有活动行一起做收起动画)、
`inert`+`aria-hidden`(光靠 `height:0` 里面的按钮还能被 Tab 聚焦)、
`overflow-visible` 只在展开态、`pointerEvents` 走 style(动画中间态不该能点)。

### 分段:`splitItemsIntoRenderGroups` 的真实规则

上一版我写的是"**尾部连续的** markdown 全算最终输出"。Codex 是:

```js
let z = R.length - 1
while (R[z]?.type === 'mcp-server-elicitation') --z
if (!isAssistantMessage(R[z])) {
  let e = z
  for (;;) {                                    // 只跳这三类
    const t = R[e]
    if (t?.type !== 'mcp-server-elicitation' &&
        t?.type !== 'subagent-activity' &&
        (t?.type !== 'reasoning' || !t.completed)) break
    --e
  }
  if (isAssistantMessage(R[e]) && R[e].phase === 'final_answer') z = e
}
const V = isAssistantMessage(R[z]) ? R[z] : null
if (V) R.splice(z, 1)                            // ← 只摘走**一条**
```

两处关键差别:

1. **只有一条 assistant message 进最终段**。模型分两段输出正文(中间没有工具调用)时,
   我那版会把第一段也搬进最终输出。
2. **可以跳过尾部的"已完成推理"去找它** —— 回复之后又来一段推理时,最终输出仍是那条回复。

WS 的 `ChatContent` 没有 `phase` 字段(协议不给),`phase === 'final_answer'` 落不了地,
退化成"取最后一条 markdown"。Codex 在这种情况下走的也是 `isAssistantMessage(R[z])`
那条直接分支,所以不是判断错误,是数据缺失。

### 折叠头文案是**三档**,不是一档

`CollapsedTurnSummary`(`ca`):

| 条件 | 文案 id | 文案 |
|---|---|---|
| 运行中(`workedForItem`) | —— | 每秒 tick 的实时计时器 |
| 有 `workedDurationMs` | `localConversation.workedFor` | `Worked for {time}` |
| 都没有 | `localConversation.previousMessagesSummary` | `{count, plural, one {# previous message} other {# previous messages}}` |

上一版我在没有时长时编了一句 `Worked for a moment` —— Codex 换成**数条数**。
没跑过工具的轮次谈"工作了多久"本身没意义,而"N 条之前的消息"描述的是被折叠起来的
**内容量**,那才是折叠头该给的信息。

folding header 的 chevron 折叠态写的是显式 `rotate-0`(不是"不加类"),已照抄。
展开的内容是**第三个兄弟**且带入场动画:`opacity 0→1` + `translateY(-8px)→0`,
220ms / `cubic-bezier(.33,1,.68,1)`(reduced-motion 120ms 且不位移)。

### 推理块(`reasoning`,源码 `LT`)—— 上一版几乎全错

| 上一版(照 VS Code 抄) | Codex 实测 |
|---|---|
| 每段推理一个 `.chat-thinking-item` + `codicon-circle-filled` 圆点,连成思维链 | **一整块 markdown**,没有分段、没有圆点 |
| 表头显示推理正文里的小标题 | `Thinking` / `Thought for {elapsed}` / `Thought` 三档,**从不显示小标题** |
| 固定高度 200px(VS Code `THINKING_SCROLL_MAX_HEIGHT`) | **8.75rem = 140px** |
| ResizeObserver + scrollTop 手写贴底 | `flex flex-col-reverse` |
| onScroll 里算上下渐隐、切四个类 | `vertical-scroll-fade-mask` + 滚动驱动动画 |

小标题的去处:`stripHeading` 把它从正文里**剥掉丢开**,另一条 `extractLastHeading`
把它喂给**轮次级的活动摘要**(另一个表面,WS 还没有)。所以它不是"该显示在这里
但漏了",是属于别的地方 —— 显示在表头会和正文第一行重复一遍。

> 这条是**截图逮到的**:改完先看 DOM 全对,截图里那行写着「核对求值规则」而不是
> 「Thought」才露馅。四样验证里"截图"不是走过场。

### 图标映射(`Fg(item)`)

全部 `aria-hidden` + 共享常量 `Lg = 'icon-xs shrink-0 text-token-conversation-body'`:

| 条目 | 图标 |
|---|---|
| `exec` + `parsedCmd.type === 'read'` | 翻开的书(`book-open` chunk) |
| `exec` + `'search'` | 放大镜(与 WS 已有的 `SearchIcon` **path 逐字相同**) |
| `exec` + `'list_files'` | 文件夹 |
| `exec` + `executionStatus === 'interrupted'` | 圆角实心方块(停止) |
| `exec` + 网络命令 | 地球(与 WS `BrowserGlobeIcon` 逐字相同) |
| `exec` 兜底 | 终端 |
| `patch` | 笔(**与 composer 的 EditIcon 不是同一个**:那个 21 宽,这个 20 宽) |
| `web-search` | 地球 |
| `context-compaction` | 两条横线向中间收 |
| `stream-error` | **wifi 弧线**(不是错误图标 —— 用"连接"表达断流) |
| `system-error` | 圆圈感叹号 |
| `reasoning` / `todo-list` / `assistant-message` / `user-message` / `worked-for` | **无图标** |

11 个由 `scripts/extract-activity-icons.mjs` 从产物生成(21 条 path 全部逐字比对通过),
不手抄:这些 path 有的两千多字符,抄错一位不报错,只是形状微妙地歪掉。

### 计划(`todo-list`,源码 `FE` → `IE`,tooltip 内容 `BE`)

| 上一版 | Codex |
|---|---|
| 常驻展开的卡片:`checklist 图标 + Plan · 2/5` + 一整个 `<ul>` | **一颗 pill**:12px 圆环 + `Step 2 / 5`,清单收在 rich tooltip 里 |
| 每项一个 codicon(`pass`/`record`/`circle-outline`)+ 三种语义色 | 空心圆 / 圆圈勾**两个**图标,完成项 `text-token-text-tertiary` |

圆环:`pathLength={100} strokeDasharray={100} strokeDashoffset={100 - percent}`
—— 用 `pathLength` 把周长归一化成 100,dashoffset 直接就是百分比,不用算 `2πr`;
`transform="rotate(-90 6 6)"` 把起点从三点钟转到十二点钟;底圈同一个圆 `opacity: 0.16`。

### 顺手抓到的两个**既有 bug**(不是本轮引入的)

1. **`text-size-chat` 从来没被提取过。** `.text-size-chat{font-size:var(--codex-chat-font-size)}`
   是 Codex 自己写的规则,不是 Tailwind 生成的,提取器的 NAMED 里没有它。
   后果:整个会话流的文字都停在 16px 根字号,Codex 是 14px —— 而每个 className
   都写着 `text-size-chat`,肉眼根本看不出"这条类没生效"。
   实测:WS 16px/16px vs Codex 14px/13px。已把 `text-size-chat{,-sm}` /
   `text-size-code{,-sm}` / `icon-xxs` / `disambiguated-digits` / `font-vscode-editor`
   加进 NAMED 重跑,现在两侧 14px/13px 全等。
2. **turn 的段间隔实际是 0。** Codex 的 gap 组件(`XC`)是
   `<div aria-hidden className="w-full" style={{height: 'var(--conversation-item-gap, 16px)'}}/>`
   —— **高度是内联给的**。我上一轮只写了 `<div className="w-full"/>`,而容器是
   `flex flex-col gap-0`,于是三段全贴在一起。DOM 结构对了、节点也确实存在,
   **结构 diff 看不出来** —— 这也解释了 Codex 为什么把 `gap-0` 显式写在容器上:
   间距只能由这些槽提供,容器不许有自己的 gap。

### 本轮验证记录(四样都做了)

- **结构**:15 个活动行(`BUTTON` + `DIV` 两种形态都在)、10 个 `icon-xs` 图标、
  8 个 chevron、4 条折叠头 + 4 条发丝线、17 个分隔槽(高度 **16px**)、8 个 markdown 根、
  4 个 `data-local-conversation-final-assistant`
- **几何**:活动摘要 14px;收起态 `height 0 / overflow hidden / pointer-events none /
  opacity 0 / aria-hidden / inert`;展开态 `130.56px / overflow visible / auto`;
  展开体内边距 `8px 0 4px 24px`(= `gap-2 pt-2 pb-1` + `ps-6`);
  推理滚动窗 `max-height 140px` + `animation-timeline: scroll(self y)`;
  终端 `whitespace: pre` / 13px;`DiffCounts` 的 `font-feature-settings: "cv01","cv02"`
- **交互**(真鼠标事件,不是 dispatchEvent):
  - 点折叠头:`0px → 114px`,`aria-expanded false→true`,chevron `opacity 0→1`、`rotate 90deg`,
    再点回 `0px`
  - hover 活动行:`chevronOpacity 0→1`,摘要色变 `token-foreground`
  - 点文件链接:`rowExpanded` 保持 `false` —— `stopPropagation` 生效,没有顺带展开
- **截图**:浅色 + 深色各一张,`/tmp/cmp/round11-activity.png` / `round11-dark3.png`
- **控制台**:干净(顺手修掉了预览页的 `duplicate key: t1` —— 那是 fixture 里
  request/response 同 id 却各渲染一个 turn 造成的)

一个**排除掉的疑点**:活动行的 `cursor` 实测是 `default` 而不是 `pointer`。
两侧都查了:`--cursor-interaction` 在 `<body>` 上被 `[data-codex-window-type=electron] body`
设成 `default`,**Codex 也一样** —— Electron 里整个应用不用手型光标。不是 bug。

### 预览页(`preview.tsx`)这一轮也改了 —— 它上一轮漏测了骨架

之前 preview 只渲染 `ThreadUserMessage` / `ThreadAssistantMessage`,**不走过程段**,
所以「Worked for」折叠头、段间隔、活动行一个都测不到 —— 骨架改了它却测不出来。
现在它与 ChatView 走同一条路(合并 request/response 成 turn + 三段式)。
另外它的 light/dark 开关原先只切 `<html>` 的类,**Monaco 不跟着换主题**
(它订阅的是 `themeStore`),深色页面上代码块留一块白底;已补 `publishTheme(v)`。

> 预览页仍有一处已知限制:`data-theme`(给 `.hljs-*` 选档)由 `useTheme()` 的
> context 决定,而 context 只跟系统外观走,所以预览页切深色时代码块的 `data-theme`
> 仍是 light。真应用里 ThemeProvider 两件事一起做,不存在这个问题。

## 剩余差距(明确没做,不是漏了)

1. **代码块与 diff 的渲染引擎仍是 Monaco。** Codex 用 **highlight.js**
   (`highlight-code-bx-gqOKs.js` 注册 40 个语言,产出 `.hljs-*` —— 那批 CSS
   已经在 `assets/codex/highlight.css` 里,目前是死代码);diff 是自研的
   turn-diff 行(`h-9 border-b border-token-border bg-token-dropdown-background`)。
   **外壳已经换成 Codex 的 `CodeSnippet` 了**(`data-markdown-copy` /
   `contain-inline-size` / 标题栏 / `bg-token-text-code-block-background`),
   换引擎只需要替换 `<code>` 里的内容 —— 但要加依赖、对 40 个语言、还牵连 DiffView,
   单列一轮。`theme/themes.ts` 里那条 `TODO(Phase 3)` 说的就是这件事。
2. **终端输出的 ANSI 颜色。** Codex 把输出交给 ANSI→HTML 转换器,产出 `.ansi-red-fg`
   这类 span(类在 `worktree-init-tool-activities-CxuoHau6.css`,颜色取
   `--color-token-terminal-ansi-*` —— **这些 token WS 已经有了**,缺的是类规则
   与解析器)。现在仍是纯文本,含转义序列的输出会显示成可见乱码。这是既有行为
   (之前的 `<pre class="chat-terminal-output">` 也一样),本轮没有改善。
3. **审批控件的 Codex 版没找到。** bundle 里有
   `localConversation.automaticApprovalReview.*`(7 title + 5 actionSummary)与
   `approvalRequest.inProgress`,但那些是**对自动审批结果的回顾**,不是给用户点的
   allow/deny;`permission-request` 分支渲染的 `TO` 在 dump 里是空壳。翻遍 4714 个
   chunk 没找到命令审批的按钮文案。所以 `ToolConfirmation` 只对齐了能对齐的部分:
   外壳用活动行,按钮类名逐字取自 Codex `Button` 的两张表(`primary` / `secondary` /
   `ghost` + `size="compact"`),语义(Allow / Allow for this session / Skip)仍是 WS 协议的。
4. **`useElementHeight` 每个元素单开一个 ResizeObserver。** Codex 全应用共用一个
   (`useResizeObserver` + `ResizeObserverProvider`)。可观察行为相同,差在 observer 实例数。
5. **推理耗时**(`Thought for {elapsed}`)与**折叠头的实时计时器**:协议不给推理耗时,
   turn 模型也没有"过程段仍在进行"这个状态位,两者都退到 Codex 自己的兜底分支。
6. **模式菜单的键盘导航**(上一轮就挂着):Codex 是 Radix menu(↑↓ / Home/End / typeahead),
   目前只有 Escape 与点击外部关闭。

## 既有 lint / tsc 债(非本轮引入,已核对)

- `tsc`:7 个 error,全在 `components/panel/`(改动前后都是 7)
- `eslint`:1 个 error 在 `state/AppShellContext.tsx:367`(effect 里同步 setState)
  + `ProjectRow.tsx` / `SortableProjects.tsx` 的 dnd-kit `react-hooks/refs` 警告
- 本轮改动的文件全部 lint 干净


---

## 后续两轮:滚动弹走 + 代码块换引擎

### 一、折叠/展开时滚动位置弹走

**一条被我自己证伪的假设,记下来省下次的时间。**

症状:点折叠头/活动行,被点的那一行自己往上跳。原因是滚动容器 `flex flex-col-reverse`
(贴底跟随靠它)—— 反向 flex 的主轴起点在**底部**,内容在位置 P 长高 N 之后
P **之前**的内容整体上移 N,而表头恰恰在自己展开内容的前面。

同一脚本两侧实测(10 样本):

    Codex   最大位移  3px    scrollTop 自动跟着变 ±48
    WS      最大位移 183px   scrollTop 纹丝不动

**先怀疑是 Chromium 版本**(Codex 跑 Chrome 151,WS 是 Electron 39 = Chrome 142)。
写了最小复现(裸 `flex-col-reverse` + `overflow-anchor:none`,中间长高 200px)
在两个内核上跑 —— **完全一样,都不补偿,都位移 -200**。不是浏览器差异。
祖先链也逐层比过,两侧一致。**这条假设是错的。**

**第二个坑:探针拦错了 API。** 拦 `scrollTop` 的 setter 抓到 **0 次写入**,
一度以为是浏览器行为。补上 `scrollTo` / `scrollBy` / `scrollIntoView` 之后才看见:
Codex 一次展开里调了 **28 次 `scrollTo({behavior:"instant", top})`**。
以后追这类"谁动了滚动"的问题,四个 API 要一起拦。

**真正的机制**在 `thread-scroll-layout-T6DCT1IT.js`:Codex 有一套滚动控制器,
以**距底距离**为准(`{scrollHeightPx, distanceFromBottomPx, wheelDistanceFromBottomPx}`),
`scrollHeight` 一变就重新施加。约 470 行,还管滚轮/触摸/指针的方向跟随与自动贴底。

**这一轮没有整套搬那个控制器**,用的是 Codex 为这件事专门写的另一个函数
`fWo`(app-initial 导出名 `QD`,`preserveElementViewportPosition`):

```js
function fWo(el, zoom = 1) {
  const scroller = el.closest('[data-app-action-timeline-scroll]')
  if (scroller == null) return
  const baseline = el.getBoundingClientRect().top
  // rAF + [data-turn-key] 的 ResizeObserver 双轨,每次用 delta 修 scrollTop
  // 250ms 后收摊
}
```

Codex 自己在**过程段折叠头**(`local-conversation-turn:1229`)与 **turn-diff**
(`subagent-activity-chip-group:18837`)两处调它。WS 除这两处外,还接到了
活动行的两种表头上 —— Codex 那边由滚动控制器兜底,这里由同一个函数兜底,
可观察行为等价。

四个不能省的细节(都写在 `preserveViewportPosition.ts` 的注释里):
基准必须在**点击的同步阶段**取(等 effect 时布局已经变了);
观察的是 `[data-turn-key]` **而不是**展开体;rAF 与 ResizeObserver **双轨**
(RO 只在尺寸真变时触发,而 scrollTop 的写入要等下一帧);增量要**除以 zoom**。

还顺带补上 `data-app-action-timeline-scroll`(Codex 的 `sm.timelineScroll` 选择器,
实测挂在 `.thread-scroll-container` 上)—— 少了它 `closest()` 找不到滚动容器,
补偿会**静默失效**,不报错。

修复后:WS 最大位移 **0px**(10 样本);真鼠标复核活动行 0px、折叠头 0px
(修复前同一脚本同一元素 -51px)。

### 二、代码块:Monaco → highlight.js

`assets/codex/highlight.css` 里那批 `.hljs-*` 规则从提取那天起就没有消费者。
Codex 的引擎是 highlight.js(`highlight-code-bx-gqOKs.js` 注册 **45 个语言**),
这一轮把它接上了。

**流式的做法是这件事的关键**,不是"内容一变就整块重高亮":

```js
const cached = highlighted != null && content.startsWith(highlighted.code) ? highlighted : null
const lines  = cached?.html.split('\n') ?? null
const tail   = cached == null ? content : content.slice(cached.code.length)
```

缓存只在**当前内容以它为前缀**时才用;已高亮部分逐行 `dangerouslySetInnerHTML`
(行间插真实的 `\n` 文本节点);**没轮到高亮的尾巴按纯文本渲染** —— 于是围栏
没闭合时不会闪也不会空白。高亮本身 120ms 节流(`Paa`),逐行组件是 `memo` 的
(`Faa`,少了它每帧要重设几百个 innerHTML)。

**一处刻意差异**:围栏不写语言时 Codex 走 `highlightAuto`,那要求 45 个语言
全部已注册,与按需加载互斥;这里退回纯文本。

实测:语言表与 Codex 的 45 个键逐字相同(缺 0 / 多 0)、全部可加载;
会话里 `.monaco-editor` 实例数 **0**;代码块产出 24 个 `.hljs-*` span 且由
highlight.css 上色(keyword `rgb(166,38,164)`),深浅两套都对。

容器类补齐成 Codex 的 `Iaa`:`text-size-chat overflow-auto p-2` + `dir="ltr"`
—— `overflow-auto` 给长行横向滚(外层 `overflow-clip`,少了它长行直接被裁),
`dir="ltr"` 让代码在 RTL 下也从左往右(外层用的 `pe-2/ps-2` 会跟着翻)。

**DiffView 仍是 Monaco**,所以 `monaco-editor` 依赖还在。Codex 的 diff 是自研的
turn-diff 行(`h-9 border-b border-token-border bg-token-dropdown-background`),
是独立的一件事。

### 三、底部渐隐一直是个空壳

真应用里第一次打开长会话就撞上:推理文字直接压在 composer 上。
`ThreadScrollContainer` 的底部渐隐只写了外层定位壳,**里面是空的**。
Codex 的 `csc` 外层只负责定位,渐变在内层,而且:

- 内层的宽度约束与消息流、输入区**共用同一串**(Codex 抽成了常量 `N3`)——
  铺满整行会把左右两侧的背景也压出一道色差
- 渐变是 `from-X via-X` 而**没有 `to-`**(Tailwind 默认 `to-transparent`),
  下半截实心、上半截淡出;只写 `from-X` 的话中点就开始透明,遮不住紧贴输入区那几行
