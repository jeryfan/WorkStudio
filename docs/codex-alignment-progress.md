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
