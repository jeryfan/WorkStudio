# 对齐 Codex:进度与工具

配套文档:`codex-sidebar-spec.md`(Codex 侧的实测规格)。
本文件记录 WorkStudio 侧改了什么、还剩什么。

## 工具链

| 脚本 | 用途 |
|---|---|
| `scripts/extract-codex-tokens.mjs` | 从 Codex 产物提取 6 层 CSS + `class-map.ts`。Codex 升级后重跑即可 |
| `scripts/cdp-eval.mjs` | 读运行中 WorkStudio 的计算样式 |
| `scripts/cdp-mouse.mjs` | 派发**真实**鼠标/键盘事件(合成事件过不了延时与指针捕获逻辑) |
| `scripts/cdp-drag.mjs` | 拖拽并报告中间态与最终顺序 |
| `scripts/cdp-screenshot.mjs` | 截渲染进程(`screencapture` 会截错窗口) |

dev 模式下主进程开 CDP 端口 **9333**(`src/main/index.ts`,仅 `is.dev`;9222 常被浏览器占用)。

## 已完成

**Token 层** — `src/renderer/src/assets/codex/` 六个生成文件:
`theme.css`(373 定制 token)、`semantic.css`、`runtime-light/dark.css`(运行时实测值)、
`app-theme.css`(699 个 `--vscode-*`)、`utilities.css`、`components.css`(798 条 CSS Modules)、
`highlight.css`、`class-map.ts`。

**主题机制** — `themeIpc.ts` + preload 暴露 `getSystemThemeVariant`/`subscribeToSystemThemeVariant`
(与 Codex 同名)。`<html>` 挂 `electron-light|dark` + `data-codex-window-type/os/window-chrome`。
只跟随系统,无应用内选择器。

**已删除**(被 Codex 的 `.app-theme` 取代):`gen-vscode-tokens.mjs`、`verify-vscode-theme.mjs`、
`tokens.css`(110KB)、`widget-tokens.css`、两个高对比主题 JSON。

**侧栏** — 宽度 340/240/520、四层嵌套首节、`<section>` + 属性驱动折叠、品牌行(切换器 + Search)、
footer 层级归位 + 透明 + 发丝线、会话行(跑马灯标题 / 静态状态点 / 无时间戳)、
项目行(命名 group `/folder-row` / DnD 放置区 / `button.sr-only`)、
两个悬浮面板 + 内联改名、浮层层级 `overlay-light|heavy`、dnd-kit 接入。

**右/底面板(2026-08-23 收尾)** — 旧 `PanelContext` + `DockedTabPanel` 已删,全面切到
Codex 架构:`state/AppShellContext.tsx`(controller 工厂 + tab 描述符 + 槽位注册 KP)
+ `panel/AppShellTabs.tsx`(KCr)/ `AppShellTab` / `AppShellTabPanel`(QCr error boundary)/
`RightPanelTabs`(uDr)/ `BottomPanelTabs`(ewr)/ `slots.tsx` + `layout/RightPanel.tsx`(EJr,
常驻 + UPr 开合弹簧)+ `layout/BottomPanel.tsx`(YPr)。
行为逐项对齐:末 tab 关闭连带关面板、preview 继承 dndId/双击 pin/面板交互 pin(豁免区)、
updateTab 防反 pin、activeTabReactKey 重挂载键、workspace-ready 门控、expand 全宽 =
mainContentWidth 整宽、宽度 ratio 持久化(`app-shell:right-panel-width:v3`,拖过 160 不持久化)、
headerLeftWidth 占位(全宽且侧栏隐藏)、launcher 动画(xr/Sr/Cr + ease [0.19,1,0.22,1] +
reduced-motion 全禁)、「+」菜单(title 属性 + defer-on-close + 右面板 0 tab 不渲染)、
DndContext 上移到 MainContentSurface(右/底共用)。

**2026-08-24 第三轮(Files 域 + 菜单/快捷键 + side chat 落地)**:
- **文件树 = @pierre/trees@1.0.0-beta.6**(Codex bundle 里的 `file-tree-container` 就是这个包,
  逐字节对上;react-arborist 已删)。`panel/file/FileTreeView.tsx` 复刻 Codex `N1a`
  (配置逐项:stickyFolders/hide-non-matches/28px/unsafeCSS token 覆盖块);
  数据流 = `directoryEntries.ts`(Codex `a0a`:root + 各展开目录聚合,目录带 `/` 后缀,
  结果内容级缓存对齐 structural sharing)+ `treeState.ts`(Codex `cpo` 族:per-root
  {expandedPaths, scrollTop, searchQuery, selectedPath})。
- **树列全局化**(Codex `hyo`):开合 = 全局持久化 `app-shell-file-tree-open`(默认关),
  宽度全局内存值 250,min 200 / 折叠 100 / max 60%;UPr 同款弹簧。
- **面包屑下拉**(`c0a`/`l0a`):每段(含末段文件名)都是 Popover 触发,
  384×320(w-96 h-80),内含同一 FileTreeView(surface='dropdown');项目名段列根目录。
- **nav 控制组**(`MSo`):File viewer options(Copy path / Copy file contents / word wrap
  全局 `wrapCodeDiff.2`)+ Open in 分割按钮(`Sia`,主进程探测已安装编辑器,28 个 Codex
  原版图标已提取到 assets/apps/;Save as… = saveCopy;Open in folder;首选持久化
  `file-source:preferred-open-target`)。
- **文件图标**:Codex `MV`/`EQi` 全量复刻(27 种,`icons/fileTypes/`,提取脚本
  `scripts/extract-file-type-icons.mjs`);tab 图标按扩展名取;树图标走包内 complete 集。
- **tab 右键菜单**(Codex `ZSr` + `gv`):描述符自带项 + Close/Close other tabs/
  Close tabs to the right;Electron 走原生菜单(新增 `codexBridge.showContextMenu`,
  主进程 Menu.popup);文件 tab 自带 KXi 组(Open in/Open with/Save as/Copy path/
  Copy file contents/Reveal in Finder)。controller 补 closeOtherTabs/closeTabsToRight/
  onBeforeClose/onClose。
- **Browser options 菜单**(实测 13 项全渲染):Find in page(自绘 find bar,
  Codex 的查找条在宿主叠加层,DOM 不可取证,标注推断)/ Zoom 组(Chromium 档位,
  per-tab zoomPercent)/ Take a screenshot(capturePage + 保存对话框)/
  Clear browsing data ▸(cookies/cache,persist:browser 分区)/ device toolbar·
  import·passwords·downloads·settings 渲染但 disabled(Codex 受控浏览器/设置页能力,
  WS 无对应物,不做假实现)。
- **命令注册表**(`state/commands.ts` + `components/command/AppCommands.tsx` +
  主进程 `commandIpc.ts`):命令定义子集(⌘T/⌘P/⌘⌥B/⌘⇧E/⌘J/⌘⌥S/⌘W/⌃Tab 等),
  键位表同步给主进程,before-input-event 命中 → `codex-command` IPC → runCommand
  (对齐 Codex 宿主 accelerator → 宿主消息 → `_m` 的链路;`TM`/`xM` =
  useCommandHandler/runCommand;`Po(yM)` = commandKeybindingLabel,launcher/菜单的
  kbd 不再写字面量)。注意:**CDP 合成按键不过 before-input-event**,验证要用
  osascript System Events 发真实按键。
- **side chat**(Codex `local-conversation-side-chat` chunk 逐项):launcher/⌘⌥S/「+」
  进入;`thread/fork` + SIDE_CHAT_INSTRUCTIONS 逐字注入 + ephemeral;loading tab
  `sidechat-loading:`(isClosable=false)→ 真 tab `sidechat:<id>`;标题 "Side chat" /
  "Side chat {n}";fork 响应自带历史 turns 直接 seed(ephemeral 不落盘,resume 会报
  no rollout found;StrictMode 下 seed 进 ref 防重放丢失);面板当前开着才 activate;
  关 tab 丢弃(thread/delete);有过轮次关闭弹确认框(DOM 逐层对齐实测:420px
  codex-dialog + Radix checkbox + Cancel/Close side chat)"Don't ask again" 持久化
  `skip-side-chat-close-confirmation`。ChatRuntimeContext 重构出 `useChatRuntimeCore`
  + `SideChatRuntimeProvider`(审批经 `approvalBus` 按 threadId 路由,主/侧并存)。

**踩坑新条目:**
- **@pierre/trees 的模型回调捕获首渲染闭包** —— model 只建一次,onSelectionChange 等
  必须套 latest-ref(Codex 的 `jh` = useEffectEvent 同义),否则 tab 内容因
  activeTabReactKey 复用而不重挂载时,回调闭包里的 path 是上一个 tab 的。
- **openTab 必须幂等**(已有且已 active → 返回 prev)且**聚合 paths 引用要内容级稳定**
  —— 否则 树选中回调 → openTab → setDocks 新对象 → 重渲染 → 模型重发 selection →
  再 openTab 的嵌套更新风暴(Maximum update depth)。Codex 靠 signals 的结构共享免疫。
