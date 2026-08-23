# Codex 右侧面板规格(实测 + bundle 逆向)

来源:
- 实测:`http://127.0.0.1:8214/`(CDP 9250,目标选择按 URL 含 8214 过滤 —— 打开 Browser tab 后会出现第二个 page target,`scripts/cdp-eval.mjs` 默认取第一个会打错)。
- bundle:`reverse/src/assets/app-initial-Biw83Aiz.js`(已格式化)、`reverse/webview-dump/assets/thread-app-shell-chrome-B9rY23FW.js`(已用 prettier 格式化)。

## 一、技术栈

| 层 | Codex 用的 | 证据 |
|---|---|---|
| 视图 | React 19(带编译器缓存 `(0, X.c)(n)`) | 全 bundle |
| 动画 | **framer-motion**(`motion.aside/div/ul/li`、`AnimatePresence`、spring `{type:'spring',duration:0.5,bounce:0.1}`) | `GE()` 里 `WE` 常量;aside 的 opacity/width 是 motion value |
| 状态 | **自研 signals store**(`signal`/`signalFamily`/scope/`useSyncExternalStore`,原子名带 `$` 后缀:`tabs$` `activeTab$`)。不是 jotai/zustand/redux | `app-initial:6620` `ba()` / `6749` `Oa()` |
| 查询 | TanStack Query(`queryClient` 注入 scope,`staleTime: FIVE_MINUTES`) | `229439` `Ta(Q, ...)` |
| 国际化 | **react-intl**(`FormattedMessage` id/defaultMessage/description) | 全站 `Z`/`K` 组件 |
| 菜单/弹层 | Radix(DropdownMenu/Popover/tooltip)+ 浮层统一 `no-drag z-50 m-px` 菜单基类 | 实测 DOM |
| 拖拽 | **dnd-kit**(sortable tabs,`appShellTabInsertionPlacement` 碰撞数据) | `app-initial:227960-227994` |
| 布局测量 | 容器查询(`@container/app-shell-tab`、`@container review-header`)+ IntersectionObserver(strip 两端渐隐 mask) | 实测 DOM |

结论:WS 已有 dnd-kit;**需要新增 framer-motion**(panel 开合、tab 关闭的宽度锁定动画、launcher 条目 stagger 都靠它);状态库不需要复刻(不漏进 DOM),但**心智模型必须一致**(见下)。

## 二、架构(组件 vocab,bundle 实证)

`app-initial:229387` 的 AppShell 模块导出:

```
Root / LeftPanel / Content / Header / HeaderAction / HeaderContextMenuItem / HeaderToolbar
MainContentLayout / BottomPanel / BottomPanelTabs / BottomPanelTabsEmptyState
BottomPanelTabListAfter{,Sticky} / BottomPanelOutlet
RightPanel / RightPanelTabs / RightPanelTabsEmptyState
RightPanelTabListAfter / RightPanelTabListAfterSticky / RightPanelTabListBefore / RightPanelOutlet
DetailPanel / DetailPanelLoading / DetailPanelOutlet
```

**槽位注册模式**:`RightPanel*` 系列组件本身渲染 `null`,靠 `KP(scope, slotAtom, children)` 把内容写进 scoped store(`app-initial:228752-228784`):

| 组件 | slot atom | 内容 |
|---|---|---|
| `RightPanelTabs` | — | 直接渲染 `uDr`(AppShellTabs) |
| `RightPanelTabsEmptyState` | `hUn` | 空态 launcher |
| `RightPanelOutlet` | `dUn` | 无 activeTab 时的内容 |
| `RightPanelTabListAfter` | `fUn` | strip 尾部(“+” 菜单) |
| `RightPanelTabListAfterSticky` | `mUn` | strip 尾部 sticky 区 |
| `RightPanelTabListBefore` | `pUn` | strip 头部 |

**Controller**:`nO`(right)/ `rO`(bottom)两个 tab panel controller,接口:
`tabs$` `activeTab$` `activeTabReactKey$` `tabStateById$` `panelId` + 方法
`openTab(scope, descriptor, {id,title,icon,defaultState,props,durableRoute,insertAfterTabId,activate})`
`closeTab(scope,tabId)` `closeActiveTab(scope)` `activateTab(scope,tabId)` `pinTab(scope,tabId)`。

