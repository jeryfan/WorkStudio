/**
 * 计划文本 → 待办条目。
 *
 * 协议给计划的方式有两条，形状还不一样：
 *
 *   - `plan` 条目：只有一段 `text`，但它在条目流里有位置、能被 `thread/resume`
 *     带回来（会话重开后仍在）
 *   - `turn/plan/updated` 通知：有 `{ step, status }` 的结构化数组，但只在实时
 *     推送时存在，重开会话不会重放
 *
 * 结构化的那份可用时优先用它（有每一步的状态）；只剩文本时靠这里解析。
 * 解析不出来就返回空数组，调用方退回按 markdown 原样渲染——比猜错格式后
 * 显示一堆错位的复选框好。
 *
 * 格式是猜的：`text` 的确切写法未经实测确认，所以这里认几种常见写法而不是
 * 咬死一种，并且**任何一行不认识就整体放弃**（同 `diff.ts` 的取舍）——半份
 * 清单比没有清单更容易误导。
 */

export type TodoStatus = 'not-started' | 'in-progress' | 'completed'

export interface Todo {
  title: string
  status: TodoStatus
}

/** `- [x] 做完的事` / `1. 待办` / `- 待办` */
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[(.)\]\s+)?(.*)$/

function statusOf(mark: string | undefined): TodoStatus {
  if (!mark) return 'not-started'
  switch (mark.toLowerCase()) {
    case 'x':
      return 'completed'
    // 半完成的写法没有统一约定，几种常见的都收下
    case '-':
    case '~':
    case '>':
    case '/':
      return 'in-progress'
    default:
      return 'not-started'
  }
}

export function parsePlanText(text: string): Todo[] {
  const todos: Todo[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const m = ITEM.exec(line)
    // 有一行不是列表项就整体放弃：说明这段文本不是清单，是别的东西
    if (!m) return []
    const title = m[2].trim()
    if (!title) return []
    todos.push({ title, status: statusOf(m[1]) })
  }
  return todos
}
