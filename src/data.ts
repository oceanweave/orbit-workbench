import type { BookmarkBoard, CommandTemplate, KubeConfig, KubeGroup } from './types'

const now = '2026-10-23T09:00:00.000Z'

const sampleKubeconfig = (context: string, server: string) => `apiVersion: v1
kind: Config
clusters:
- name: ${context}
  cluster:
    server: ${server}
contexts:
- name: ${context}
  context:
    cluster: ${context}
    user: orbit-user
current-context: ${context}
users:
- name: orbit-user
  user: {}
preferences: {}
`

export const initialBoards: BookmarkBoard[] = [
  {
    id: 'board-engineering',
    name: '工程效率',
    description: '工作中常用的文档、平台和排障工具',
    tags: ['工作', '常用'],
    updatedAt: now,
    groups: [
      { id: 'group-tools', name: '常用工具', color: '#6f8cff' },
      { id: 'group-k8s', name: 'Kubernetes', color: '#44c7a5' },
      { id: 'group-learning', name: '学习资料', color: '#f2ab55' },
    ],
    links: [
      { id: 'link-google', title: 'Google', url: 'https://www.google.com/', groupId: 'group-tools', tags: ['搜索'], description: '快速查找技术资料', addedAt: now },
      { id: 'link-onetab', title: 'OneTab', url: 'chrome-extension://chphlpgkkbolifaimnlloiipkdnihall/onetab.html', groupId: 'group-tools', tags: ['浏览器'], description: '暂存打开的页面', addedAt: now },
      { id: 'link-json-yaml', title: 'JSON 转 YAML', url: 'https://oktools.net/json2yaml', groupId: 'group-tools', tags: ['转换'], description: '在线格式转换工具', addedAt: now },
      { id: 'link-k8s-docs', title: 'Kubernetes 中文文档', url: 'https://kubernetes.io/zh-cn/docs/reference/', groupId: 'group-k8s', tags: ['文档', '官方'], description: 'API 参考与概念文档', addedAt: now },
      { id: 'link-k8s-apparmor', title: '使用 AppArmor 限制容器资源访问', url: 'https://kubernetes.io/zh-cn/docs/tutorials/security/apparmor/', groupId: 'group-k8s', tags: ['安全'], description: 'Kubernetes 安全实践', addedAt: now },
      { id: 'link-k8s-source', title: 'Kubernetes 源码分析', url: 'https://github.com/daniel-hutao/k8s-source-code-analysis', groupId: 'group-k8s', tags: ['GitHub', '源码'], description: '源码阅读笔记', addedAt: now },
      { id: 'link-git-book', title: 'Pro Git 中文版', url: 'https://git-scm.com/book/zh/v2', groupId: 'group-learning', tags: ['Git'], description: 'Git 权威参考书', addedAt: now },
      { id: 'link-go-blog', title: '李文周的博客', url: 'https://www.liwenzhou.com/', groupId: 'group-learning', tags: ['Go', '博客'], description: 'Go 语言与工程实践', addedAt: now },
      { id: 'link-bookstack', title: 'Kubernetes v1.23 中文文档', url: 'https://www.bookstack.cn/read/kubernetes-1.23-zh/4a83d94850752ef9.md', groupId: 'group-learning', tags: ['文档'], description: '社区维护的版本文档', addedAt: now },
    ],
  },
  {
    id: 'board-inspiration',
    name: '灵感收藏',
    description: '值得反复打开的产品、设计和内容',
    tags: ['灵感'],
    updatedAt: now,
    groups: [
      { id: 'group-products', name: '产品与设计', color: '#c486ff' },
      { id: 'group-reading', name: '待读', color: '#ff8092' },
    ],
    links: [
      { id: 'link-hello-github', title: 'HelloGitHub', url: 'https://hellogithub.com/', groupId: 'group-products', tags: ['开源'], description: '发现有趣的开源项目', addedAt: now },
      { id: 'link-smzdk', title: '什么值得看', url: 'https://smzdk.top/#/', groupId: 'group-reading', tags: ['内容'], description: '正在发生的事情', addedAt: now },
    ],
  },
]

export const initialKubeGroups: KubeGroup[] = [
  { id: 'kube-group-work', name: '工作集群', color: '#46c7a4' },
  { id: 'kube-group-lab', name: '实验环境', color: '#6f8cff' },
]

