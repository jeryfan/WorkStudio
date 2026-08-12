import type { Todo } from '../model/plan'
import { Codicon } from './Codicon'

/**
 * 待办清单 —— 移植自上游的 chatTodoListWidget.ts。
 *
 * **挂在输入框上方，不在回复流里**，与上游一致：它的 CSS 选择器一律以
 * `.interactive-input-part >` 开头，而 `chatToolInvocationPart.ts` 收到
 * todoList 数据时只调用 `chatTodoListService.setTodos()`，一个字都不往回复
 * 里放。配置项 `chat.todo.showWidget` 默认 true。
 *
 * 道理是这份清单表达的是"当前状态"而不是"发生过的事"：模型每改一次计划就推
 * 一条新条目，放进流里会得到同一份清单的三四个版本依次排开，而只有最后一份
 * 是真的。常驻在输入框上方还有个好处——往上翻历史时它不会跟着滚走。
 *
 * 图标与状态色照搬上游 `getStatusIconClass` / `getStatusIconColor`：
 *   completed → codicon-pass         + charts-green
 *   进行中     → codicon-record       + charts-blue
 *   未开始     → codicon-circle-outline + foreground
 *
 * 上游用 monaco-list 虚拟化清单，这里是普通 <ul>：计划一般十来条，为它引一套
 * 虚拟列表不划算。
 */
export function TodoListPart({ todos }: { todos: readonly Todo[] }): React.JSX.Element | null {
  if (todos.length === 0) return null

  const done = todos.filter((t) => t.status === 'completed').length

  return (
    <div className="chat-todo-list-widget has-todos">
      <div className="todo-list-title">
        <Codicon name="checklist" />
        <span>
          Plan · {done}/{todos.length}
        </span>
      </div>
      <ul className="todo-list" role="list">
        {todos.map((todo, i) => (
          <li className="todo-item" key={`${i}:${todo.title}`}>
            <Codicon
              name={STATUS_ICON[todo.status]}
              className={`todo-status-icon todo-status-${todo.status}`}
            />
            <span className="todo-content">{todo.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const STATUS_ICON = {
  completed: 'pass',
  'in-progress': 'record',
  'not-started': 'circle-outline'
} as const
