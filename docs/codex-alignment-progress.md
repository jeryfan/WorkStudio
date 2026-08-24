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
