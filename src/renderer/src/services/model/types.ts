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
  /**
   * 支持的 reasoning effort 档位，从低到高排列（驱动滑块点位）。
   * **存协议值**（`low` / `xhigh`），展示时再过 formatEffort —— 与 Codex 一致：
   * 它的 `data-selected-reasoning-effort` 和 turn/start 的 `effort` 都是协议值，
   * 状态里存展示串再反向映射回去只是给自己找错。
   */
  efforts: string[]
  /** 协议值 */
  defaultEffort: string
  isDefault: boolean
}

export interface ModelService {
  /**
   * 拉取可用模型目录。
   * 失败返回空数组（**没有兜底目录** —— 见 modelService.ts 里的说明：
   * 硬编码一份假目录会把请求失败伪装成"有模型可用"）。
   */
  listModels(): Promise<ModelOption[]>
}

/** effort 取值的展示格式化（协议值如 "xhigh" / "medium"） */
export function formatEffort(effort: string): string {
  if (effort === 'xhigh') return 'Extra High'
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}
