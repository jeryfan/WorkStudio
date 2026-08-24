import { rpc } from '../../rpc/client'
import { M } from '@shared/protocol/methods'
import type { SkillMetadata } from '@shared/protocol/generated/v2/SkillMetadata'
import type { SkillsListResponse } from '@shared/protocol/generated/v2/SkillsListResponse'

/**
 * 技能目录 —— composer slash 菜单(`/` → 技能项)的数据源。
 * 对应协议 `skills/list`;按 cwd 分组返回,这里拍平成单列表。
 */
export async function listSkills(cwds: string[]): Promise<SkillMetadata[]> {
  const res = await rpc.request<SkillsListResponse>(M.skillsList, { cwds })
  return res.data
    .filter((entry) => entry.errors.length === 0 || entry.skills.length > 0)
    .flatMap((entry) => entry.skills)
    .filter((skill) => skill.enabled)
}