export const initialKubeConfigs: KubeConfig[] = [
  { id: 'kube-prod', name: 'production', envName: 'PRODUCTION', alias: 'PRODUCTION', path: '~/.kube/prod.config', metaName: 'PRODUCTION', source: 'file', content: sampleKubeconfig('prod-shanghai', 'https://k8s.prod.example.com'), groupId: 'kube-group-work', context: 'prod-shanghai', contexts: ['prod-shanghai', 'prod-beijing'], server: 'https://k8s.prod.example.com', tags: ['生产', '只读'], createdAt: '2026-10-21T08:30:00.000Z', updatedAt: '2 小时前' },
  { id: 'kube-staging', name: 'staging', envName: 'STAGING', alias: 'STAGING', path: '~/workspace/infra/staging.yaml', metaName: 'STAGING', source: 'file', content: sampleKubeconfig('staging-shanghai', 'https://k8s.staging.example.com'), groupId: 'kube-group-work', context: 'staging-shanghai', contexts: ['staging-shanghai', 'staging-beijing'], server: 'https://k8s.staging.example.com', tags: ['预发'], createdAt: '2026-10-20T06:20:00.000Z', updatedAt: '昨天' },
  { id: 'kube-local', name: 'local-kind', envName: 'KIND', alias: 'KIND', path: '~/.kube/kind.config', metaName: 'KIND', source: 'file', content: sampleKubeconfig('kind-dev', 'https://127.0.0.1:5443'), groupId: 'kube-group-lab', context: 'kind-dev', contexts: ['kind-dev'], server: 'https://127.0.0.1:5443', tags: ['本地', '开发'], createdAt: '2026-10-18T10:10:00.000Z', updatedAt: '3 天前' },
  { id: 'kube-minikube', name: 'minikube', envName: 'MINIKUBE', alias: 'MINIKUBE', path: '~/.kube/minikube', metaName: 'MINIKUBE', source: 'file', content: sampleKubeconfig('minikube', 'https://192.168.49.2:8443'), groupId: 'kube-group-lab', context: 'minikube', contexts: ['minikube'], server: 'https://192.168.49.2:8443', tags: ['本地'], createdAt: '2026-10-16T04:45:00.000Z', updatedAt: '上周' },
]

export const commandTemplates: CommandTemplate[] = [
  { id: 'get-pods', name: '查看 Pods', command: 'get pods', description: '列出当前命名空间的 Pod', builtin: true, createdAt: now },
  { id: 'get-pods-wide', name: '查看 Pods（详细）', command: 'get pods -o wide', description: '查看节点、IP 等详细信息', builtin: true, createdAt: now },
  { id: 'get-pods-sort-created', name: 'Pods 按创建时间排序', command: 'get pods --sort-by=.metadata.creationTimestamp', description: '按照创建时间排序查看 Pod', builtin: true, createdAt: now },
  { id: 'get-nodes', name: '查看节点', command: 'get nodes -o wide', description: '查看集群节点和地址', builtin: true, createdAt: now },
  { id: 'get-services', name: '查看 Service', command: 'get svc -o wide', description: '查看服务和访问地址', builtin: true, createdAt: now },
  { id: 'get-deployments', name: '查看 Deployment', command: 'get deployments', description: '列出工作负载部署', builtin: true, createdAt: now },
  { id: 'rollout-status', name: '查看发布状态', command: 'rollout status deployment', description: '等待 Deployment 发布完成', builtin: true, createdAt: now },
  { id: 'describe-pod', name: '描述资源', command: 'describe pod', description: '查看资源事件和详细状态', builtin: true, createdAt: now },
  { id: 'get-events-sort-created', name: 'Events 按创建时间排序', command: 'get events --sort-by=.metadata.creationTimestamp', description: '按创建时间查看集群事件', builtin: true, createdAt: now },
  { id: 'top-pods', name: 'Pod 资源排行', command: 'top pods', description: '查看 Pod CPU 和内存使用', builtin: true, createdAt: now },
  { id: 'logs', name: '查看日志', command: 'logs -f', description: '跟随容器实时输出日志', builtin: true, createdAt: now },
]
