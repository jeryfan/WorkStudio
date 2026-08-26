# Codex 侧栏会话列表滚动分页（infinite scroll）规格

> 状态：**待实现**（本文件只描述需求与已确认事实，不含实现）。
> 关联：`codex-sidebar-spec.md`(侧栏整体实测)、`codex-alignment-progress.md`(进度)。
> 来源：对运行中 Codex(`http://127.0.0.1:8214/`,CDP :9250)的 DOM 实测 + `reverse/analysis/sidebar/app-initial.pretty.js` bundle 佐证。

## 背景 / 现状差异

- **Codex**：侧栏会话列表（Recents / 项目内列表）是**分页 + infinite scroll**。首屏只渲染一页，
  滚近底部时拉下一页，并在列表尾部显示一个**加载 spinner 行**；新数据追加后 spinner 消失。
- **WorkStudio**：`chatService.listChats` 一次性请求单页（`limit` 默认 **200**），协议层已返回
  `nextCursor` / `backwardsCursor`（见 `services/chat/types.ts`），但侧栏**没有消费游标做滚动加载**，
  因此永远没有「滚动 loading」。这不是性能差异，是数据流差异。

本需求目标：让 WS 侧栏会话列表的滚动加载行为与 Codex 一致（分页拉取 + 尾部 spinner + 追加渲染）。

## 已确认事实（实测）

### 加载行（spinner listitem）结构

Codex Recents 列表尾部的加载行 DOM（滚动触发加载时出现）：

```
div.flex.gap-1.py-1.after:block.after:h-px.after:content-[''].last:after:hidden [role="listitem"]
└ div.flex.w-full.justify-center.py-3
  └ div.animate-spin.inline-flex.h-fit.w-fit.items-center.justify-center.leading-none
      .contain-layout.contain-paint.contain-style        ← Spinner($m),icon-xs text-token-text-secondary
```

- 它就是一个普通 `role="listitem"`，参与列表的 1px 行隙（`after:` 伪元素）。
- WS 已在 `LeftPanel.tsx` 用同一结构渲染**首屏** `chatsLoading` 态，可直接复用为「加载更多」行。

### 协议层已具备分页能力

- `listChats(snapshot, { limit, cursor })` → `{ chats, nextCursor, backwardsCursor }`。
- `nextCursor` 用于向后翻页；`backwardsCursor` 注释说明「顶部新增项无法只靠 nextCursor 增量补齐」。

## 需求

1. **减小首屏页大小**：把首屏 `limit` 从 200 降到与 Codex 相近的量级（具体值待实测，见「待确认」），
   使「还有下一页」成为常态，infinite scroll 才有意义。
2. **底部 sentinel 触发加载**：滚动到接近列表底部（阈值待实测）时，若 `nextCursor != null` 且未在加载中，
   发起 `listChats({ cursor: nextCursor })`，追加结果并更新 `nextCursor`。
3. **加载行**：加载期间在列表尾渲染上述 spinner listitem；加载完成/无更多页时移除。
4. **去重与幂等**：追加时按会话 id 去重（翻页边界可能与已加载项重叠）；同一时刻只允许一个在途请求。
5. **与排序/组织模式正交**：`chatSortMode`(priority/updated_at/manual) 与 `organize=list`(平铺)
   切换时应**重置分页状态**（清空已加载页、回到第一页），因为排序键变了，游标不通用。
6. **失败处理**：加载失败不破坏已渲染列表，spinner 移除、保留 `nextCursor` 以便下次滚动重试
   （Codex 的容错行为待实测确认，见「待确认」）。

## 待确认（不猜，实现前需实测）

- Codex 侧栏的**页大小**（首屏与后续页各多少条）。
- 触发加载的**滚动阈值**（距底部多少 px / 是否用 IntersectionObserver sentinel）。
- 是否在**顶部**也用 `backwardsCursor` 做「拉取更新」（新会话出现在顶部）；还是仅靠事件/重拉。
- 加载**失败**时 Codex 的表现（toast / 静默重试 / 保留 spinner）。
- 项目内会话列表（`project:<id>` 容器）是否同样分页，还是只有 Recents 分页。

## 验收

- 会话数 > 页大小时，首屏只渲染一页；滚近底部出现 spinner 行，加载后追加、spinner 消失、可继续翻。
- 翻到 `nextCursor == null` 后不再触发加载、不显示 spinner。
- 切换 sort / organize 模式后分页重置，顺序正确、无重复行。
- 加载行的 DOM/类与上面「已确认事实」逐字一致；footer 淡出遮罩不受影响（见 progress 文档的 footer 修复）。
