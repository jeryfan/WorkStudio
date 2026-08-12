/**
 * 本项目自有的 RPC 方法，由主进程本地处理，不转发给 agent。
 *
 * 这些概念 agent 协议里不存在（它只认路径），完全由客户端维护。
 * 命名空间与转发方法区分开，路由表据此判断走向。
 */
export const LOCAL = {
  /** agent 运行时状态，用于启动期展示与错误提示 */
  agentStatus: 'app/agent/status',
  /** 运行环境信息（数据目录、平台），来自握手响应 */
  agentEnvironment: 'app/agent/environment',

  // 项目注册表
  projectList: 'app/project/list',
  projectCreate: 'app/project/create',
  projectRemove: 'app/project/remove',
  projectRename: 'app/project/rename',
  projectReorder: 'app/project/reorder',
  projectSelect: 'app/project/select',
  /** 打开系统目录选择框，返回选中的绝对路径 */
  projectPickDirectory: 'app/project/pickDirectory',

  // 会话的客户端侧状态。置顶与项目归属都不在 agent 协议里，由本地注册表维护。
  chatDecorations: 'app/chat/decorations',
  chatSetPinned: 'app/chat/setPinned',
  chatAssign: 'app/chat/assign',
  chatForget: 'app/chat/forget'
} as const

export type LocalMethod = (typeof LOCAL)[keyof typeof LOCAL]

const LOCAL_METHODS = new Set<string>(Object.values(LOCAL))

/** 本地方法统一以 app/ 开头，便于路由表 O(1) 判别 */
export function isLocalMethod(method: string): method is LocalMethod {
  return LOCAL_METHODS.has(method)
}