- **SidebarModeSwitcher 既有 bug**(本轮修复):内联 ref 回调里 setState —— ref 身份
  每次渲染都变,React detach/attach 循环触发 setState 死循环。已改 useCallback 稳定化。
- **Radix 菜单不吃合成 click**:DropdownMenu/Popover 的 trigger 要
  pointerdown+pointerup+click 序列;CDP 合成按键不过主进程 before-input-event,
  验证快捷键用 osascript System Events 发真实按键。

**Codex 侧未接(下轮):**
- Review tab(整缺,需要 git diff 数据源)、Terminal tab(需要 PTY)
- 文件 tab 富编辑器(Codex `Myo`:pierre code viewer、markdown 富预览、git blame)
- Browser:Annotate、device toolbar、cookies 导入、密码、下载管理、Browser settings
- side chat:生成中 tab 图标切 sparkle(Codex `je`)、composer 的 lockedCollaborationMode
- toast 系统(Codex 的 `yv`;side chat 打开失败现在只 console.error)
- tab 的 Review/Timeline 等其余描述符

**踩坑新条目:**
- **Electron 窗口隐藏时 framer-motion 停摆**(`document.hidden` → 帧循环挂起,
  动画卡在中途值;CDP 输入事件也要 ~5s 才消化)。验证动画/拖拽前先 `Page.bringToFront`。
- **CDP 多 target 陷阱**:Codex 开 Browser tab 后出现第二个 page target(被控浏览器),
  `cdp-eval.mjs`/`cdp-mouse.mjs` 需 `CDP_URL_FILTER=8214` 锁定 Codex 页面。
- **槽位注册的 children 必须是稳定引用**(模块级常量),否则 registerSlot → setState →
  重渲染 → 再注册的死循环(Codex 靠 React Compiler memo cache 钉住,WS 手工钉)。

**2026-08-25 第四轮(侧栏全层级对齐 + 菜单 Radix 化)**:对侧栏逐层与运行中 Codex
(CDP :9250)对比后修正:
- **菜单全部换成 Radix DropdownMenu**(Codex 原生就是 Radix,证据 `data-radix-menu-content`/
  `aria-labelledby`/radix id)。删掉自绘 `DropdownMenu`/`menuDefs`/`OverlayContext.menu` 通道。
  新增 `menu/CodexMenu.tsx`(外壳/项/单选项/标签/分隔线,类逐字实测)。
- **分节 options 菜单**改为 Codex 实测的两个单选组:「Organize sidebar」(By project/In one list)+
  「Sort chats by」(Priority/Last updated/Manual order),按分节存 `projectSortMode`/`chatSortMode`。
- **organize=list 平铺模式**:Projects 分节消失、导航区多一个「Projects」行、全部未置顶会话进 Recents。
- **状态槽语义按 Codex `b8` 重做**:进行中=spinner(`$m`,2000ms、挂载负 delay 错相)、
  未读=蓝点、报错=**行首**错误图标(`sA`)。原先「运行中显示蓝点」是错的。
- **未读跟踪**:`thread/status/changed` active→idle/systemError 且非当前打开 → 标未读;
  `ChatRuntimeProvider` 在 activeChatId 变化时 `noteActiveChat` 清除。持久化。
- **折叠动画**改回 Codex `Qj`:300ms + ease [0.19,1,0.22,1],`overflow:visible` 走 transitionEnd。
- **header 发丝线 + 3 个 fade token 是滚动驱动**(实测 scrollTop>0 才出现):未滚动 1px/1px/0px,
  滚动后 var(--spacing)/calc(var(--spacing)*4)/var(--spacing)。`thread-active` 改为「当前打开」而非「运行中」。
- **DndDescribedBy/DndLiveRegion 移入 nav 内**(Codex 位置);分节折叠/项目展开持久化。
- 图标按实测替换:Pull requests(分支图→PR 图)、Add project(folder-plus→加号)、
  Edit project 用齿轮、新增 Full changelog/Help 救生圈/错误圆环图标;Pin/Unpin 的位移从内联 style 改 `translate-x-px` 类。
- 悬浮卡片:项目卡标题用 `GUc`(区别于会话卡 `WNc`)、Pin/Unpin 常驻、「N tasks」用 nbsp;
  会话卡仅项目内会话弹(无项目不弹,与 Codex `disableHoverCard` 一致)。
- 按钮变体拆分:options 触发器用带 `outline-hidden` 的 `IconButtonSm`,Add/New chat/行内按钮用素 `SidebarIconButton`。
- 已验证:滚动发丝线、各菜单开关/键盘导航、Search⌘K 与 New chat⌘N tooltip、折叠 300ms、
  平铺模式切换、项目/会话悬浮卡、长标题跑马灯。typecheck + eslint 干净,无运行时错误。
- **未移植(标注)**:help 菜单的 Keyboard shortcuts(Codex 弹快捷键总览层,WS 无此浮层)、
  Show pet(宠物功能)、Create permanent worktree(worktree 能力)、项目卡 marker 外观选择弹层、
  help 菜单的远端更新日志条目。侧栏会话右键菜单未确认(本机 headless 无法取证),未实现。

**2026-08-25 补:修「滚动时会话标题从透明 footer 后透出」**:
- 现象:侧栏滚到中/下部,会话标题在 footer(透明)后面直接可见;Codex 则在 footer 顶缘淡出。
- 根因:`.codex-headerFadeMask` 的 `mask-image` 依赖 `--sidebar-scroll-footer-fade-distance:var(--bottom-fade)`,
  而 `--bottom-fade` 由滚动时间线动画 `edge-fade`(`animation-timeline:scroll(self y)`)驱动;
  Electron 里该滚动动画未正常驱动变量 → 变量链计算期无效 → 整个 `mask-image` 变 `none` → 遮罩失效。
  (对照实验:内联 mask 能淡出、类 mask 计算为 none。)
