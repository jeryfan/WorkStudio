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
Browser tab 工具栏/地址栏/空态/进度条按实测重写;Files tab 换了 Codex 的面包屑 nav
(`s0a`)+ 空态 + 树列边界(树本体还是 react-arborist,下轮)。

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
