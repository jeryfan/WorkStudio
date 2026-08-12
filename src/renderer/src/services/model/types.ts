/**
 * 模型域模型 —— 渲染层消费的"模型选项"形状。
 *
 * 协议里的 Model（generated/v2/Model）字段很全，但 Composer 只需要
 * 展示名 + 支持的 effort 档位，这里定义收敛后的本地形状，
 * 由 modelService 负责从协议模型映射。
 */
export interface ModelOption {
  id: string
  displayName: string
  /** 支持的 reasoning effort 档位，从低到高排列（驱动滑块点位） */
  efforts: string[]
  defaultEffort: string
  isDefault: boolean
}

export interface ModelService {
  /** 拉取可用模型目录；agent 未就绪时由实现给出兜底目录 */
  listModels(): Promise<ModelOption[]>
}

/** effort 取值的展示格式化（协议值如 "xhigh" / "medium"） */
export function formatEffort(effort: string): string {
  if (effort === 'xhigh') return 'Extra High'
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}
