import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import type { ModelListResponse } from '@shared/protocol/generated/v2/ModelListResponse'
import { formatEffort, type ModelOption, type ModelService } from './types'

/**
 * agent 未就绪时的兜底目录，与 prototype/chat.html 的硬编码展示一致。
 * 接入真实 model/list 后此目录只在请求失败时使用。
 */
const FALLBACK_MODELS: ModelOption[] = [
  {
    id: 'sol-5.6',
    displayName: '5.6 Sol',
    efforts: ['Low', 'Medium', 'High', 'Extra High'],
    defaultEffort: 'Extra High',
    isDefault: true
  }
]

/**
 * 模型域服务：经 RPC 调用 agent 的 model/list。
 *
 * 设计文档 §5.4：模型与 effort 在 Composer 挂载时拉取，删除硬编码；
 * 失败时回退到兜底目录，保证弹层始终可用。
 */
export class RpcModelService implements ModelService {
  async listModels(): Promise<ModelOption[]> {
    try {
      const res = await rpc.request<ModelListResponse>(M.modelList)
      const models = res.data
        .filter((m) => !m.hidden)
        .map((m) => ({
          id: m.id,
          displayName: m.displayName,
          efforts: m.supportedReasoningEfforts.map((e) => formatEffort(e.reasoningEffort)),
          defaultEffort: formatEffort(m.defaultReasoningEffort),
          isDefault: m.isDefault
        }))
      return models.length > 0 ? models : FALLBACK_MODELS
    } catch {
      return FALLBACK_MODELS
    }
  }
}