- 修复:手写 `main.css`(在所有 codex/*.css 之后、无 layer)把 `--sidebar-scroll-footer-fade-distance`
  钉成常量 `calc(var(--spacing)*10)`,去掉对滚动动画变量的依赖,渐变恒有效;顶部渐隐仍交给滚动动画。
  已验证 0/0.3/0.6/1 各滚动位置遮罩均生效、footer 下方干净。
- 关于「Codex 滚动有 loading」:不是 WS 响应快,而是 **Codex 侧栏分页(infinite scroll)**——滚近底部拉下一页并显示
  加载 spinner 行;WS 一次性加载单页(≤200)不消费 `nextCursor`,无滚动加载触发,故无 loading。属数据流差异,未实现。


## 关键陷阱(踩过的)

1. **`@theme` 会被提进 layer,无层级规则恒压它** —— `app-theme.css` 必须剔除 `@theme` 已有的键,
   否则 `--padding-row-y` 用错值,**全应用每行高 2px**。
2. **CSS Modules 重名类不能统一改写** —— `Icon`/`Root`/`content` 等 7 个 base 名在多模块重复,
   无条件改写会合并无关样式。重名的保留哈希,JSX 引 `CODEX_CLASS` 常量。
3. **at-rule 包装不能拍平** —— `@media (forced-colors)` 里的规则被拍平后无条件生效,压掉 hairline。
4. **内联样式压不过普通类** —— react-resizable-panels 写 `overflow:auto`,需 `overflow-visible!`。
5. **合成事件测不了交互** —— `setPointerCapture` 和延时逻辑都不响应,必须用 CDP 真实事件。
6. **改视口会污染宽度测量** —— 结构/高度/颜色不受影响,宽度类数字必须标注采集条件。

## 待办

**需要数据条件**
- Show more(`data-app-action-sidebar-project-show-all`)阈值 —— 压缩代码里挖不到,
  当前 Codex DOM 里也不存在,等它自然出现时抓
- 会话行状态点在**待审批 / 报错**下的样式 —— 需挂 MutationObserver 录完整任务周期

**可直接做**
- 拖拽排序端到端验证(需 ≥2 个项目)
- 会话行也纳入拖拽(id 用 `codex:thread:<id>`)
- `Project actions` 菜单:`Rename project` → `Edit project`,Pin/Unpin 改状态相关
- Edit project 弹窗(520×309,规格见 spec 文档)
- Composer(Phase 2 欠的)
- resize handle 视觉(16px 热区 + hover 淡入渐变线)

**Phase 3 换库**(每个都会漏进 DOM 影响视觉)
monaco-editor(5.1MB,最大单块)、react-virtuoso、react-resizable-panels、
react-arborist、@vscode/codicons → 均替换为 Codex 的实现方式

## 2026-08-24:Composer 逆向复刻(输入框 + 排队 + 触发菜单)

**范围**:对话输入框全家桶(home / thread / side chat),源码逆向 + 运行时对照。

### A 块:结构纠错(对照 Codex 运行时实测)

- **thread/side-chat 不再渲染 utility bar**(项目/运行位置/分支 pill 是 home 专属;
  Codex `showUtilityBar` 仅 home 为 true,运行时实测 thread 无此条)。
- `data-composer-utility-bar-variant` 改 `'home'|'default'`(原误传 placement 值);
  `data-composer-surface-overflow` home=visible / thread=auto;根类 thread=`min-w-0`、
  home=`min-w-0 w-full`;补 `data-above-composer-conversation-id`。
- **提交按钮模型**(Codex `HUs` + `submitButtonMode`):
  运行中且无文字→Stop(icon=Codex `Gh` 实心方块);运行中有文字→Steer;
  空输入不是 disabled 是 blocked(`cursor-interaction`+`opacity-50`);
  submitting 显示 spinner。
- 表面 root 加 Codex `D_o` 的 onMouseDown 点空白聚焦(含 `k_o` 交互元素排除选择器)。
- 属性补齐:`data-composer-navigation-target`(6 处)、`data-codex-intelligence-trigger`、
  `data-selected-reasoning-effort`(协议值,`effortProtocolValue` 逆映射)、
  触发器 `aria-haspopup/aria-expanded/data-state`。
- thread composer DOM 与 Codex 实测 81:81 行,差异仅属性顺序与 radix id。

### B 块:排队 follow-ups(宿主层队列,协议零改动)

- Codex 的队列**不在 app-server 协议里**(二进制 0.147.0 无 queue 方法/通知),
  是桌面宿主层客户端状态:`thread-queued-followups-changed` 为宿主桥事件,
  `thread-follower-set-queued-follow-ups-state` 是多客户端经宿主路由的同步消息。
  提交时才碰协议:出队 `turn/start`、Send now `turn/steer`。WS 队列放
  ChatRuntimeContext core(每会话一份,主会话与 side chat 各自独立)。
- `followUpQueueMode`('queue'|'steer',Codex 默认 'queue')入 SessionContext;
  运行中提交默认入队,菜单可切 steer。
- `QueuedMessageList`(queued-message-list chunk 移植):dnd-kit 排序
  (PointerSensor distance:6 + verticalListSortingStrategy,与 Codex 同款库),
  framer-motion 行进出动画(height/opacity 0.18s),暂停行 warning + Retry,
  ⋯ 菜单(Edit/Open in side chat/Turn on|off queueing)。
- interrupt 暂停队列("Queue paused because you interrupted" + Resume)。
  **关键时序:暂停标志必须在 rpc 之前置位**——服务端收到 interrupt 立刻推
  turn/completed,晚了消费循环会把队列排空(实测踩中)。
- side chat 支持 `initialMessage`(Codex `we()` 的指令后缀逐字照搬),
  队列消息可 "Open in side chat"(出队 + fork 带引用文本)。

### C 块:触发式弹窗(`/`、`@`)

- ProseMirror autocomplete 插件:state 对齐 Codex `{active, kind, trigger, from, query}`;
  `/` 限段首,`@` 段首或空白后;插件 state 为唯一事实源(reportAutocomplete 读
  getState,否则 Esc 关掉的菜单下一帧被重算弹回)。
- 菜单激活时插件拦截 ArrowUp/Down/Enter/Tab/Escape(先于 keymap,Enter 此时是选中)。
- `ComposerTopMenuShell` 按运行时抓取 DOM 逐层复刻(`_ComposerTopMenuShell`
  定位 `absolute left-0 right-0 bottom-full mb-2 z-50`,内联非 portal;
  `data-list-navigation-item`/`aria-selected`/逐字符标题 span)。
- 数据源:slash = 内置 Compact(thread/compact/start)+ skills/list;
  `@` = fuzzyFileSearch(150ms debounce)。选中插入 mention chip
  (PM atom 节点 `span.codex-ComposerMention`),提交序列化成协议
  `skill`/`mention` UserInput 变体(sendMessage/steer/startChat 全链路支持 UserInput[])。
- home utility bar 在菜单激活时隐藏(Codex `pn` 语义)。

### 已标记偏差(不影响结构)

- utility bar 进场动画未复刻(直接渲染 framer 终态内联样式;rAF 节流窗口下
  framer-motion 会卡 initial=隐形的坑,见下方踩坑)。
- 提交 spinner 路径 / Grip 六点 / 警告三角图标未逐像素确认(bundle 导出名压扁)。
- 队列消息纯文本(Codex 带附件/批注 context);队列面板行容器 `fe` 基础类未确认;
  "Edit message" 为取回 composer 而非行内编辑(桌面端行内编辑 UI 未确认)。
- mention chip DOM(`codex-ComposerMention`)为本地约定,Codex chip 结构未确认。
- Compact 动作仅验证调用路径,未核对服务端效果。

**踩坑新条目:**
- **mount-once 的 EditorView 不吃 HMR**:ProseMirror 编辑器在 mount effect 里创建,
  改插件代码后 HMR 只换模块不换实例,行为还是旧代码 —— 测插件改动必须先 reload。
- **CDP 合成事件测 React 状态有帧差**:点击后同一脚本里读断言必过期,
  状态变更与断言读取要拆成两次 CDP 调用(间隔 ≥300ms);否则极易误判为 bug。
- **`execCommand('delete')` 在 ProseMirror 里不可靠**(残留文本导致串联),
  清空用 `selectAll` + `insertText('')`。

## 2026-08-24 补:弹层样式系统对齐(slash/加号/模型/权限/项目选择)

**起因**:弹层与图标和 Codex 不一致。逐项从运行时 DOM 逆向后重写。

### 弹层容器(一处统一,全部生效)

- Popover 容器类换成 Codex 菜单原语:`no-drag z-50 m-px flex select-none flex-col
  overflow-y-auto px-1 py-1 bg-token-dropdown-background/90 text-token-foreground
  ring-token-border rounded-xl ring-[0.5px] shadow-xl-spread backdrop-blur-sm`。
- role 分两种:菜单列表 `role=menu`(模型/权限)、对话框 `role=dialog`(项目选择,cmdk)。

### 菜单项基类

`no-drag outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)]
text-sm … cursor-interaction`(旧实现 `rounded-[12.5px] text-[13px]` 是 prototype 的
旧样式,非 Codex 桌面端)。

### 各弹层

- **slash 菜单**:内置命令补 New chat / Reasoning(动态显示当前 effort)/
  Side(与 Compact 共四项,图标全部从运行时 DOM 提取);技能标题 =
  `interface.displayName ?? 名字推导`(分段大写 + 小词规则,"Chrome: Control Chrome"、
  "Code to Spec" 与 Codex 逐项一致);技能通用图标提取;Compact 带上下文用量环
  (12×12 svg,用量数据未接入恒空环)。其余 9 项内建命令待流程接入(图标已备)。
- **加号菜单**:从 portal Popover 改为 `_ComposerTopMenuShell` 内联菜单(mb-1,
  与 slash/@ 同族),吸顶分区 Add/Plugins/Files;Add 区 21×21 svg(提取),
  Plugins 区官方打包位图(提取至 assets/codex/plugin-icons,6 PNG + 1 SVG);
  删掉自创的 "Work in a project" 与 "Agents" 分区;焦点留在输入框、输入即过滤、
  Files 分区 debounce 搜索、选中文件插 mention chip、方向键/Enter/Escape 导航。
- **模型选择**:从"平铺列表 + effort 滑块"重写为 Codex 的双子菜单:
  根菜单 w-56 两行(Model/Effort,带当前值 + chevron),悬停右侧出子菜单
  (与父菜单顶对齐),选中带 check(effort 项 `data-reasoning-selected`),选中即关。
- **权限选择**:补中间档 "Approve for me"(never + workspace-write);
  标题改 "How should ChatGPT actions be approved?" + Learn more;
  Full access 警告色标题/描述/勾选。
- **项目选择**:重写为 cmdk 结构(sr-only label + combobox input + listbox/option
  + `aria-selected` 键盘光标 + 选中项 check + 底部 New project / Don't work)。

### 图标资产

- 18 个 composer 实测 SVG(icons/extracted/composer/):slash 13 内建命令 +
  技能通用 + 加号 4 项,全部从运行时 DOM 逐项提取(scripts/gen-composer-icons.mjs)。
- 7 个插件官方位图(assets/codex/plugin-icons/):Documents/PDF/Spreadsheets/
  Presentations/Template Creator/Computer(PNG)+ Visualize(SVG)。

### 答案备查:"是不是有两套样式?"

不是。差异三个来源:① 旧弹层是按 prototype 复刻的自创样式(已按 Codex 桌面端
实测重写);② 图标用了近似品(已换真资产);③ 数据差异:模型列表/技能/effort 档位
全部由后端 model/list、skills/list 驱动 —— 自定义 provider 只有一个模型时
Codex 的 Model 子菜单本来就是空的(实测如此),官方账号则列出 gpt 系列。
同一套样式系统,按账号数据渲染。

**踩坑新条目:**
- **Codex 子菜单锚点是父菜单而非触发行**:子菜单顶边与父菜单顶边对齐
  (side=right align=start),实现时取 `closest('[role=dialog],[role=menu]')` 的 rect。
- **vite 资源路径错一层就白屏**:`../../assets` vs `../../../assets`,
  报错只能在 vite dev 响应里看到(页面无声挂掉)。

## 2026-08-24 补2:首页整片白屏(高度链断裂)—— MainContentLayout 层级纠错

**现象**:新会话(home)页面主区全白,输入框/hero/建议卡 DOM 都在但一个不渲染。
根因不是 Composer —— 是 MainContentLayout 的路由容器顺序与 Codex 不一致:

- **Codex 首页**:`h-full.min-h-0.min-w-0.flex-1` > `flex.h-full.flex-col[vscode]`(flex 列)
  > `relative.min-h-0.flex-1`(路由容器,作为 flex item 拿到确定高)> `h-full.min-h-0`
- **WS 错版**:路由容器 `relative.min-h-0.flex-1` 与 vscode 层写反(路由容器在外),
  其父级是 block,`flex-1` 失效 → 路由容器高度塌成 0 → 内部 `h-full` 链全断 →
  `[container-type:size].overflow-y-auto` 滚动容器 0 高,把 141px 的 composer 整片裁掉。

thread 态结构与 Codex 一致(所以 thread 一直正常)。已按 Codex 实测顺序修正:
home/thread 两个分支分别渲染。截图验证:hero/建议卡/utility bar/composer 全部可见。

**踩坑新条目:**
- **DOM 健康 ≠ 渲染健康**。本次所有 CDP 断言(getBoundingClientRect/opacity/visibility)
  全部通过,页面照样全白 —— 中间容器 0 高 + overflow 裁剪不影响后代自身的 rect。
  **视觉验证必须有截图环节**(scripts/cdp-screenshot.mjs),elementFromPoint 命中祖先
  而非目标元素是"被裁剪/被遮挡"的信号。
- 修过一次的层级注释也可能是错的:旧注释断言的 Codex 顺序与本次运行时实测相反,
  以运行时为准并更新了注释。

## 2026-08-24 补3:侧栏拖拽丝滑化(MotionValue 化)

**起因**:侧栏 resize 拖拽卡顿。对照 Codex bundle(`Tkr` + `yJr`)发现三处不一致:

| 机制 | Codex | 旧实现 |
|---|---|---|
| 宽度驱动 | `motion.aside` + framer-motion MotionValue/spring,拖拽中 DOM 直写 60fps,不经 React 渲染 | 每次 pointermove `setSidebarWidthState` → 全 AppShellContext 逐帧重渲染 |
| 指针捕获 | `e.currentTarget.setPointerCapture?.(e.pointerId)` | 无 |
| 提交时机 | `didMove` 门槛,收手(onResizeEnd)才持久化;双击手柄复位 defaultSize | 每动一下都写 state(连带 lastWidth/open 联动),无双击复位 |

**修法(对齐 Codex)**:
- LeftPanel 的 aside → `motion.aside`,宽度 = `useSpring(useMotionValue(width),
  {stiffness:420, damping:45})`;React state 变化(开关/窗口)经 effect 同步进 MV,
  spring 顺带播开/关动画(Codex 开/关也动画)。
- usePanelResize:加 `setPointerCapture` + `didMove` 门槛(没拖动的点击不再触发
  onResizeEnd);拖拽中 LeftPanel 只写 MV,收手才一次性提交 React state;
  收手 <240(Codex `WHn(240)`)= 折叠。
- ResizeHandle 加双击复位(Codex `e.detail===2 → defaultSize`)。

**实测**(CDP 合成拖拽):340→460(跟随)、拖过阈值→0(折叠)、Show sidebar→460
(恢复)、双击→340(复位)、拖拽中内层 div 宽度不变(证明无 React 重渲染)。

**注意**:右面板/底部面板/文件树的拖拽仍是 per-move React state(同一 hook 路径),
如后续报告卡顿,同一 MotionValue 模式可平移(Codex 全部面板都是这一套)。

**踩坑新条目:**
- **Electron 后台窗口 rAF 节流会让 spring"看起来不动"**(本环境 rAF 600ms 仅 1 帧),
  拖拽中读到的宽度是旧值,收手后才跳 —— 前台使用无此问题,验证动画类行为要知悉。

## 2026-08-24 补4:utility bar 三个下拉(项目/运行位置/分支)

**项目选择器**:上一轮已对齐 cmdk 结构,本轮无改动。

**运行位置下拉**(新增 `RunLocationDropdown`,Codex `local-remote-dropdown` 实测):
- "Work in" 头 + Local(当前,check)/ Connect Codex web(`<a role=menuitem>` →
  openExternal chatgpt.com/codex/cloud)/ Send to cloud(禁用,实测同)。
- "New worktree" 未渲染(worktree 流程缺失,图标已提取备用)。

**分支下拉**(新增 `BranchDropdown` + `gitBranchService`):
- w-72,搜索框占位 "Search <project> branches","Branches" 标签,当前分支带
  check + "Uncommitted: N files"(git status --porcelain 实测行数),
  "Create and checkout new branch…"。
- 数据走协议 `command/exec`(git -C <root>),pill 改真实分支名(原硬编码 "main");
  非 git 项目 pill 隐藏(Codex 该处显示 "Create git repository",未实现,已标记)。
- **写操作沙箱教训**:默认策略下 git 写操作触发审批(首页无会话承载 → 永远挂着);
  `workspace-write` 沙箱禁止写 .git(cannot lock ref)。最终写操作用
  `dangerFullAccess`(用户显式发起的分支切换)。
- 实测:create+checkout 新分支(pill 同步)→ checkout main(同步)→ 清理,全链路通过。

## 2026-08-25:对话区「运行状态」对齐(`jr` + `ja` + 两张活动文案表)

**范围**:轮次运行中的每一种展示态 —— 思考行、探索中、工具在跑、被中断、
组表头被吸收、过程段折叠头。上一轮(commit `ec83b04`)把组、散文结果块、
推理归属做完了,状态机本身还是近似实现;这一轮按源码逐条改成移植。

### 纠正的三处机制错误

**① `showToggle` 的 `turnStatus == null` 不是"轮次没在跑"。**
把轮次组件(`local-conversation-turn` 的 `Oo`)的入参逐个对完:那个 `n` 是
**`voiceWorkActivity`** prop(同一处还有 `n === 'active'` / `n === 'terminal'`
两个比较,轮次状态枚举不长这样)。WS 没有语音,恒 `null`,恒放行。
`wo()` 的 `mn` 里也**没有** `!isTurnInProgress`。

真实行为:**最终回答一开始流式产出(且 phase 是 final_answer),折叠头就出现,
过程段随即收起**;不是等轮次跑完。上一版运行中一律不给折叠头,过程条目会在
回答下面多挂一阵。

顺带定死了 `Pe`(`wS` 那个按会话记的派生 atom,同时进 `preventAutoCollapse`
与 `Qt`)的取值:它若等于"轮次在跑",`Qt = H && (!P || !Pe)` 在运行中恒假,
而 `Qt` 正是 `isActivitySliceClosed` 的来源、又只在 `isTurnInProgress` 时被
`Yr` 读 —— 那个 prop 就成了穿过三层组件的死值。所以 `Pe` 常态为假,
`Qt` 退化成"回答已有内容"。

**② `isExploring` 不能从渲染单元反推。** Codex 对同一批过程条目跑**两条**管线:
`Gr`/`Jr` 产出渲染用的组,`jr` 只把连续的 read/search/list 收成 run 供状态机用。
上一版按"最末单元是组且成员全是探索类"近似,`[mcp, read, read]` 这种常见形态
就错:`Jr` 收成**一个**组(mcp 也可成组)→ `every(探索类)` 为假 → 表头从
"Reading foo.ts" 掉回 "Thinking"。已按 `jr` 移植(`renderUnits.ts`)。

`jr` 的第二个坑:`isExploring = isTurnInProgress && (!isAnyNonAgentItemInProgress
|| anyRunning)` —— **尾部探索段全跑完也可能算"探索中"**,只要回答还没开始流。
两次工具调用之间的空档不让表头闪一下,是刻意的。

**③ `ja` 返回四态,不是布尔。** `{thinking,isVisible}` / `{exploring}` /
`{planning}` / `{none}`,**分支顺序即优先级**。三个此前缺的入参补上了:
`hasActiveWebSearch`(尾部条目是检索)、`hasActiveDynamicToolCallSummary`
(`ko`+`Ea`:尾部连续动态工具里有没在跑的)、以及 `pi(assistantItem)`
**排在** `isAnyNonExploringAgentItemInProgress` **前面** —— 回答在流式产出旁白时
即使有非探索工具在跑,状态行也仍然出现(轮次组件里另一条 `On` 也走这个语义)。
`An`(挂不挂载)/ `W`(可不可见)/ `kn`(被组表头吸收)三个派生值一并落地,
`thinkingFallbackMessage` 现在只在 `kn` 时下传(否则组表头与底部状态行会同时
显示同一句推理标题)。

### 两张活动文案表(此前混用了一张)

同一条命令 Codex 在两处说两种话,这不是时态开关:

| 位置 | 源 | 例 |
|---|---|---|
| 活动行行摘要 | `toolSummaryForCmd.*` | `Searched for foo in src/renderer`(**完整路径**) |
| 组表头 active | `localConversation.toolActivity.active.*`(`og`) | `Searching files in renderer folder`(**目录名**,查询词不进句子) |

上一版 `GroupActiveLabel` 拿行摘要切第一个空格当 action/detail,措辞、参数形态、
切分点三处全错。现在 `og` 表移植到 `model/toolActivityLabel.ts`
(`activeExecLabel`),两段渲染成 Codex `YO`/`JO` 那两个 span(action
`whitespace-nowrap`、detail `min-w-0 truncate`);行摘要那张表补齐了
`Searched for {query} in {path}` / `Searched for files` / `Listed files in {path}`。
`ag` 的三态(`Running` / `Ran` / `Stopped {command}`)也在这张表里 ——
**中断文案是 active 表的一档,不是错误提示**。

### 数据形状:`commandKind` → `parsedCmd`

`TerminalToolData` 上那个 `commandKind` 枚举换成 Codex 同名的 `parsedCmd`
(带 `name`/`path`/`query`)。理由是上面两张表都要参数,而从 adapter 拼好的
一句话里反推不出来。read 行的路径因此能改成 Codex 的文件链接(`ES`,
`data-agent-activity-file-link`)—— 那一大串
`:not(:has([data-agent-activity-file-link]:hover))` 的 hover 规则此前一直没有
作用对象。

### 图标:`Fg` 的 exec 分支顺序

上一版把「中断 → 停止图标」提到最前面且对所有条目类型生效。源码是先看
`parsedCmd.type`(read/search/list_files),**再**看 interrupted,再看
`Yt(cmd)`(curl 拉外网 → 地球),兜底终端;patch / web-search / MCP 的图标
**从不**因中断换掉。被中断的 `Read foo.ts` 在 Codex 里仍然是书。
`Yt` 的三条排除正则(改了 HTTP 方法 / 带请求体 / `-d -F -T`)逐字照抄。

### 验证

- `scripts/verify-chat-adapter.mjs` 新增三段共 42 项:过程段折叠头(`wo`/`ca`
  三档)、两张文案表 + `Yt`、轮次运行态(`jr`/`ja`/`On`/`kn`)。全绿。
- `preview.html` 新增 6 个运行态样张(exploring 两形态 / 命令在跑 / 旁白流式 +
  命令在跑 / thinking 被组表头吸收 / 被中断),浏览器实测 DOM + 截图逐项核对:
  组表头 `Reading ChatView.tsx` 带流光、行内 `Read ThreadTurn.tsx` 带文件链接
  (同一条命令两种措辞,与 Codex 一致)、`Running npm run build`、
  `Stopped npm run watch` + 停止图标、`核对求值规则` 进组表头。
- typecheck(node + web)与 eslint 干净。

**踩坑新条目:**
- **预览页在 `/preview.html`,不是 `/`**。根路径是真 app 的 `index.html`,
  没有 preload 桥的 stub → `rpc/client.ts` 在**导入时**构造 RpcPeer 就抛
  `Cannot read properties of undefined (reading 'subscribe')`,页面全白且只有
  一行 console 报错。
- **HMR 会把活动行的展开状态带过去**(改 fixture 后组莫名是展开的),
  断言展开/折叠默认值前先 reload。
- 本机 agent 当前选的模型(`5.6 Sol`)与 provider(deepseek)不匹配,
  `turn/start` 立刻回 `The supported API model names are deepseek-v4-*` ——
  真会话驱动不了运行态,只能走预览页夹具。

## 2026-08-25 补:右面板 Files 门控 + side chat fork(工作区推导层缺失)

两个用户可见故障,根因不在渲染层,而在**上层缺了 Codex 的工作区推导**与
**fork 请求少了一个必需字段**。

### 1. Files 动作不显示 —— 门控读了 WS 自造的项目归属

Codex(`thread-app-shell-chrome` 的 actions hook `In`):

```js
b = W(he, _)   // Rk        → workspaceKind: 'project' | 'projectless'
p = V(pe)[0]   // DB ← JWi  → workspaceRoots[0]
A = b !== 'projectless' && p != null      // ← open-file 的唯一门控
actions = f.kind === 'git' ? [...de].sort(Rn) : de
```

- `workspaceRoots`(`DWi`):`o = projectRoots.length > 0 ? projectRoots : (runtimeWorkspaceRoots ?? [cwd])`
  —— **没有项目归属就退回会话 cwd**;
- `workspaceKind`(`getThreadWorkspaceKind`,app-initial:4654893):默认 `'project'`,
  只有 projectless 注册表命中、或 cwd 命中草稿目录正则 `N_n`
  (`.../Documents/Codex/<YYYY-MM-DD>/<slug>`)才是 `'projectless'`;
- 排序**只在 git 工作区生效**。

WS 之前是 `hasWorkspaceRoot = 会话.projectId ?? 侧栏选中项目 != null`,并且无条件排序。
后果:cwd 是个真仓库但没归到 WS 项目的会话(CLI/其他客户端建的会话)看不到 Files。

移植进 `state/threadWorkspace.ts`(`useThreadWorkspace`):`kind`(`VWi`)/`cwd`/
`workspaceKind`(`Rk`)/`workspaceRoots`(`DB`)/`workspaceBrowserRoot`(`Wrr`),
`N_n` 正则逐字照搬。`useSidePanelTabActions` 与 `AppCommands`(searchFiles /
openSideChat)改读它;side chat 的 cwd 从「项目根」改成 Codex 的 `f.cwd`。

### 2. 文件层的键:projectId → workspaceRoot

Codex 文件 tab 的 props 是 `{cwd, path, hostId, tabId, workspaceRoot, onSelectFile}`
(app-initial `HY`),`fs/*` 只吃绝对路径,**没有项目 id 这一层**。WS 之前
`FileService(projectId, relPath)` 内部再查 localProjects 快照解析根目录,
于是「有工作区但没项目」的会话根本开不了文件 —— 只改门控会得到一个空壳 tab。

因此把整条链的键换成 workspaceRoot 绝对路径:`FileService` 三个方法、
`createFilesTabDescriptor(controller, workspaceRoot, path)`、FileTab / FileNavbar /
WorkspaceTreePane / FileTreeView / FileBreadcrumbDropdown / FileViewerOptionsMenu /
treeState(键变成 Codex 的 `{hostId, includeHidden, root}` 形态)/ directoryEntries。
顺带删掉与 workspaceRoot 完全重复的 `rootAbsolutePath` prop 链和
`appServerFileService` 里的项目根缓存。`resolveInProjects` 换成 Codex `e$i` 的移植
`resolveInWorkspaceRoots`(命中多个 root 取**最长**的)。
面包屑首段的标签走 Codex `SAe({root, labels})`:项目名(按 root 匹配)优先,否则目录名。

### 2b. 路径表示:tab 层改绝对路径(与 Codex 完全一致)

Codex 的两层路径空间(8214 实测确认):

| 层 | 表示 | 证据 |
|---|---|---|
| 文件 tab(props / tabId) | **绝对路径** | `data-tab-id="file:local:/Users/…/agent-explore/.gitignore"` |
| 文件树 / 面包屑下拉 | **root 相对** | 树行 `data-item-path="src/"`、`build/builtin/package.json` |

换算点也照抄:树/下拉选中文件时 `Qp(root, rel)` 转绝对再交给 `onSelectFile`
(Codex `l0a` 的 `o(Qp(s, d0a(t, r)), {isPreview:!0})`),`fs/*` 与
`fuzzyFileSearch` 直接吃绝对路径/roots。

顺带把 Codex 的一整组路径原语移植进 `utils/workspacePath.ts`,不再手写:
`Xp` normalizePath / `tm`(`Su`) isAbsolutePath / `Zp` baseName / `D3e`
workspaceRootLabel / `Qp` joinPath / `qQi` relativeToRoot / `nb` relativeFrom /
`T3e` displayPathFor / `t$i` fileDisplayPath / `n$i` fileDisplaySegments /
`r$i` breadcrumbSegmentTargets / `e$i` resolveInWorkspaceRoots。

因此几处此前的近似实现被真实算法替掉:

- 面包屑段与可点性:原来是"首段=项目名、其余按相对路径切",现在是 `n$i` + `r$i`
  —— 显示路径的基准**先看 cwd**(文件在 cwd 里就以 cwd 为基准,否则 workspaceRoot),
  段与 root 相对段右对齐比对,对不上的段不可点,root 标签段的下拉列根目录。
- 面包屑首段的标签是 **root 目录名**(`D3e`),不是项目名 —— 上一版用项目名是错的
  (`SAe({root, labels})` 那套标签用在别处)。
- `Copy path` 复制的是**绝对路径**(Codex `KXi` 的 `l` 就是 tab 的 path)。
- `FileViewerOptionsMenu` / `FileTreeView` / `FileTab` 的 readFile 都直接给绝对路径,
  `fileService` 变成 `listDir(dir)` / `readFile(path)` / `searchFiles(roots, query)`
  的纯协议包装,root↔相对的折算收到查询层(`directoryEntries`,对应 Codex 的
  `workspace-directory-entries`)。

同时补上 `HY` 末尾漏掉的一个副作用:**新开空文件 tab 时强制展开文件树**
(`t == null && S == null && $Un(e, !0, {animate:!1})`)。之前树的全局开合是
持久化的 false 时,点 Files 得到的是一个连树都没有的空面板 —— 实测就撞到了。
为此 AppShellContext 补了 `setFileTreeOpen(open)`(Codex `$Un` 的 setter 形态),
并把三个打开入口(launcher / ⌘P / 会话文件引用 / tab 内选文件)统一走
`openFilesTab()` 这一条路径(Codex 侧同样只有 `HY` 一个入口)。

### 3. side chat 打不开 —— `thread/fork` 缺 `excludeTurns`

实测(拦 `appServer.request`):`thread/fork` 回 -32600
`ephemeral paginated thread/fork requires \`excludeTurns: true\``。
先开的 `sidechat-loading:` 占位 tab 在 catch 里被关掉,失败只走 console.error,
所以表现是「菜单项在、点了没反应、标签页也不出现」。

Codex 两层:上层 `we()` 传 `sideConversation: true` / `ephemeral: true` /
`addForkedSyntheticItem: false` + developerInstructions(`B`);下层 `VNn` 发
`thread/fork {threadId, path, cwd, threadSource, developerInstructions,
excludeTurns: true, ephemeral: true}`,**再 `thread/inject_items` 注入一条 user
消息**(边界文本 `KNn`,已逐字加进 `sideChatInstructions.ts`)。失败走 `HNn`
(`thread/archive` 掉半成品);关闭时的 `discard-conversation-from-cache` 只发
`thread/unsubscribe`(WS 之前还发 `thread/delete`,ephemeral 线程必然回
`thread is not persisted and cannot be deleted`)。

`excludeTurns` 不在 ts-rs 导出的 `ThreadForkParams` 里,但二进制 strings 里与
`threadSource`/`deferGoalContinuation` 同列,是真实线上字段 —— 在
`sideChatService.ts` 显式扩了一层类型,没动 `generated/`。副作用:fork 响应不再
带回继承的 turns(`turns: 0`),side chat UI 从空白开始(与 Codex 一致)。

### 验证

- Codex 运行时(127.0.0.1:8214,CDP)逐项对照:项目内会话 launcher =
  `Review / Terminal / Browser / Files / Side chat`(`Rn` 序);Recents 的
  projectless 会话 = `Side chat / Browser / Terminal`(**无 Files 且不排序**)。
- 本项目 dev 应用(CDP :9333)实测:
  - cwd 是 git 仓库、未归项目的会话 → `Browser / Files / Side chat`(git 序,
    Review/Terminal 未实现);点 Files → `fs/readDirectory` 打到
    `/Users/.../github/vscode`,树出真实条目;点文件 → tab
    `file:local:build/builtin/package.json`、`fs/readFile` 成功、面包屑
    `vscode / build / builtin / package.json`。
  - cwd 是 `~/Documents/Codex/2026-08-21/new-chat-2` 的会话(哪怕被拖进了 WS 项目)
    → `Side chat / Browser`,无 Files、不排序。
  - side chat:`thread/fork` → `thread/inject_items` 双双 ok,tab
    `sidechat:<id>` 出现并渲染会话;关 tab 只发 `thread/unsubscribe`。
- 绝对路径改造后再跑一轮:空文件 tab = `file:local:`(面包屑 `/`,树被强制展开);
  树里点 `.editorconfig` → tabId
  `file:local:/Users/…/github/vscode/.editorconfig`、标题 `.editorconfig`、
  面包屑 `vscode / .editorconfig`;过滤框搜 `build/builtin/package.json` 打开 →
  绝对 tabId + 面包屑 `vscode / build / builtin / package.json`;点面包屑
  `builtin` 段 → 下拉列出 `build/` 的一层(root 相对),选 `builtin/browser-main.js`
  → 绝对 tabId 打开。side chat 与 projectless 会话的门控回归复测一遍,行为不变。
- typecheck(node + web)干净;eslint src 下 0 error。

## 2026-08-25 补2:打开中文件的 fs/watch 链 + 行号跳转

### 先纠正一个说法

上一节末尾写的"`syncOpenTabs` 需要宿主 `set-open-file-tabs` 通道,WS 没有这条通道"
**不准确**。`set-open-file-tabs` / `set-open-review-file-source-tabs` 不是 Electron IPC,
是 Codex **渲染层内部**的 store 消息(`dm(...)` → manager 的处理表,app-initial:20648031);
真正跨进程的部分是 app-server 协议的 `fs/watch` / `fs/unwatch` / `fs/changed` ——
这三个 WS 一直有(`M.fsWatch`/`M.fsUnwatch`、`NOTIFICATION_POLICY['fs/changed'] = true`)。

所以缺的不是通道,是**渲染层这一层注册与分发**:文件 tab 只在挂载/换路径时读一次,
磁盘上被改了界面不会动。之所以一直没写,是文件查看器当初是按"只读快照"做的
(`readFile` 一次 → shiki 高亮 → 完),没有 Codex 那套 open-files 注册表。

### Codex 的链(逐段取证)

```
文件 tab 开/关 → v$i(scope, {excludeTab})                       # app-initial:9124191
  → dm('set-open-review-file-source-tabs', {conversationId, openFiles: l$i(N1n(scope))})
  → manager.setOpenReviewFileSourceTabs → setOpenFilesBySource → sync()
  → 每个 (hostId, 绝对路径) 起一个 fs/watch {path, watchId: `open-file-${uuid}`}
app-server 推 fs/changed {watchId, changedPaths}
  → getFileChangeMessages(watchId):
      reviewFiles → refreshMode==='manual' ? 'review-file-source-changed' : 'refetch-review-file-source'
      openFiles   → 'open-file-changed'（text-editor tab 用）
  → 查看器重读(h$i 重取 read-file 查询)
```
`l$i`/`u$i` 只收 `kind` 以 `workspaceFile:` 开头、props 里有 string `hostId`+`path` 的 tab;
`N1n` = 右面板 + 底部面板全部 tab;`getWatchPath` = `Qp(会话 cwd, path)` 且必须是绝对路径;
watch key 是 `kPn(hostId, path)` = `${hostId}\0${path}`;忽略窗口 `APn = 5000`ms。

### WS 侧实现

- `services/file/openFilesWatcher.ts` = Codex `jPn` 的移植:
  `setOpenReviewFileSourceTabs` / `removeConversation` / `sync()`(做差集,不 churn)/
  `startWatch`(watchId 同样是 `open-file-<uuid>`)/ `stopWatch` / `fs/changed` 分发。
- `components/panel/file/OpenFileTabsSync.tsx` = `v$i` 的接线:从两个面板的 tab 列表派生
  (Codex 是在 `HY` 与 tab 的 `onClose` 里 imperative 调,WS 用派生 effect —— 覆盖时机是
  那两处的超集;注销单独一个 effect,否则每次 tab 变化都会先注销再登记,把没变的文件
  也 unwatch/watch 一遍)。
- `FileTab` 订阅变更 → 重读 + 重新高亮(Codex 的 auto 刷新档)。
- `reviewFileSourceFromTab`(Codex `u$i`):WS 描述符没有 props 袋子,从 tabId 解析
  (格式的唯一来源仍是 `fileTabId`)——**这是与 Codex 的结构差异,见下方"仍存差异"**。

未移植(无对应物,不做假实现):`openFiles`(text-editor tab)与 `mcpResources` 两支;
`ignoreFileChangeEvents` + 5s 忽略窗口(它防的是"自己写盘触发自我刷新",WS 查看器只读)。

### 行号跳转(`initialLine`/`initialEndLine`)

`HY` 的 `line`/`endLine` 入参一路带到 props,并且 **`f = line != null || endLine != null`
时要 `resetTabState`**(同一个文件 tab 已开着时带行号再打开,不重挂载就不会重新露出行)。
WS 现在:`openFilesTab({line, endLine})` → 描述符 props → `CodePane revealLine`
(滚到该行,放在视口 1/3 处);`InlineAnchor` 里 `src/a.ts:12` 的行号以前只用于显示,
现在真的传下去了。Codex 富查看器的行范围选中带与 `onLineRevealHandled` 未移植
(属于 `Myo` pierre 查看器)。

### 验证(运行中的 dev 应用,CDP :9333)

- 在工作区根下放 `.ws-watch-probe.txt` → 树里打开 → 抓到
  `fs/watch {watchId:"open-file-<uuid>", path:"/Users/…/vscode/.ws-watch-probe.txt"}`,
  内容显示 `probe-before`;**在终端改写该文件 → 界面 3 秒内变成新内容**(收到
  `fs/changed` → 重读);关 tab → `fs/unwatch {watchId}`;探针文件已删除。
- churn 检查:同时开两个文件 = 恰好 2 次 `fs/watch`(两个不同 watchId)、0 次 unwatch;
  关掉其中一个 = 恰好 1 次 `fs/unwatch`,另一个 watch 存活。
- `fs/watch` 通路本身另做过一次裸探针(watch /tmp 文件 → 追加 → 收到
  `{watchId, changedPaths:[…]}`),确认协议侧可用后才动手写这一层。
- typecheck(node + web)干净;eslint src 0 error。

## 2026-08-26:加载态、header 槽让位、目录外模型名

三处都是「结构对了但真值来源接错」的类型,取证基线:8214 运行时 + `app-initial` / `local-conversation-thread` / `thread-scroll-layout` 三个 chunk。

### 1. header 两端槽:`width` 是**面板宽度**,不是内容宽度

Codex `cJr`(app-initial:6604632 起)逐字:

```js
style: { width: slotWidth, minWidth: `${fitWidth}px` }
// start: slotWidth = leftPanelAnimatedWidth
// end:   slotWidth = rightPanelAnimatedWidth   （kJr:full-width 时恒 0）
// fitWidth = 不可见测量副本的自然宽（headerLeftWidth / headerRightWidth）
```

header 是 `fixed inset-x-0` 横跨整窗,两端槽各预留**一个面板的宽度**,中段
(标题 + 三点菜单)才落在两个面板之间的净跨度里。`min-width` 是反向保底:
面板折叠(`width:0`)时槽仍要容下自己的按钮。

8214 实测(窗口 1200、侧栏 358.99):

| 状态 | start 槽 | end 槽 | 标题 x |
|---|---|---|---|
| 侧栏开 | `width: 358.99px; min-width: 180px` | `width: 0px; min-width: 70px` | 373 |
| 侧栏关 | `width: 0px; min-width: 214px` | 同上 | 222 |
| 右面板开 489 | 不变 | `width: 489.01px; min-width: 70px` | — |

WS 此前把**测量宽写进了 `width`** 且没有 `minWidth`,槽只有 ~180px,标题从
x≈188 起 —— 压进 340px 的侧栏里。这就是「会话标题和三点菜单从侧边栏开始」。

改动:
- `AppShellContext` 新增 `headerLeftWidth` / `headerRightWidth` /
  `leftPanelWidth` / `leftPanelAnimatedWidth` / `rightPanelAnimatedWidth` /
  `rightPanelProgress` / `rightPanelMounted`,全部是 **MotionValue**
  (对齐 Codex app shell 根 `AYr` 持有的那一组);删掉 `setHeaderSlotWidth`
  —— 测量副本的 ResizeObserver 直接 `.set()`,不过 React。
- 新增 `utils/usePanelReveal.ts`(Codex `UPr` + spring 常量 `WE`):
  0..1 progress 上弹簧,`animatedSize = clamp01(progress) × size`。
  **不是给宽度上弹簧** —— 拖拽中 progress 恒 1,宽度 1:1 跟手;
  弹簧挂在宽度上时面板边缘与 header 让位槽都会落在指针后面几帧。
  折叠时 `size` 仍取折叠前的宽度(`sidebarOpen ? sidebarWidth : lastSidebarWidth`,
  对齐 Codex 的 `I` —— 折叠只翻 `oD` 布尔而不写宽度),否则关闭动画会瞬间跳完。
- `LeftPanelFrame` / `RightPanel` 不再各自持有 MotionValue,改读 store;
  `RightPanel` 的 `isOpen` prop 删除(Codex `EJr` 同样读全局状态)。
- 顺手补齐 `cJr` 的三处细节:padding 类只在槽内有 entry 时加、start 槽有
  `align: end` 的 entry 时才补 `pe-2`、中段的 `aria-hidden` + `invisible`
  由右面板 full-width 驱动(`J($E)`)而不是写死 `"false"`。
- `RightPanelTabs` 两个 spacer 改 `motion.div` 消费同一份 MotionValue。
  Codex 的模板是 `` ap`max(0px, calc(${s}px)` ``(少一个右括号,Chrome 在 EOF
  处自动闭合数学函数并折叠常量,实测序列化成 `width: calc(70px)`);WS 把括号
  补齐,计算结果等价。

### 2. 加载态:blossom 流光,不是一行 `Loading…`

Codex `LocalConversationThread`(`local-conversation-thread` chunk)的返回值:

```js
vt = isResuming && !hasRenderableTurns && !(projectionMode && entries.some(e => !rc(e)))
return (!hasConversation && !isResuming) || (!gate416252813 && vt)
  ? <Loading fillParent debugName="LocalConversationThread.state" />
  : hasSubagentParent && !hasRenderableTurns
    ? <Loading fillParent debugName="LocalConversationThread.subagentTurns" />
    : <>…会话流…</>
```

loader 本体 `Jir` + `Uir`(app-initial:5721743 / 5723249),实测 DOM:

```
div.flex.items-center.justify-center.absolute.inset-0.bg-transparent   ← fillParent
└ div.flex.flex-col.items-center.gap-2
  └ div._Root_174ad_11.size-14 [aria-hidden]
    ├ svg.Base                              ← 21×21 OpenAI blossom,实色底
    └ div._Overlay_174ad_48 [mask-image=同一个 svg 的 data URI]
```

`_Overlay` 是 112° 高光渐变 + `2.2s cubic-bezier(.4,0,.2,1) infinite` 的
`_shimmer_174ad_1`(background-position 140% → -105%),reduced-motion 下停掉。

新增:`components/icons/BlossomIcon.tsx`(Codex `Jh`)、
`components/icons/blossomMask.ts`(Codex `Pir` + `$k`,遮罩要 URL 不能要 React
元素,所以同一个标记必须存两份,连缩进换行都照原样 —— DOM 里的 `%0A%20%20` 就是它们)、
`components/loading/BlossomShimmer.tsx`(`Uir`)、
`components/loading/LoadingIndicator.tsx`(`Jir`,overlay / fillParent / 裸三档)。

**结构纠正**:`div[data-thread-find-target="conversation"]` 的归属。Codex 的
`ThreadScrollLayout`(`thread-scroll-layout` chunk)只渲染 `[data-mcp-app-portal-target]`
外壳并把 `children` 直接放进去,消息流容器归 `LocalConversationThread`;
加载时 loader **替换**整个消息流容器、成为 portal target 的直接子元素,才能
`absolute inset-0` 居中。WS 之前把消息流容器焊在 `ThreadScrollContainer` 里,
loader 只能塞进流里变成顶部一行字。现在容器移到 `ChatView`(含 readOnly 提示),
`ThreadScrollContainer` 只留外壳;`preview.tsx` 同步。
`SideChatLoadingTab` 换成同一个组件同一档 —— Codex 的
`LocalConversationSideChatLoadingTab.pending` 就是 `<Loading fillParent/>`。

**顺带修掉一个 token 层缺陷**:`extract-codex-tokens.mjs` 的 `ownDecls` 会丢掉
所有空值声明(否则 Tailwind 解析 `@theme` 报 "Invalid custom property"),
连 `--lightningcss-light/-dark` 这对 light-dark() polyfill 一起丢了。
Codex 把它们定义在 `.electron-light` / `.electron-dark`(app-DuLjgNkx.css),
而 blossom 的底色与高光全靠这对变量选支:

```css
--openai-blossom-shimmer-base:
  var(--lightningcss-light, color-mix(… 24%, transparent))
  var(--lightningcss-dark,  color-mix(… 68%, transparent));
```

少了它们两个 `var()` 都取不到值 → 整条声明失效 → 底色变成**不透明**前景色、
扫光渐变 computed 成 `none`(实测)。现在提取器把这一对写回 `semantic.css`
的两个主题块首行(普通 CSS 规则,不过 Tailwind 的 token 解析器)。

### 3. 目录外模型显示 `Custom`,不是原始 slug

Codex `XVs`(app-initial:15844140 附近):

```js
oe = models.find((m) => m.model === selectedModel)
label = oe?.displayName ?? intl.formatMessage({
  id: `composer.mode.local.model.custom`, defaultMessage: `Custom` })
```

WS 之前在 `SessionContext` 里给目录外的模型合成 `displayName = id`,于是界面上
出现 `gpt-5.5` / `deepseek-v4-flash` 这种裸 slug。现在按上面的链走:
命中目录 → 用目录的 `displayName`;不命中 → `Custom`。
`aria-label` 仍是 `Model <原始 id>`(与 Codex 一致:原始 id 只进无障碍名)。

顺带回答「输入框默认模型为什么是 gpt-5.5」:**不是写死的**,`src/` 下 `gpt-5` 零命中。
它来自 `~/.codex/config.toml` 顶层 `model`,经 `loadConfigDefault()` → `config/read`
→ `resolveSelection(null)`(首页无线程时直接用 config 默认)。换成 deepseek 后
同一条链读出 `deepseek-v4-flash`。

> 一处需要留意的取证陷阱:8214 那个实例的模型子菜单是**空的**,所以它把
> `deepseek-v4-flash` 显示成 `Custom`;WS 的 `model/list` 能返回
> `model_catalog_json` 里的两个 deepseek 条目,所以显示 `DeepSeek V4 Flash`。
> **两边走的是同一条代码路径,差异只来自数据。** 8214 是第三方 codex-web 宿主,
> 它的 host 侧模型目录接线不完整,不能当成官方 Codex 的行为。

### 验证(运行中的 dev 应用,CDP :9333 + preview :5199)

- 会话切换:MutationObserver 抓到三态 —— `conv` → `loader`(t+221ms,
  wrap = `flex items-center justify-center absolute inset-0 bg-transparent`)→
  `conv`(t+329ms)。位置与类名与 8214 实测帧一致。
- header 槽连续四次侧栏开关:`width` 与 aside 宽度逐次同步
  (`0px`↔`340px`,`min-width: 180px` 恒定),标题 x 在 194 ↔ 354 之间切换。
- 右面板:关 → `width: 0px`;开 → `width: 435.793px`;Expand panel(full-width)
  → **`width: 0px`** 且中段 `aria-hidden="true"` + `invisible`(Codex `kJr` 的规则);
  tab strip 的 header spacer 序列化成 `width: calc(70px)`,与 8214 逐字相同。
- blossom 流光(preview:5199,明暗各一遍):light `color-mix(in srgb, #1a1c1f 24%, transparent)`、
  dark `color-mix(in srgb, #ffffff 68%, transparent)`;Overlay 的
  `background-image` 解析出完整 112° 渐变,`animation-name = _shimmer_174ad_1`,
  `2.2s cubic-bezier(0.4, 0, 0.2, 1)`;Root 56×56。
- 模型 pill:`DeepSeek V4 FlashExtra High`(config 是 `deepseek-v4-flash` + `xhigh`)。
- typecheck(node + web)干净;改动文件 eslint 0 error
  (`extract-codex-tokens.mjs` 那 13 条 prettier warning 是改动前就有的,已比对确认)。

**未取证项**:statsig 门 `416252813` 在本机的取值未拿到。它为真时 resuming 期间
不显示 loader、直接渐进渲染。WS 按**关**的分支实现(即 `isResuming && 无可渲染 turn`
就显示 loader),依据是 8214 实测确实闪过 loader。
另:动画中间帧无法在被遮挡的 Electron 窗口里采样(rAF 被节流到 0),
上面验证的是静止值。

## 2026-08-26:启动闪屏、启动门禁、未登录拦截(整条 boot 链)

**范围**:把 Codex 从"窗口出现"到"应用/登录页可见"之间的整条链搬过来。
取证来源:`reverse/webview-dump/index.html.orig`(HTML 闪屏)、
`app-initial-Biw83Aiz.js`(`B()`/`ojl`/`vEl`/`KQc`/`JQc`/`RQc`/`uF`)、
`login-route-Bg_dmmG_.js` + `onboarding-login-content-5xAksVqV.js`、
`reverse/asar-main/main-DkjTIhil.js`(`setPrimaryWindowMode`/`hge`/`Fwe`)。

### Codex 实测的 boot 链(本次新取证)

1. **HTML 闪屏在 JS 之前画**:`index.html` 里预置 `.startup-loader`
   (56px blossom,180ms/60ms delay 淡入 + 2200ms 流光),React 接管后整体替换。
   变量名 `--startup-*` 与动画参数逐字。
2. **入口序列** `app-main` 的 `B()`:`await initializeAppHostServices()` →
   取 `appServices.startup.whenReady()` → `createRoot().render(<Suspense
   fallback={Jir debugName=Startup}><App startupReady/></Suspense>)`;
   `App` 第一行 `use(startupReady)`;`reach('renderer_ready')` 由一个隐藏 span
   的 ref 触发(Suspense 外面)。
3. **门禁链**(在 Suspense 内,自上而下):
   `PersistedStateProvider`(等 persisted-atom-sync)→ `SettingsPreloadGate`
   (等 `get-settings`)→ statsig(遥测,不搬)→ 路由。
4. **登录门禁**:`KQc` 解析目标,`JQc` 发 `electron-set-window-mode` 并跳转,
   `RQc` 守卫应用路由。未登录 → `/login`,窗口缩成 **1090×760**(v2);
   登录后回应用,恢复原 bounds。
5. **Codex 没有"未配置模型"门禁**:`model/list` 恒有默认项,它唯一拦人的是
   没凭据(`getAuthStatus` 的 `authMethod == null && requiresOpenaiAuth`)。

### 实现

- `src/renderer/index.html`:闪屏逐字复刻(含 Codex 的 mask data URI 与
  `-webkit-app-region: drag`),亮暗双档跟 ThemeProvider 同一套 `electron-*` 类。
- 宿主侧 `startup` 服务:`StartupService`(主)→ `AppHostServices.startup`
  → 渲染层 `whenStartupReady()`;边界 = agent 连接离开 `starting`(失败也 resolve,
  让界面能画失败而不是永远转圈)。
- `main.tsx` 按 `B()` 重写;`App` 用 `use(startupReady)`;提供者链
  `announcer×2 → SettingsPreloadGate → AuthProvider → AppRoutes`。
- `state/AuthContext.tsx`(`uF` 等价):并发 `getAuthStatus` + `account/read`,
  `account/updated`/`account/login/completed` 驱动重取;兜底 `requiresAuth: true`。
  另加 `error` 字段(Codex 没有,但我们的 agent 可能起不来)。
- `state/onboardingTarget.ts`:`KQc` 的 `login|app|null` 三档。
- `AppRoutes.tsx`:`JQc`+`RQc` 合并(跳转走 effect;`target==null` 时画 blossom
  而不是 Codex 的空片段 —— 刻意偏离,理由见文件注释)。
- 登录页三件套:`OnboardingPage`(`$al`)、`LoginRoute`(`Ut`+`Bt`,Codex appBrand
  分支)、`LoginContent`(onboarding-login-content 的 API key 分支);
  `state/accountLogin.ts` 直接发 `account/login/start|cancel|logout`(agent 自带
  localhost:1455 回调服务器,实测可用),authUrl 经宿主 `chromiumBrowser.openUrl`
  用外部浏览器打开。
- 窗口模式:`ViewMessage` 加 `electron-set-window-mode`;`WindowManager.
  setPrimaryWindowMode` 逐段照搬(记下原 bounds、退全屏/最大化、临时压低最小尺寸、
  win32 近满屏最大化、app 模式恢复)。
- 失败落地页 `AgentUnavailable`(本项目独有):agent 起不来时显示
  `AgentBinaryError` 的 message + hint,而不是永远转圈。

### 刻意省略/偏离(都写在代码注释里)

- 登录页 logo 用 blossom 标记占位(Codex 是 `codex-app-ga-logo--UgmJjKM.png` 资产)。
- Snake 彩蛋、Continue with Google/Microsoft、设备码/Copilot 登录:不搬(按钮留着
  没反应比没有更糟;后两者在 v2 electron 登录页本来就不渲染)。
- `PersistedStateProvider` / statsig / `welcome` / `select-workspace`:无对应能力,不猜。

### 验证(dev 应用,CDP :9333)

- 闪屏:reload 后 t≈40ms 抓到 `.startup-loader`,computed style 全对
  (drag、56px、`startup-openai-blossom-*` 两条动画、220% 背景、mask 4885 字符、
  亮色 base `rgb(0 0 0 / 0.24)`、切 dark 类后 `rgb(255 255 255 / 0.68)`)。
- 空 CODEX_HOME 冷启:停在登录页,窗口 **1090×760**;h1/三按钮/输入框类名、
  placeholder `sk-…`、autofocus、空值禁用 Continue 全对。
- 提交测试 key:`auth.json` 落盘 `{"auth_mode":"apikey",...}` → 跳 `/`、
  窗口恢复 **1200×800**、AppShell 渲染。
- 真 `~/.codex`(已配置 deepseek provider):直接进 AppShell,无登录页闪现。
- typecheck 干净;新文件 eslint 0 error(仓库既有的 scripts/*.mjs 告警与本改动无关)。
