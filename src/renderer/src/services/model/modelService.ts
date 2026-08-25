import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import type { ModelListResponse } from '@shared/protocol/generated/v2/ModelListResponse'
import type { ModelOption, ModelService } from './types'

/**
 * 模型域服务：经 RPC 调用 agent 的 model/list。
 *
 * **`params` 必须显式传，哪怕是空对象。** app-server 侧 `params` 是必填字段
 *（`ModelListParams` 的三个成员都可选，但那一层 key 本身不可省），省掉它会得到
 *     Invalid request: missing field `params`
 * 这个坑之前被兜底目录掩盖了：请求恒失败 → catch → 返回一份硬编码模型，
 * 于是 composer 一直显示那个并不存在的模型名，而真正发出的 turn 用的是
 * config.toml 里的默认模型。**所以这里不再有兜底目录** —— 与 Codex 一致
 *（Codex 没有任何硬编码模型清单），失败就是空目录 + 一条告警，
 * 宁可 picker 显示占位符，也不要凭空造一个模型名骗人。
 *
 * 项目里其余 rpc.request 调用点都带了 params，只有这一处漏了。
 */
export class RpcModelService implements ModelService {
  async listModels(): Promise<ModelOption[]> {
    try {
      const res = await rpc.request<ModelListResponse>(M.modelList, {})
      return res.data
        .filter((m) => !m.hidden)
        .map((m) => ({
          id: m.id,
          displayName: m.displayName,
          // 协议值原样带过来，展示格式化留给渲染层（见 types.ts 的说明）
          efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort),
          defaultEffort: m.defaultReasoningEffort,
          isDefault: m.isDefault
        }))
    } catch (error) {
      console.warn('[model] model/list failed', error)
      return []
    }
  }
}