**Tab 是描述符对象**:`{tabId, dndId, title, icon, highlightedIcon, isClosable, isLabel, isPreview, isHighlighted, tooltip, trailingContent, requiresWorkspaceReady, renderPanel(scope, requestClose)}`。
- **isPreview**:预览 tab(斜体标题),双击 tab 或在面板内 pointerdown/keydown 会 `pinTab`(`app-initial:208423-208452`)。
- tabId 实测:Review = `diff`(常量 `YD.DIFF`);Files = `file:local:`(空 path 时长这样);Browser = 随机 UUID。
- Review tab descriptor(`app-initial:477039` `F3o`):`{id: YD.DIFF, icon, title: thread.sidePanel.diffTab=“Review”, durableRoute, defaultState, props:{}}`。

**AppShellTabs**(`KCr`,`app-initial:208257`):props `{afterList, afterListSticky, beforeList, emptyState, headerHeight: 'toolbar'|'pane', controller}`。
渲染 `div[data-app-shell-tabs=true]` = strip(`zCr`)+ 面板区:
- 有 activeTab 且 workspace ready → `QCr`(面板包装,**error boundary 名叫 `AppShellTabPanel`**,fallback “Tab content couldn't render / Try again”)
- ready 但无 activeTab → `div.relative.min-h-0.flex-1 > emptyState`
- 未 ready 且 tab 要求 workspace → “Available when the worktree is ready”

**右面板 aside**(`EJr`,`app-initial:226772`):
```
aside.relative.z-[41].h-full.min-h-0.min-w-0.shrink-0.overflow-visible.ltr:ms-auto.rtl:me-auto
  [data-app-shell-focus-area=right-panel]  motion style: opacity + width
├ !fullWidth && div.w-px.shadow-[-8px_0_16px_-8px_rgb(0_0_0/0.18)]   ← 投影,aria-hidden
├ !fullWidth && ResizeHandle(edge=left)
└ div.absolute.inset-0.min-h-0.min-w-0.overflow-hidden
  └ motion.div.absolute.top-0.bottom-0.left-0.min-w-0.bg-token-main-surface-primary
     (!fullWidth && border-l border-token-border-default)  style minWidth/width 同值
    └ div.h-full.min-h-0.min-w-0.overflow-hidden.[contain:layout_paint]
        [--thread-content-top-inset:calc(var(--spacing)*8)]
```
⚠️ 当前 WS 的 `RightPanel.tsx` 层级已与这里一致(含 z-[41]/z-40/z-30),**但 aside 无 aria-hidden 投影的 fullWidth 条件、无 motion 动画**。

## 三、实测数值(视口 1512×895,侧栏 340)

| 项 | 值 | 证据 |
|---|---|---|
| 默认宽(重开恢复) | 320 | 实测 |
| 最小宽 | **320**(`AHn` clamp:`max(min(320,max), min(desired,max))`) | `app-initial:170128` |
| 折叠阈值 | **160**(`WHn(320)=320*0.5`;`JHn=0.5`)。160..320 是死区钉 320,<160 拖放即关 | `170182` + 实测 160→钉住/142→关闭 |
| 最大宽 | `max(320, mainContentWidth - 352)`(`FHn`,regular 模式 `HHn=352`) | `170158`;实测 1512 视口拖到 920 顶住 |
| full-width 最大 | `max(320, mainContentWidth)`(不扣 352) | 同上 |
| 默认宽公式 | `defaultWidth===600`(哨兵)时 `max(320, min(shellHeight*1.6, main-500), min(640, main-352))` | `kHn` `170123` |
| 持久化 | localStorage key **`app-shell:right-panel-width:v3`**,存 **ratio**(0..1,`NHn`);>1 按旧版 px 兼容 | `jHn/MHn` `170133-170148` |
| Expand panel | 点击后 aside=全宽(实测 1272),viewport 挤到 0,`data-app-shell-right-panel-full-width=true`,手柄和投影消失,按钮变 “Restore panel width” | 实测 |
| 窗口断点 | 960 / 720(`VYr/HYr`):窗口 ≤720 时自动收右面板;≤960 联动侧栏 | `228173-228189` |
| 重开 | toggle 重开 = 320(本视口),tabs 全部保留 | 实测 |

侧栏同构:折叠阈值 `WHn(240)=120`(`226748`)。

## 四、Tab strip(DOM 逐层,实测)

```
div.h-toolbar.isolate.flex.min-w-0.shrink-0.select-none.items-center.bg-token-main-surface-primary.px-2.[contain:layout_paint]
├ div.my-auto.flex.shrink-0.items-center[role=presentation]        ← beforeList(全宽时放左 header 宽度占位)
├ div.relative.isolate.hide-scrollbar.flex.h-full.min-w-0.flex-1.scroll-px-1.items-center.overflow-x-auto
│   [data-app-shell-tab-strip-controller=right] style: scroll-padding-inline-end: <sticky宽>px
│ ├ div.sticky.start-0.z-10.h-full.w-0.after:…(左渐隐 mask,opacity-0/100 由 IntersectionObserver 切)
│ ├ span                                                     ← 第一个 observer 哨兵
│ ├ div.relative.flex.shrink-0.z-0  style: gap:3px; width: clamp(<n*90+g>px, calc(100% - <sticky>px), <n*160+g>px)
│ │ ├ div.contents[role=tablist]
│ │ │ └ div.@container/app-shell-tab.my-auto.relative.flex.shrink-0.items-center.overflow-hidden.contain-content
│ │ │     [data-app-shell-tab-controller=right][data-tab-id]  style: flex-basis:0;flex-grow:1;max-width:160px;min-width:90px
│ │ │   ├ div.flex.min-w-0.flex-1.items-center.pe-1
│ │ │   │ └ div.group/tab.relative.flex.h-7.w-full.max-w-39.shrink-0.items-center.overflow-hidden.rounded-lg
│ │ │   │     .bg-token-main-surface-primary.px-2.py-1[data-tab-id][role=button][tabindex=0]
│ │ │   │     style: --app-shell-tab-background: color-mix(in srgb, var(--color-token-foreground…) 5%, …)
│ │ │   │   ├ div.pointer-events-none.absolute.inset-0.z-0.rounded-md.group-hover/tab:bg-[var(--app-shell-tab-background)]
│ │ │   │   │   (.bg-[var(--app-shell-tab-background)] 仅 active)
│ │ │   │   ├ button.no-drag.relative.flex.flex-1.items-center.gap-2.z-10.text-sm.min-w-0.pe-3.5.text-token-text-primary
│ │ │   │   │   [role=tab]  ├ span.icon-xs…(图标)  └ span.relative.min-w-0.flex-1.overflow-hidden > span.block…text-start[data-state] «标题»
│ │ │   │   └ button[data-app-shell-tab-close-button][aria-label="Close X tab"]
│ │ │   │       .flex.size-5.items-center.justify-center.p-0.5.[&>svg]:icon-2xs.absolute.end-1.top-1/2.z-30.-translate-y-1/2
│ │ │   │       .@max-[4rem]/app-shell-tab:invisible          ← 容器查询:tab 太窄藏关闭钮
│ │ │   └ div.h-3.w-px.shrink-0.end-0.absolute.bg-token-border.transition-opacity.duration-basic
│ │ │       [data-app-shell-tab-separator=<id>][-index=<i>]   ← 非最后、非 active、非 active 前一项才 opacity-70
│ │ └ div.sticky.w-0.shrink-0.z-10 style: inset-inline-end:<sticky>px; margin-inline-start:-3px(有多 tab 时)
│ │     └ div.w-max.bg-token-main-surface-primary > “+” Radix 下拉(afterListSticky)
│ ├ span                                                     ← 第二个 observer 哨兵
│ └ div.sticky.z-10.h-full.w-0.after:…(右渐隐 mask)
└ div.my-auto.flex.shrink-0.items-center[role=presentation]        ← afterList:Expand panel 按钮 + 70px header spacer
```

- tab 宽:`clamp(n*90+(n-1)*3, 100%-sticky, n*160+(n-1)*3)`;关 tab 中锁宽(`lockedWidth`)。
- 中键点击 tab = 关闭(`onMouseDownCapture` `e.button===1`);双击 = pin preview。
- “+” 下拉就是 launcher 同一组 actions(Radix menu,`no-drag z-50 m-px … bg-token-dropdown-background/90`)。
- strip 本身是 dnd-kit droppable(id `app-shell-tab-strip:right`),tab 是 sortable(另一套绝对定位+transform 的实现 `fCr`,实测当前实例走的是静态 `BCr` 变体)。
- `headerHeight='pane'`(底部面板/Files 内部)用 `h-toolbar-pane`,右面板 strip 用 `h-toolbar`。

## 五、Launcher(空态,`thread-app-shell-chrome` 的 `In`/`hr`)

actions 由 hook 按条件组装,git workspace 下排序 `{review:0, terminal:1, browser:2, 'open-file':3}`:

| id | 标题 | 快捷键 | 条件要点 |
|---|---|---|---|
| `review` | Review | ⌃⇧G(`openReviewTab`) | workspace 是 git 且没有已开的 diff tab |
| `terminal` | Terminal | 无显示(`toggleTerminal`= Ctrl+` 由 host 处理) | 非特定路由 |
| `browser` | Browser | ⌘T(`openBrowserTab`) | browserSidebarEnabled |
| `open-file` | Files | ⌘P(`searchFiles`) | 非 projectless 且有 workspaceRoot |
| `side-chat` / `timeline` / MCP 工具 | Side chat / Detail / 各 MCP | — | 条件出现 |

DOM:`div.flex.h-full.min-h-0.flex-col.overflow-x-hidden.overflow-y-auto.p-2.select-none`
→ `motion.div.flex.w-full.flex-1.flex-col.justify-center`(stagger variants)
→ `div.sticky.top-0.z-10.flex.flex-col.gap-6` → `ul.mx-auto.flex.w-full.max-w-xl.flex-col.gap-1.px-panel`
→ `li.w-full`(motion)> `button.cursor-interaction.flex.min-h-10.w-full.items-center.gap-2.rounded-md.bg-token-bg-fog.px-2.5.py-2.text-start.hover:bg-token-list-hover-background.focus-visible:outline.focus-visible:outline-2`
→ `span.icon-xs…text-token-text-secondary` + `span.min-w-0.flex-1.truncate.text-sm.font-normal.text-token-text-primary` + (有快捷键时)`span.ms-auto.shrink-0.ps-2.text-token-text-secondary > kbd.inline-flex.!rounded-md.!border-0.!bg-current/10.…`。

无任何可用 action 时:`rounded-lg border border-token-border-default p-3` + “No tabs are available for this chat”。

## 六、四种 tab 的面板结构(实测)

公共:`div.relative.min-h-0.flex-1.outline-none[role=tabpanel][aria-label=<标题>][data-app-shell-tab-panel-controller=right][data-tab-id][tabindex=-1]`。

**Files**(`file:local:`):`nav[aria-label="File path"]`(面包屑 `ol` + `Toggle file tree` 按钮,`h-toolbar-pane` + border-b)→ 主区 `div.flex.min-h-0.flex-1`:左预览(空态 “Open file / Select a file from the workspace tree”,32px 图标),右文件树 `div.relative.flex.h-full.shrink-0.border-l[max-width:60%]`(宽 250,带 ResizeHandle)→ 过滤框(`input#workspace-directory-tree-search`)+ **`<file-tree-container data-file-tree-virtualized="true" style="--trees-item-height:28px">`** 自定义元素(虚拟化树)。

**Review**(`diff`):`grid-rows-[auto_auto_minmax(0,1fr)]` → header(`[container-name:review-header]` 容器查询,625px 断点;Branch 选择器、+add/−del 统计(git-decoration token)、Review options / Collapse all diffs / Jump to file(popover)/ Switch to split diff / Hide files / Commit or push + More Git actions、base→head 比较行)→ 空行 → 列表(`[data-app-action-review-scroll]`,每个文件 `div[data-review-path] > div.group/file-diff`,sticky header `backdrop-blur-sm` + 88% 表面色,icon sprite `<svg data-icon-sprite>`);右侧同样有 250px 文件树(Hide files 切换)。

**Browser**(UUID):`grid-rows-[auto_1fr][data-browser-sidebar-chrome-expanded][data-browser-sidebar-primary-focus-target]` → 工具栏 `h-toolbar-pane border-b`(Back/Next/Reload、地址栏 `group/address-bar h-[28px] rounded-[10px] ring-1 ring-inset ring-token-border` + `input[data-browser-sidebar-address-input]` + `Open in external browser`、Annotate、Browser options(radix))→ 内容区(空态 “Start browsing / Enter a URL to open a page”)。页面内容由**独立被控 browser target** 渲染(实测打开后出现第二个 CDP page “Browser comment”),不是 webview/iframe。

**Terminal**:本实例点不开(host 消息 `windows.terminal.toggle` 由 Electron 宿主处理,bundle 里有 `nushell`/`powershell` 语法 chunk 旁证终端真实存在;渲染载体未取证)。

## 七、命令与快捷键(command registry,bundle 实证)

| command id | 键 | 说明 |
|---|---|---|
| `openReviewTab` | ⌃⇧G | 开 Review tab |
| `openBrowserTab` | ⌘T | 开 Browser tab |
| `toggleBrowserPanel` | ⌘⇧B | |
| `searchFiles` | ⌘P | 开 Files tab |
| `toggleTerminal` | Ctrl+` | host 处理 |
| `toggleSidePanel` | ⌘⌥B | 右面板开合 |
| `toggleMaximizeSidePanel` | — | = Expand/Restore panel |
| `toggleFileTreePanel` | ⌘⇧E | Files/Review 内的树 |
| `close-active-app-shell-tab` | (⌘W 系) | 对 right/bottom 两个 controller 分别 `closeActiveTab` |
| `nextTab` / `previousTab` | — | tab 切换 |

## 八、与 WS 现状的差距(逐条)

> **2026-08-23 第二轮更新:1–11 已全部落地**(AppShellProvider 接管、DockedTabPanel/PanelContext 已删)。
> 本轮新逆向补进 spec 的要点见下方「十、第二轮实测修正」。

**剩余差距:**

12. Files tab:外壳/面包屑/空态/树列边界已对齐;**树本体仍是 react-arborist 原型** —— Codex 是过滤框(`input#workspace-directory-tree-search`,placeholder "Filter files…" + sr-only label "Filter files")+ `<file-tree-container data-file-tree-virtualized="true" style="--trees-item-height:28px">` 自绘虚拟树(带 `data-tab-preview-pin-exempt`,点树不 pin 预览 tab)。面包屑中间段在 Codex 里是可点进目录的链接(c0a),WS 暂为纯文本。文件打开态的 nav 右侧控制组(MSo:options menu/git blame/word wrap 等)未取证。
13. Browser tab:工具栏/地址栏/空态/进度条已对齐。Annotate 按钮按实测空闲态渲染(disabled、容器 opacity-0),标注能力未实现;Browser options 菜单未实现(8 项全是宿主功能);切换 browser tab 会重载 webview(Codex 由独立受控 browser 进程保活,WS 无对应物)。
14. Review tab:整缺。需要 git diff 数据源(WS 有 main 进程,可加 git 服务)。
15. Terminal tab:整缺。需要 PTY(node-pty 或等价物)+ 终端渲染(xterm.js)。
16. Side chat:整缺(需要第二条会话管线)。
17. tab 右键菜单未取证(controller 有 closeOtherTabs/closeTabsToRight,触发点未找到)。
18. 命令注册表(⌘T/⌘P/⌃⇧G/⌘⌥B 等快捷键 + xM/TM 命令分发)未实现 —— header 按钮直接调 toggle。


## 九、建议实施顺序

~~1. 框架(描述符 + controller + 槽位)~~ ~~2. framer-motion 开合~~ ~~Browser tab~~ 均已完成。

3. **Files tab** 完整对齐(自绘虚拟树替 react-arborist、过滤框、面包屑目录链接、文件打开态 nav 控制组)。
4. **Review tab**(git diff 数据 + header + 文件树 + 列表骨架)。
5. **Terminal tab**(PTY + xterm)。
6. **Side chat**(第二会话管线)。
7. tab 右键菜单 + 命令注册表 + 快捷键。

未取证项:Terminal 的 DOM(本实例无法创建)、tab 右键菜单项、tab 过多溢出时的滚动行为细节、文件打开态的 Files nav 控制组、底部面板在 Codex 的真实 DOM(本机点不开)。



## 十、第二轮实测修正(2026-08-23,bundle + 运行时双证)

**结构修正:**

1. **EJr(aside)的内容表达式是 `children + (activeTab == null ? outlet槽 : <RightPanelTabs/>)`** —— 不是「无 tab 渲染 outlet」。thread chrome(`Ar`)把 `<RightPanelTabs/>` 注册进 `RightPanelOutlet`(dUn)槽,所以两条路径默认渲染同一套;outlet 槽的存在是让 DetailPanel(`SXr`/`CXr`)能**覆写**整个右面板内容。`RightPanel`/`BottomPanel` 导出(eXr/sXr)本身渲染 null。
2. thread chrome 的注册清单:`<RightPanelOutlet><RightPanelTabs/></RightPanelOutlet>` 恒注册;ready 时注册 `RightPanelTabsEmptyState`(launcher)+ `RightPanelTabListAfterSticky`(「+」菜单);底部同构 + `BottomPanelTabListAfter`(Close 按钮)。**底部没有 TabListBefore 槽**。
3. **DndContext 在 MainContentSurface 层**(dnd-kit 播报节点 DndDescribedBy 是它的直接子代),右/底面板共用(跨面板拖拽的前提);strip 行里没有播报节点。droppable strip 的 data = `{controller, kind: 'app-shell-tab-strip'}`。
4. **`activeTabReactKey$` = `${kind ?? tabId}-${tabState.key}`** 是 tabpanel 的 React key:resetTabState 或跨 kind 切换才重挂载,同 kind(file tab 的 `workspaceFile:local`)之间切换不重挂载。

**行为修正(全部实测过):**

5. **关掉最后一个 tab → 整个面板关闭**(`S`:`h.length===0 && setPanelOpen(false)`;实测:关唯一 tab 后 aside 从 DOM 消失)。
6. openTab 仅当 `activate !== false` 才展开面板;**preview 替换时新 tab 继承被替换者的 dndId**;`updateTab` 不能反 pin(patch 的 isPreview:true 会被剥掉)。
7. closeTab 的接替激活 = opener 链(y1n) ?? **右邻居优先、否则左邻居**(p1n:`e[i+1] ?? e[i-1]`)。
8. **full-width 时面板宽 = mainContentWidth 整宽**(kJr:`n ? main : PHn(ratio,…)`)—— 不是把 ratio 重映射到 full 区间。
9. aside 开合动画:progress(0..1)弹簧 `{type:'spring',duration:0.5,bounce:0.1}`,**width = clamp01(progress) × 全宽 + opacity = progress**;`isMounted = isVisible || progress > 0`,animationComplete 后再评估卸载(UPr)。reduced-motion 直接 set。
10. Expand panel 按钮:full 态 `color: 'secondary'`(实测类 `text-token-foreground bg-token-foreground/5 enabled:hover:bg-token-foreground/10`),外包 Tooltip(delayOpen);「Toggle file tree」(Files nav)同样是 secondary/ghost 随状态切。
11. `RightPanelTabs` 的 beforeList:**full-width 且侧栏隐藏时**左端插 `headerLeftWidth` 宽占位(div.pointer-events-none.h-full.shrink-0)。
12. header 的 Toggle side panel(`jr`):**面板关 ∧ 0 tab ∧ 只剩 1 个可用 action → 直接执行该 action** 而不是开面板;按钮带 `aria-pressed`。
13. launcher 动画:容器 `initial={false} animate="open"`,variants xr(容器 y:-8→0/0.09s)/ Sr(ul stagger 0.016 + delay 0.012)/ Cr(li y:-6→0/0.075s),ease 恒 `[0.19,1,0.22,1]`(`Te.ease` = Qj);reduced-motion(`Ym`)全禁。kbd = `Nh`(inline-flex !rounded-md !border-0 !bg-current/10 !px-1.5 !py-0.5 !leading-none)。
14. 「+」菜单(`Or`):trigger 用 **title** 属性(非 aria-label)+ `outline-hidden data-[state=open]:!bg-token-foreground/5 data-[state=open]:!text-token-foreground`;`if (target==='right' && tabs===0) return null`(底部无此限制);带 `deferSelectionUntilDropdownClose` 的 action(open-file/browser)在 onCloseAutoFocus 才执行。
15. 底部面板(YPr/NYr):`motion.div[data-app-shell-focus-area=bottom-panel].relative.z-30`,高默认 280(BPr)、clamp `max(160, min(h, main*0.5))`(LPr)、拖 <80 关面板、持久化 `app-shell:bottom-panel-height`(像素,不版本化)。内容 NYr:`activeTab ? KCr(pane) : outlet`。
16. file tab(`HY`):tabId `file:local:<path>`、kind `workspaceFile:local`、defaultState `{scrollLeft:null,scrollTop:null}`、title 无 path 时 "Open file"(`review.fileSource.browser.tabTitle`)、icon 按文件类型(MV)、`onSelectFile` 换文件 = 开新 tab,**当前 tab 是空壳(无 path)时顺手关掉自己**。
17. Browser tab:新 tab**不加载主页**,空 URL = 空态("Start browsing / Enter a URL to open a page",无 h2),`data-browser-sidebar-primary-focus-target=address`(实测新 tab 地址栏自动聚焦)。

**环境陷阱(测 WS dev 必看):** Electron 窗口被遮挡/隐藏时 `document.hidden=true`,framer-motion 的帧循环**挂起**(弹簧会停在半 overshoot 值),CDP `Input.dispatchMouseEvent` 每个事件 ~5s 才消化。验证动画/拖拽前先 `Page.bringToFront` 并保持窗口可见。
