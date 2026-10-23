import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowUpRight,
  Blocks,
  Bookmark,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
  CloudDownload,
  Code2,
  Command,
  Copy,
  Database,
  ExternalLink,
  FileDown,
  FileUp,
  Folder,
  FolderOpen,
  GripVertical,
  HardDrive,
  KeyRound,
  Laptop,
  LayoutGrid,
  Link2,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  X,
  Zap,
  Moon,
} from 'lucide-react'
import { commandTemplates, initialBoards, initialKubeConfigs, initialKubeGroups } from './data'
import type { BookmarkBoard, KubeConfig, KubeGroup } from './types'

type Section = 'bookmarks' | 'kubeconfig' | 'settings'
type Theme = 'dark' | 'light'

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? (JSON.parse(stored) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}

function App() {
  const [section, setSection] = useState<Section>('bookmarks')
  const [boards, setBoards] = usePersistentState<BookmarkBoard[]>('orbit-boards', initialBoards)
  const [kubeConfigs, setKubeConfigs] = usePersistentState<KubeConfig[]>('orbit-kube-configs', initialKubeConfigs)
  const [kubeGroups, setKubeGroups] = usePersistentState<KubeGroup[]>('orbit-kube-groups', initialKubeGroups)
  const [theme, setTheme] = usePersistentState<Theme>('orbit-theme', 'dark')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const notify = (message: string) => setToast(message)

  const copyText = async (value: string, label = '已复制') => {
    try {
      await navigator.clipboard.writeText(value)
      notify(label)
    } catch {
      notify('复制失败，请检查浏览器权限')
    }
  }

  const exportFile = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    notify(`已导出 ${filename}`)
  }

  const exportBoard = (board: BookmarkBoard) => {
    const payload = JSON.stringify(board, null, 2)
    exportFile(`${board.name}.orbit.json`, payload, 'application/json')
  }

  const exportWorkspace = () => {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), boards, kubeGroups, kubeConfigs }, null, 2)
    exportFile('orbit-workbench.backup.json', payload, 'application/json')
  }

  const handleBookmarkImport = async (file: File) => {
    const html = await file.text()
    const imported = parseBookmarksHtml(html)
    if (!imported.length) {
      notify('没有发现可导入的书签文件夹')
      return
    }
    setBoards((current) => [...current, ...imported])
    notify(`已导入 ${imported.length} 个看板`)
  }

  const addBoard = () => {
    const name = window.prompt('看板名称', '新看板')?.trim()
    if (!name) return
    const board: BookmarkBoard = {
      id: uid('board'),
      name,
      description: '整理一组重要链接',
      tags: ['新建'],
      updatedAt: new Date().toISOString(),
      groups: [{ id: uid('group'), name: '未分组', color: '#6f8cff' }],
      links: [],
    }
    setBoards((current) => [board, ...current])
    notify('看板已创建')
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="app-rail">
        <div className="brand-mark" aria-label="Orbit Workbench">
          <div className="brand-orbit"><span /></div>
          <div className="brand-text"><strong>orbit</strong><small>workbench</small></div>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <NavItem icon={<Bookmark size={17} />} label="书签看板" active={section === 'bookmarks'} onClick={() => setSection('bookmarks')} />
          <NavItem icon={<Box size={17} />} label="Kubeconfig" active={section === 'kubeconfig'} onClick={() => setSection('kubeconfig')} />
        </nav>

        <div className="rail-divider" />
        <nav className="secondary-nav" aria-label="辅助导航">
          <NavItem icon={<Settings2 size={17} />} label="偏好设置" active={section === 'settings'} onClick={() => setSection('settings')} />
        </nav>

        <div className="rail-footer">
          <div className="sync-dot" />
          <div><strong>本地空间</strong><span>已自动保存</span></div>
          <MoreHorizontal size={15} className="muted-icon" />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumbs"><span>工作空间</span><ChevronRight size={14} /><strong>{section === 'bookmarks' ? '书签看板' : section === 'kubeconfig' ? 'Kubeconfig' : '偏好设置'}</strong></div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索链接、配置、标签…" />
              {query && <button className="icon-button tiny" onClick={() => setQuery('')} aria-label="清空搜索"><X size={13} /></button>}
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'} title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-button" aria-label="帮助"><CircleHelp size={17} /></button>
            <div className="avatar">DY</div>
          </div>
        </header>

        {section === 'bookmarks' && (
          <BookmarksView
            boards={boards}
            setBoards={setBoards}
            query={query}
            addBoard={addBoard}
            onImport={() => importRef.current?.click()}
            onExport={(board) => exportBoard(board)}
            onExportAll={exportWorkspace}
            onCopy={copyText}
            notify={notify}
          />
        )}
        {section === 'kubeconfig' && <KubeconfigView configs={kubeConfigs} setConfigs={setKubeConfigs} groups={kubeGroups} setGroups={setKubeGroups} query={query} onCopy={copyText} notify={notify} />}
        {section === 'settings' && <SettingsView boards={boards} configs={kubeConfigs} theme={theme} onThemeChange={setTheme} />}
      </main>

      <input ref={importRef} type="file" accept=".html,.htm" hidden onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void handleBookmarkImport(file)
        event.target.value = ''
      }} />
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}

