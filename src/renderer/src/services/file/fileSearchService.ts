import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import type { FuzzyFileSearchResponse } from '@shared/protocol/generated/FuzzyFileSearchResponse'
import type { FuzzyFileSearchResult } from '@shared/protocol/generated/FuzzyFileSearchResult'

/**
 * 模糊文件搜索 —— composer at-mention 菜单(`@` → 文件项)的数据源。
 * 对应协议 `fuzzyFileSearch`;取消令牌暂不使用(调用方 debounce)。
 */
export async function searchFiles(
  query: string,
  roots: string[]
): Promise<FuzzyFileSearchResult[]> {
  if (roots.length === 0) return []
  const res = await rpc.request<FuzzyFileSearchResponse>(M.fileSearch, {
    query,
    roots,
    cancellationToken: null
  })
  return res.files
}
