import type { Project, WorkspaceData, WorkspaceService } from './types'

/**
 * Mock 实现 —— 数据内容与 prototype/sider/2.html 完全一致。
 * 接入真实后端时仅需替换本文件（或新增 IpcWorkspaceService）。
 */
const projects: Project[] = [
  {
    id: 'ideact',
    name: 'ideact',
    defaultExpanded: true,
    tasks: [{ id: 't-ideact-1', title: 'hi', timeAgo: '2w', projectId: 'ideact' }]
  },
  {
    id: 'codex-reverse',
    name: 'codex-reverse',
    defaultExpanded: true,
    tasks: [
      {
        id: 't-codex-1',
        title: '能否通过逆向codex,使其能够运行在web端，你有什么思路',
        timeAgo: '11h',
        projectId: 'codex-reverse'
      }
    ]
  },
  {
    id: 'agent-explore',
    name: 'agent-explore',
    defaultExpanded: true,
    tasks: [
      { id: 't-agent-1', title: 'hi', timeAgo: '12h', projectId: 'agent-explore' },
      { id: 't-agent-2', title: 'hi', timeAgo: '12h', projectId: 'agent-explore' },
      { id: 't-agent-3', title: 'hi', timeAgo: '12h', projectId: 'agent-explore' },
      {
        id: 't-agent-4',
        title:
          '这是codex的项目中右侧的文件数以及文件预览、编辑、browser等功能，本项目当前是一个新项目，我希望实现如图一样…',
        unread: true,
        projectId: 'agent-explore'
      }
    ]
  },
  {
    id: 'genui',
    name: 'genui',
    defaultExpanded: true,
    tasks: [{ id: 't-genui-1', title: 'Respond to greeting', timeAgo: '6d', projectId: 'genui' }]
  },
  {
    id: 'gams',
    name: 'gams',
    defaultExpanded: false,
    tasks: [
      {
        id: 't-gams-1',
        title: '我希望使用Cocos来开发游戏，你有什么推荐的剧本吗',
        timeAgo: '1w',
        pinned: true,
        projectId: 'gams'
      }
    ]
  }
]

const data: WorkspaceData = {
  projects,
  pinnedTasks: projects.flatMap((p) => p.tasks.filter((t) => t.pinned)),
  currentProjectId: 'ideact',
  suggestions: [
    { id: 'explore', label: 'Explore and understand code', color: 'blue' },
    { id: 'build', label: 'Build a new feature, app, or tool', color: 'purple' },
    { id: 'review', label: 'Review code and suggest changes', color: 'green' },
    { id: 'fix', label: 'Fix issues and failures', color: 'orange' }
  ]
}

export class MockWorkspaceService implements WorkspaceService {
  async getWorkspaceData(): Promise<WorkspaceData> {
    // 模拟异步接口，保持与真实实现一致的调用方式
    return structuredClone(data)
  }

  async createProject(input: { name: string }): Promise<Project> {
    const project: Project = {
      id: input.name.trim().toLowerCase().replace(/\s+/g, '-') || `project-${Date.now()}`,
      name: input.name,
      defaultExpanded: true,
      tasks: []
    }
    data.projects.push(project)
    return project
  }
}