function NavItem({ icon, label, active, onClick, soon }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; soon?: boolean }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{soon && <em>Soon</em>}</button>
}

function BookmarksView({ boards, setBoards, query, addBoard, onImport, onExport, onExportAll, onCopy, notify }: {
  boards: BookmarkBoard[]
  setBoards: React.Dispatch<React.SetStateAction<BookmarkBoard[]>>
  query: string
  addBoard: () => void
  onImport: () => void
  onExport: (board: BookmarkBoard) => void
  onExportAll: () => void
  onCopy: (value: string, label?: string) => void
  notify: (message: string) => void
}) {
  const [activeBoardId, setActiveBoardId] = useState(boards[0]?.id ?? '')
  const [activeGroupId, setActiveGroupId] = useState('all')
  const [tagFilter, setTagFilter] = useState('全部')
  const [draggedLink, setDraggedLink] = useState<string | null>(null)
  const [expandedBoards, setExpandedBoards] = useState<Record<string, boolean>>(() => Object.fromEntries(boards.map((board) => [board.id, true])))
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [newLink, setNewLink] = useState({ title: '', url: '', groupId: '' })
  const [newGroupName, setNewGroupName] = useState('')

  useEffect(() => {
    if (!boards.some((board) => board.id === activeBoardId)) setActiveBoardId(boards[0]?.id ?? '')
  }, [boards, activeBoardId])

  const board = boards.find((item) => item.id === activeBoardId) ?? boards[0]
  const allTags = useMemo(() => ['全部', ...new Set(board?.links.flatMap((link) => link.tags) ?? [])], [board])
  const visibleLinks = useMemo(() => {
    if (!board) return []
    const normalized = query.toLowerCase().trim()
    return board.links.filter((link) => {
      const matchesGroup = activeGroupId === 'all' || link.groupId === activeGroupId
      const matchesTag = tagFilter === '全部' || link.tags.includes(tagFilter)
      const matchesSearch = !normalized || `${link.title} ${link.url} ${link.description ?? ''} ${link.tags.join(' ')}`.toLowerCase().includes(normalized)
      return matchesGroup && matchesTag && matchesSearch
    })
  }, [board, activeGroupId, tagFilter, query])

  const updateBoard = (updater: (current: BookmarkBoard) => BookmarkBoard) => {
    if (!board) return
    setBoards((current) => current.map((item) => item.id === board.id ? updater(item) : item))
  }

  const addLink = () => {
    if (!board || !newLink.title.trim() || !newLink.url.trim()) return
    const groupId = newLink.groupId || board.groups[0]?.id
    if (!groupId) return
    updateBoard((current) => ({ ...current, updatedAt: new Date().toISOString(), links: [{ id: uid('link'), title: newLink.title.trim(), url: newLink.url.trim(), groupId, tags: ['新建'], description: '刚添加的链接', addedAt: new Date().toISOString() }, ...current.links] }))
    setNewLink({ title: '', url: '', groupId: '' })
    setShowQuickAdd(false)
    notify('链接已添加')
  }

  const addGroup = () => {
    if (!board || !newGroupName.trim()) return
    updateBoard((current) => ({ ...current, groups: [...current.groups, { id: uid('group'), name: newGroupName.trim(), color: '#c486ff' }] }))
    setNewGroupName('')
    setShowGroupAdd(false)
    notify('分组已添加')
  }

  const moveLink = (targetGroupId: string) => {
    if (!draggedLink) return
    updateBoard((current) => ({ ...current, links: current.links.map((link) => link.id === draggedLink ? { ...link, groupId: targetGroupId } : link) }))
    setDraggedLink(null)
    notify('链接已移动')
  }

  const deleteBoard = () => {
    if (boards.length <= 1) {
      notify('至少保留一个看板')
      return
    }
    if (!window.confirm(`确定删除“${board.name}”吗？其中的链接也会一起移除。`)) return
    const remaining = boards.filter((item) => item.id !== board.id)
    setBoards(remaining)
    setActiveBoardId(remaining[0]?.id ?? '')
    setActiveGroupId('all')
    notify('看板已删除')
  }

  if (!board) return <div className="empty-state"><Archive size={30} /><h2>还没有看板</h2><p>导入浏览器书签或创建一个新的工作看板。</p><button className="primary-button" onClick={addBoard}><Plus size={16} />创建看板</button></div>

  return <div className="content-wrap">
    <div className="page-heading">
      <div><div className="eyebrow"><span className="eyebrow-dot" />COLLECTIONS</div><h1>书签看板</h1><p>把浏览器里散落的链接，整理成可以快速行动的工作台。</p></div>
      <div className="heading-actions"><button className="ghost-button" onClick={onImport}><FileUp size={16} />导入书签</button><button className="ghost-button" onClick={() => { setNewLink({ title: '', url: '', groupId: board.groups[0]?.id ?? '' }); setShowQuickAdd(true) }}><Link2 size={15} />添加链接</button><button className="ghost-button" onClick={() => board && onExport(board)}><FileDown size={16} />导出当前</button><button className="ghost-button" onClick={onExportAll}><Archive size={15} />导出全部</button><button className="primary-button" onClick={addBoard}><Plus size={16} />新建看板</button></div>
    </div>

    <div className="workspace-grid">
      <aside className="collection-sidebar">
        <div className="side-section-header"><span>我的看板 <b>{boards.length}</b></span><button className="icon-button tiny" onClick={addBoard} aria-label="新建看板"><Plus size={15} /></button></div>
        <div className="board-tree">
          {boards.map((item) => <div key={item.id} className="tree-item-wrap">
            <div className={`tree-item ${item.id === board.id ? 'selected' : ''}`} onClick={() => { setActiveBoardId(item.id); setActiveGroupId('all'); setTagFilter('全部') }}>
              <button className="disclosure" onClick={(event) => { event.stopPropagation(); setExpandedBoards((current) => ({ ...current, [item.id]: !current[item.id] })) }}>{expandedBoards[item.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <FolderOpen size={16} className="tree-folder" /> <span>{item.name}</span><b>{item.links.length}</b>
            </div>
            {expandedBoards[item.id] && item.id === board.id && <div className="tree-children">{item.groups.map((group) => <button key={group.id} className={`tree-child ${activeGroupId === group.id ? 'selected' : ''}`} onClick={() => { setActiveGroupId(group.id); setTagFilter('全部') }}><span className="group-dot" style={{ background: group.color }} />{group.name}<small>{item.links.filter((link) => link.groupId === group.id).length}</small></button>)}</div>}
          </div>)}
        </div>
        <button className="add-inline" onClick={addBoard}><Plus size={14} />添加看板</button>
        <div className="side-helper"><Sparkles size={15} /><div><strong>小提示</strong><p>拖拽链接到左侧分组即可整理。</p></div></div>
      </aside>

      <section className="board-stage">
        <div className="board-header">
          <div className="board-title-row"><div className="board-icon"><LayoutGrid size={18} /></div><div><div className="title-with-menu"><h2>{board.name}</h2><button className="icon-button tiny" onClick={deleteBoard} aria-label="删除看板"><Trash2 size={14} /></button></div><p>{board.description}</p></div></div>
          <div className="board-meta"><span><Link2 size={14} />{board.links.length} 个链接</span><span><CloudDownload size={14} />更新于刚刚</span></div>
          <div className="tag-row">{board.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </div>
        <div className="stage-toolbar"><div className="filter-tabs"><button className={activeGroupId === 'all' ? 'active' : ''} onClick={() => setActiveGroupId('all')}>全部链接 <b>{board.links.length}</b></button>{board.groups.map((group) => <button key={group.id} className={activeGroupId === group.id ? 'active' : ''} onClick={() => setActiveGroupId(group.id)}><span className="group-dot" style={{ background: group.color }} />{group.name}</button>)}</div><button className="toolbar-button" onClick={() => setShowGroupAdd(true)}><Plus size={15} />分组</button></div>
        <div className="tag-filter-row"><span><ListFilter size={14} />标签筛选</span>{allTags.map((tag) => <button key={tag} className={tagFilter === tag ? 'active' : ''} onClick={() => setTagFilter(tag)}>{tag}</button>)}</div>

        {visibleLinks.length ? <div className="link-list">{visibleLinks.map((link) => <LinkRow key={link.id} link={link} group={board.groups.find((group) => group.id === link.groupId)} onCopy={onCopy} onDelete={() => { updateBoard((current) => ({ ...current, links: current.links.filter((item) => item.id !== link.id) })); notify('链接已删除') }} onDragStart={() => setDraggedLink(link.id)} />)}</div> : <div className="empty-board"><Search size={24} /><h3>没有匹配的链接</h3><p>试试搜索其他关键词，或切换标签筛选。</p><button className="ghost-button" onClick={() => { setTagFilter('全部'); setActiveGroupId('all') }}>清除筛选</button></div>}

        <div className="drop-zones"><span>拖放到分组</span>{board.groups.map((group) => <button key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={() => moveLink(group.id)}><span className="group-dot" style={{ background: group.color }} />{group.name}<ChevronRight size={13} /></button>)}</div>
      </section>

      <aside className="board-inspector">
        <div className="inspector-header"><span>快捷操作</span><Zap size={15} /></div>
        <button className="quick-action" onClick={() => { setNewLink({ title: '', url: '', groupId: board.groups[0]?.id ?? '' }); setShowQuickAdd(true) }}><div className="quick-icon blue"><Plus size={17} /></div><div><strong>添加链接</strong><span>保存一个新网址</span></div><ChevronRight size={15} /></button>
        <button className="quick-action" onClick={() => onExport(board)}><div className="quick-icon green"><FileDown size={17} /></div><div><strong>导出看板</strong><span>保存为 Orbit JSON</span></div><ChevronRight size={15} /></button>
        <div className="inspector-divider" />
        <div className="inspector-block"><div className="inspector-label">最近添加</div>{board.links.slice(0, 3).map((link) => <div className="recent-link" key={link.id}><div className="favicon">{link.title.slice(0, 1)}</div><div><strong>{link.title}</strong><span>{link.url.replace(/^https?:\/\//, '').split('/')[0]}</span></div></div>)}</div>
        <div className="inspector-note"><ShieldCheck size={16} /><div><strong>本地优先</strong><p>数据保存在当前设备，导出文件可用于迁移。</p></div></div>
      </aside>
    </div>
    {showQuickAdd && <Modal title="添加链接" onClose={() => setShowQuickAdd(false)}><div className="form-stack"><label>链接名称<input value={newLink.title} onChange={(event) => setNewLink((current) => ({ ...current, title: event.target.value }))} placeholder="例如：Kubernetes 文档" autoFocus /></label><label>网址<input value={newLink.url} onChange={(event) => setNewLink((current) => ({ ...current, url: event.target.value }))} placeholder="https://" /></label><label>所属分组<select value={newLink.groupId || board.groups[0]?.id} onChange={(event) => setNewLink((current) => ({ ...current, groupId: event.target.value }))}>{board.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowQuickAdd(false)}>取消</button><button className="primary-button" onClick={addLink}>保存链接</button></div></div></Modal>}
    {showGroupAdd && <Modal title="添加分组" onClose={() => setShowGroupAdd(false)}><div className="form-stack"><label>分组名称<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="例如：设计灵感" autoFocus /></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowGroupAdd(false)}>取消</button><button className="primary-button" onClick={addGroup}>保存分组</button></div></div></Modal>}
  </div>
}

function LinkRow({ link, group, onCopy, onDelete, onDragStart }: { link: BookmarkBoard['links'][number]; group?: BookmarkBoard['groups'][number]; onCopy: (value: string, label?: string) => void; onDelete: () => void; onDragStart: () => void }) {
  const hostname = link.url.replace(/^(https?:\/\/|chrome-extension:\/\/)/, '').split('/')[0]
  return <article className="link-row" draggable onDragStart={onDragStart}>
    <div className="favicon large">{link.title.slice(0, 1)}</div>
    <div className="row-content"><a className="link-title" href={link.url} target="_blank" rel="noreferrer">{link.title}<ExternalLink size={13} /></a><div className="link-host">{hostname}</div>{link.description && <p>{link.description}</p>}</div>
    <span className="group-label row-group"><span className="group-dot" style={{ background: group?.color }} />{group?.name ?? '未分组'}</span>
    <div className="mini-tags row-tags">{link.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className="row-actions"><button className="icon-button tiny" onClick={() => onCopy(link.url, '链接已复制')} aria-label="复制链接"><Copy size={14} /></button><button className="icon-button tiny" onClick={() => window.open(link.url, '_blank')} aria-label="打开链接"><ArrowUpRight size={15} /></button><button className="icon-button tiny danger-hover" onClick={onDelete} aria-label="删除链接"><Trash2 size={14} /></button><GripVertical size={14} className="drag-handle" /></div>
  </article>
}

function KubeconfigView({ configs, setConfigs, groups, setGroups, query, onCopy, notify }: { configs: KubeConfig[]; setConfigs: React.Dispatch<React.SetStateAction<KubeConfig[]>>; groups: KubeGroup[]; setGroups: React.Dispatch<React.SetStateAction<KubeGroup[]>>; query: string; onCopy: (value: string, label?: string) => void; notify: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(configs[0]?.id ?? '')
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [templateId, setTemplateId] = useState(commandTemplates[0].id)
  const [namespace, setNamespace] = useState('default')
  const [extraArgs, setExtraArgs] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newConfig, setNewConfig] = useState({ name: '', path: '', groupId: groups[0]?.id ?? '' })
  const [draggedConfig, setDraggedConfig] = useState<string | null>(null)
  const selected = configs.find((config) => config.id === selectedId) ?? configs[0]
  const filteredConfigs = configs.filter((config) => {
    const text = `${config.name} ${config.path} ${config.context} ${config.tags.join(' ')}`.toLowerCase()
    return (selectedGroup === 'all' || config.groupId === selectedGroup) && (!query || text.includes(query.toLowerCase()))
  })
  const template = commandTemplates.find((item) => item.id === templateId) ?? commandTemplates[0]
  const generatedCommand = selected ? `META=${selected.path}\nKUBECONFIG=$META kubectl ${template.command}${namespace && namespace !== 'default' ? ` -n ${namespace}` : ''}${extraArgs ? ` ${extraArgs}` : ''}` : ''

  useEffect(() => {
    if (!filteredConfigs.some((item) => item.id === selectedId)) setSelectedId(filteredConfigs[0]?.id ?? configs[0]?.id ?? '')
  }, [filteredConfigs, selectedId, configs])

  const addConfig = () => {
    if (!newConfig.name.trim() || !newConfig.path.trim()) return
    const item: KubeConfig = { id: uid('kube'), name: newConfig.name.trim(), path: newConfig.path.trim(), groupId: newConfig.groupId || groups[0]?.id, context: '未读取 context', server: '待检测', tags: ['新建'], updatedAt: '刚刚' }
    setConfigs((current) => [item, ...current])
    setSelectedId(item.id)
    setShowAdd(false)
    setNewConfig({ name: '', path: '', groupId: groups[0]?.id ?? '' })
    notify('kubeconfig 已添加')
  }

  const addKubeGroup = () => {
    const name = window.prompt('分组名称', '新环境')?.trim()
    if (!name) return
    setGroups((current) => [...current, { id: uid('kube-group'), name, color: '#f2ab55' }])
    notify('分组已添加')
  }

  const moveConfig = (groupId: string) => {
    if (!draggedConfig) return
    setConfigs((current) => current.map((item) => item.id === draggedConfig ? { ...item, groupId } : item))
    setDraggedConfig(null)
    notify('配置已移动')
  }

  const deleteConfig = () => {
    if (!selected) return
    if (!window.confirm(`确定移除 kubeconfig “${selected.name}”吗？`)) return
    const remaining = configs.filter((item) => item.id !== selected.id)
    setConfigs(remaining)
    setSelectedId(remaining[0]?.id ?? '')
    notify('kubeconfig 已移除')
  }

  return <div className="content-wrap kube-page">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot green" />CLUSTER ACCESS</div><h1>Kubeconfig 管理</h1><p>把散落在不同目录的集群入口，整理成一组可复制的命令。</p></div><div className="heading-actions"><button className="ghost-button" onClick={addKubeGroup}><Plus size={16} />新建分组</button><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} />添加配置</button></div></div>
    <div className="kube-summary"><div><div className="summary-icon blue"><Database size={18} /></div><div><strong>{configs.length}</strong><span>个配置文件</span></div></div><div><div className="summary-icon green"><ShieldCheck size={18} /></div><div><strong>{groups.length}</strong><span>个环境分组</span></div></div><div><div className="summary-icon orange"><Command size={18} /></div><div><strong>{commandTemplates.length}</strong><span>条常用命令</span></div></div><div className="summary-tip"><Sparkles size={16} /><span>选择配置后，命令会自动带上 KUBECONFIG</span></div></div>
    <div className="kube-grid">
      <aside className="kube-groups panel"><div className="panel-title"><span>环境分组</span><button className="icon-button tiny" onClick={addKubeGroup}><Plus size={15} /></button></div><button className={`kube-group-item ${selectedGroup === 'all' ? 'active' : ''}`} onClick={() => setSelectedGroup('all')}><div className="group-icon"><HardDrive size={15} /></div><span>全部配置</span><b>{configs.length}</b></button>{groups.map((group) => <button className={`kube-group-item ${selectedGroup === group.id ? 'active' : ''}`} key={group.id} onClick={() => setSelectedGroup(group.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveConfig(group.id)}><div className="group-icon" style={{ color: group.color, background: `${group.color}18` }}><Folder size={15} /></div><span>{group.name}</span><b>{configs.filter((config) => config.groupId === group.id).length}</b></button>)}<div className="group-drop-hint"><GripVertical size={14} />拖动配置到分组</div></aside>
      <section className="config-list panel"><div className="panel-title"><span>配置文件 <b>{filteredConfigs.length}</b></span><button className="icon-button tiny"><ListFilter size={15} /></button></div>{filteredConfigs.map((config) => <button key={config.id} className={`config-row ${selected?.id === config.id ? 'active' : ''}`} onClick={() => setSelectedId(config.id)} draggable onDragStart={() => setDraggedConfig(config.id)}><div className="config-file-icon"><KeyRound size={17} /></div><div className="config-row-main"><strong>{config.name}</strong><span>{config.path}</span><div className="config-row-meta"><span className="context-pill">{config.context}</span>{config.tags.map((tag) => <em key={tag}>{tag}</em>)}</div></div><ChevronRight size={15} className="row-chevron" /></button>)}{!filteredConfigs.length && <div className="panel-empty"><Search size={22} /><p>没有找到匹配的配置</p></div>}<button className="add-config-row" onClick={() => setShowAdd(true)}><Plus size={15} />添加一个 kubeconfig</button></section>
      <section className="command-panel panel"><div className="command-panel-header"><div><div className="panel-kicker"><Terminal size={14} />COMMAND BUILDER</div><h2>命令生成器</h2><p>选择命令后直接复制到终端。</p></div><div className="terminal-badge"><span />shell</div></div>{selected ? <><div className="selected-config"><div className="config-file-icon big"><KeyRound size={18} /></div><div><span>当前配置</span><strong>{selected.name}</strong><small>{selected.path}</small></div><button className="icon-button tiny" onClick={() => onCopy(selected.path, '路径已复制')} aria-label="复制配置路径"><Copy size={14} /></button><button className="icon-button tiny danger-hover" onClick={deleteConfig} aria-label="删除配置"><Trash2 size={14} /></button></div><div className="command-form"><label>常用命令<select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{commandTemplates.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.command}</option>)}</select></label><div className="form-row"><label>命名空间<input value={namespace} onChange={(event) => setNamespace(event.target.value)} placeholder="default" /></label><label>附加参数<input value={extraArgs} onChange={(event) => setExtraArgs(event.target.value)} placeholder="例如 --watch" /></label></div></div><div className="command-preview"><div className="preview-header"><span>预览</span><button className="copy-command" onClick={() => onCopy(generatedCommand, '命令已复制')}><Copy size={14} />复制命令</button></div><pre><code>{generatedCommand.split('\n').map((line, index) => <span key={line}><i>{index === 0 ? 'export' : '$'}</i>{line}{index < generatedCommand.split('\n').length - 1 && '\n'}</span>)}</code></pre></div><div className="command-note"><ShieldCheck size={15} /><span>命令只在本地生成，不会执行或上传配置内容。</span></div></> : <div className="panel-empty"><KeyRound size={22} /><p>选择一个配置开始</p></div>}</section>
    </div>
    {showAdd && <Modal title="添加 kubeconfig" onClose={() => setShowAdd(false)}><div className="form-stack"><label>配置名称<input autoFocus value={newConfig.name} onChange={(event) => setNewConfig((current) => ({ ...current, name: event.target.value }))} placeholder="例如：production" /></label><label>文件路径<input value={newConfig.path} onChange={(event) => setNewConfig((current) => ({ ...current, path: event.target.value }))} placeholder="~/.kube/config" /></label><label>所属分组<select value={newConfig.groupId || groups[0]?.id} onChange={(event) => setNewConfig((current) => ({ ...current, groupId: event.target.value }))}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowAdd(false)}>取消</button><button className="primary-button" onClick={addConfig}>保存配置</button></div></div></Modal>}
  </div>
}

function SettingsView({ boards, configs, theme, onThemeChange }: { boards: BookmarkBoard[]; configs: KubeConfig[]; theme: Theme; onThemeChange: React.Dispatch<React.SetStateAction<Theme>> }) {
  return <div className="content-wrap settings-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />WORKSPACE</div><h1>偏好设置</h1><p>调整界面显示并检查工作区状态。</p></div></div><div className="settings-grid"><section className="settings-card theme-settings-card"><div className={`settings-card-icon ${theme === 'light' ? 'orange' : ''}`}>{theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}</div><div><h3>界面主题</h3><p>在暗色和亮色界面之间切换，选择会自动保存到本机。</p></div><div className="theme-switch" role="group" aria-label="界面主题"><button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}><Moon size={13} />暗色</button><button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}><Sun size={13} />亮色</button></div></section><section className="settings-card"><div className="settings-card-icon"><Laptop size={18} /></div><div><h3>本地工作区</h3><p>当前版本将数据保存到浏览器本地存储，适合单机使用和快速验证。</p></div><span className="status-badge"><span />正常</span></section><section className="settings-card"><div className="settings-card-icon green"><Archive size={18} /></div><div><h3>数据概览</h3><p>{boards.length} 个书签看板 · {configs.length} 个 kubeconfig · 自动保存已开启</p></div><span className="status-badge"><span />已同步</span></section><section className="settings-card"><div className="settings-card-icon orange"><Code2 size={18} /></div><div><h3>跨平台路线</h3><p>桌面端可接入 Tauri 文件系统；Apple 端可复用同一数据模型，接入 iCloud 或 CloudKit。</p></div><span className="version-label">v0.1</span></section></div></div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><div className="modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={17} /></button></div>{children}</div></div>
}

function parseBookmarksHtml(html: string): BookmarkBoard[] {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const root = document.querySelector('dl')
  if (!root) return []
  const parseFolder = (dl: Element, boardName: string, parentGroupId?: string): { groups: BookmarkBoard['groups']; links: BookmarkBoard['links'] } => {
    const groups: BookmarkBoard['groups'] = []
    const links: BookmarkBoard['links'] = []
    const direct = Array.from(dl.children)
    let currentGroupId = parentGroupId
    for (const child of direct) {
      if (child.tagName !== 'DT') continue
      const heading = child.querySelector(':scope > h3')
      const anchor = child.querySelector(':scope > a')
      if (heading) {
        const groupId = uid('group')
        groups.push({ id: groupId, name: heading.textContent?.trim() || '未命名分组', color: groups.length % 2 ? '#44c7a5' : '#6f8cff' })
        currentGroupId = groupId
        const childDl = child.querySelector(':scope > dl')
        if (childDl) {
          const nested = parseFolder(childDl, boardName, groupId)
          groups.push(...nested.groups)
          links.push(...nested.links)
        }
      } else if (anchor) {
        const url = anchor.getAttribute('href') || ''
        if (!url) continue
        const groupId = currentGroupId || parentGroupId || 'group-imported'
        if (!groups.some((group) => group.id === groupId)) groups.push({ id: groupId, name: '未分组', color: '#f2ab55' })
        links.push({ id: uid('link'), title: anchor.textContent?.trim() || url, url, groupId, tags: [], description: '从浏览器书签导入', addedAt: new Date().toISOString() })
      }
    }
    return { groups, links }
  }

  const boards: BookmarkBoard[] = []
  for (const child of Array.from(root.children)) {
    if (child.tagName !== 'DT') continue
    const heading = child.querySelector(':scope > h3')
    const dl = child.querySelector(':scope > dl')
    if (!heading || !dl) continue
    const name = heading.textContent?.trim() || '导入看板'
    const parsed = parseFolder(dl, name)
    boards.push({ id: uid('board'), name, description: '从浏览器书签导入', tags: ['导入'], groups: parsed.groups, links: parsed.links, updatedAt: new Date().toISOString() })
  }
  return boards
}

export default App
