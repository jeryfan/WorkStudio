/**
 * 方法名映射：本项目术语 → agent 协议线上方法名。
 *
 * 业务代码只写 `rpc.request(M.chatList, …)`，线上名称收敛在本文件。
 * 名称由 agent 端定义，本项目无法更改，因此这里是唯一允许出现它们的地方
 *（连同 notifications.ts）。
 */
export const M = {
  // 握手
  initialize: 'initialize',
  initialized: 'initialized',

  // 会话生命周期
  chatStart: 'thread/start',
  chatResume: 'thread/resume',
  chatRead: 'thread/read',
  chatList: 'thread/list',
  chatFork: 'thread/fork',
  chatArchive: 'thread/archive',
  chatUnarchive: 'thread/unarchive',
  chatDelete: 'thread/delete',
  chatSetName: 'thread/name/set',
  chatUnsubscribe: 'thread/unsubscribe',
  chatCompact: 'thread/compact/start',
  chatRollback: 'thread/rollback',
  /** 向会话的模型可见历史追加 Responses API 条目(side chat 注入边界消息用) */
  chatInjectItems: 'thread/inject_items',

  // 会话分组
  groupList: 'threadSection/list',
  groupCreate: 'threadSection/create',
  groupUpdate: 'threadSection/update',
  groupDelete: 'threadSection/delete',
  chatMoveToGroup: 'thread/section/move',

  // 轮次
  turnStart: 'turn/start',
  turnSteer: 'turn/steer',
  turnInterrupt: 'turn/interrupt',

  // 文件
  fsReadFile: 'fs/readFile',
  fsWriteFile: 'fs/writeFile',
  fsReadDirectory: 'fs/readDirectory',
  fsCreateDirectory: 'fs/createDirectory',
  fsRemove: 'fs/remove',
  fsGetMetadata: 'fs/getMetadata',
  fsWatch: 'fs/watch',
  fsUnwatch: 'fs/unwatch',
  fileSearch: 'fuzzyFileSearch',
  skillsList: 'skills/list',

  // 终端
  execStart: 'command/exec',
  execWrite: 'command/exec/write',
  execResize: 'command/exec/resize',
  execTerminate: 'command/exec/terminate',

  // 模型与账号
  modelList: 'model/list',
  accountRead: 'account/read',
  accountRateLimits: 'account/rateLimits/read',
  authStatus: 'getAuthStatus',

  // MCP 服务器与连接器(app)
  mcpServerStatusList: 'mcpServerStatus/list',
  appList: 'app/list',

  // 配置
  configRead: 'config/read',
  configWrite: 'config/value/write',
  configBatchWrite: 'config/batchWrite',

  // Git
  gitDiffToRemote: 'gitDiffToRemote'
} as const

export type MethodKey = keyof typeof M
export type MethodName = (typeof M)[MethodKey]

/**
 * 服务端发起的反向请求。收到这些必须应答，否则 agent 会一直等下去。
 */
export const SERVER_REQUEST = {
  commandApproval: 'item/commandExecution/requestApproval',
  fileChangeApproval: 'item/fileChange/requestApproval',
  permissionApproval: 'item/permissions/requestApproval',
  toolUserInput: 'item/tool/requestUserInput',
  toolCall: 'item/tool/call',
  mcpElicitation: 'mcpServer/elicitation/request',
  authTokenRefresh: 'account/chatgptAuthTokens/refresh',
  attestation: 'attestation/generate'
} as const

export type ServerRequestMethod = (typeof SERVER_REQUEST)[keyof typeof SERVER_REQUEST]

const SERVER_REQUEST_METHODS = new Set<string>(Object.values(SERVER_REQUEST))

export function isServerRequestMethod(method: string): method is ServerRequestMethod {
  return SERVER_REQUEST_METHODS.has(method)
}
