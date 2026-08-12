/**
 * "工作中"的文案。
 *
 * 词表照抄上游 `chatThinkingContentPart.ts` 的 `defaultThinkingMessages`。
 * 上游还有按工具类别切换的词表（terminal / search 等）和"趣味文案"开关，
 * 那些依赖 configurationService，本项目没有配置系统，只用默认这一组。
 *
 * 挑选按 key 取哈希而不是随机：adapter 是纯函数，每次重渲染都会重新调用它，
 * 用 `Math.random()` 会让文案每帧都变。上游靠 1200ms 防抖压住这个问题，
 * 我们直接让它对同一轮恒定，连计时器都省了。
 */

const WORKING_LABELS = [
  'Thinking',
  'Reasoning',
  'Considering',
  'Analyzing',
  'Evaluating',
  'Working'
]

export function workingLabel(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  return WORKING_LABELS[Math.abs(hash) % WORKING_LABELS.length]
}
