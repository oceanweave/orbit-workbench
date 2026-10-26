import type { CommandLibrary } from './types'

const createdAt = '2026-10-27T00:00:00.000Z'
export const initialCommandLibrary: CommandLibrary = {
  version: 1,
  groups: [
    { id: 'commands-kubernetes', name: 'Kubernetes', color: '#7585f5' },
    { id: 'commands-development', name: '日常开发', color: '#39b99a' },
  ],
  snippets: [
    {
      id: 'snippet-pods', name: 'Pod 排查速查', description: '从资源概况到事件，按需复制某一行。',
      content: '# 查看所有命名空间中的 Pod\nkubectl get pods -A -o wide\n\n# 按创建时间排序\nkubectl get pods --sort-by=.metadata.creationTimestamp\n\n# 按时间查看最近的事件\nkubectl get events --sort-by=.metadata.creationTimestamp',
      language: 'bash', groupId: 'commands-kubernetes', createdAt, updatedAt: createdAt,
    },
    {
      id: 'snippet-git', name: 'Git 工作区检查', description: '提交前快速检查改动与分支状态。',
      content: '# 查看当前分支和文件状态\ngit status --short --branch\n\n# 检查差异与空白字符\ngit diff --stat\ngit diff --check\n\n# 查看最近的提交\ngit log --oneline -8',
      language: 'bash', groupId: 'commands-development', createdAt, updatedAt: createdAt,
    },
    {
      id: 'snippet-powershell', name: 'Windows 网络检查', description: '在 PowerShell 中查看网络信息。',
      content: '# 查看网络适配器\nGet-NetAdapter | Sort-Object Name\n\n# 查看本机 IP 配置\nGet-NetIPConfiguration',
      language: 'powershell', groupId: 'commands-development', createdAt, updatedAt: createdAt,
    },
  ],
}
