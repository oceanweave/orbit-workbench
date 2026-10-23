import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowDownUp,
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
  Info,
  KeyRound,
  Laptop,
  LayoutGrid,
  Link2,
  ListFilter,
  MoreHorizontal,
  Plus,
  Pencil,
  Search,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  SlidersHorizontal,
  Server,
  Terminal,
  Trash2,
  X,
  Zap,
  Moon,
} from 'lucide-react'
import { commandTemplates, initialBoards, initialKubeConfigs, initialKubeGroups } from './data'
import type { BookmarkBoard, CommandTemplate, KubeConfig, KubeGroup } from './types'

type Section = 'bookmarks' | 'kubeconfig' | 'settings'
type Theme = 'dark' | 'light'
type ConfigSort = 'created' | 'name'
type KubeSource = 'file' | 'directory' | 'clipboard'

const kubeGroupPalette = ['#5d73e6', '#27a987', '#e09a38', '#a660d8', '#e35d74', '#2d9bc0', '#6f7d90', '#d46f35']

const filenameStem = (value: string) => value.split(/[\\/]/).pop()?.replace(/\.[^./]+$/, '') ?? ''

const deriveEnvName = (value: string, fallback = 'KUBECONFIG') => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^META_+/, '')
  if (!normalized) return fallback
  return /^[A-Z_]/.test(normalized) ? normalized : `KUBE_${normalized}`
}

const quoteShellValue = (value: string) => /^[A-Za-z0-9_./~:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`

const displayEnvName = (config: KubeConfig) => deriveEnvName(config.envName || config.alias || config.metaName?.replace(/^META_/i, '') || config.name || filenameStem(config.path))

const parseKubeconfigContent = (content: string) => {
  const currentContext = content.match(/^\s*current-context:\s*([^#\n]+)\s*$/m)?.[1]?.trim() ?? ''
  const contextsSection = content.match(/(?:^|\n)contexts:\s*\n([\s\S]*?)(?=\n(?:clusters|users|current-context|preferences):|$)/)?.[1] ?? ''
  const contexts = Array.from(contextsSection.matchAll(/^\s*-\s*name:\s*([^#\n]+)\s*$/gm)).map((match) => match[1].trim()).filter(Boolean)
  const server = content.match(/^\s*server:\s*([^#\n]+)\s*$/m)?.[1]?.trim() ?? ''
  return { context: currentContext || contexts[0] || '', contexts: Array.from(new Set(contexts)), server }
}

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
  const [kubeCommands, setKubeCommands] = usePersistentState<CommandTemplate[]>('orbit-kube-commands', commandTemplates)
  const [defaultCommandId, setDefaultCommandId] = usePersistentState('orbit-default-kube-command', commandTemplates[0]?.id ?? '')
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

  useEffect(() => {
    localStorage.removeItem('orbit-default-kube-config')
  }, [])

  useEffect(() => {
    const seedById = new Map(initialKubeConfigs.map((config) => [config.id, config]))
    setKubeConfigs((current) => {
      let changed = false
      const next = current.map((config) => {
        const seed = seedById.get(config.id)
        const contexts = config.contexts?.length ? config.contexts : seed?.contexts?.length ? seed.contexts : config.context ? [config.context] : []
        const createdAt = config.createdAt ?? seed?.createdAt
        const envName = deriveEnvName(config.envName || config.alias || config.metaName?.replace(/^META_/i, '') || seed?.envName || seed?.alias || config.name || filenameStem(config.path))
        const alias = envName
        const metaName = envName
        const content = config.content ?? seed?.content
        const source = config.source ?? seed?.source ?? 'file'
        if (contexts.length !== (config.contexts?.length ?? 0) || createdAt !== config.createdAt || envName !== config.envName || alias !== config.alias || metaName !== config.metaName || content !== config.content || source !== config.source) changed = true
        return changed ? { ...config, contexts, createdAt, envName, alias, metaName, content, source } : config
      })
      return changed ? next : current
    })
  }, [])

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

  const addBoard = (requestedName = '新看板') => {
    const name = requestedName.trim() || '新看板'
    const id = uid('board')
    const board: BookmarkBoard = {
      id,
      name,
      description: '整理一组重要链接',
      tags: ['新建'],
      updatedAt: new Date().toISOString(),
      groups: [{ id: uid('group'), name: '未分组', color: '#6f8cff' }],
      links: [],
    }
    setBoards((current) => [board, ...current])
    notify('看板已创建')
    return id
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
        {section === 'kubeconfig' && <KubeconfigView configs={kubeConfigs} setConfigs={setKubeConfigs} groups={kubeGroups} setGroups={setKubeGroups} commands={kubeCommands} setCommands={setKubeCommands} defaultCommandId={defaultCommandId} onDefaultCommandChange={setDefaultCommandId} query={query} onCopy={copyText} notify={notify} />}
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
  addBoard: (name?: string) => string
  onImport: () => void
  onExport: (board: BookmarkBoard) => void
  onExportAll: () => void
  onCopy: (value: string, label?: string) => void
  notify: (message: string) => void
}) {
  const [activeBoardId, setActiveBoardId] = useState(boards[0]?.id ?? '')
  const [activeGroupId, setActiveGroupId] = useState('all')
  const [tagFilter, setTagFilter] = useState('全部')
  const [draggedLink, setDraggedLink] = useState<{ boardId: string; linkId: string } | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const dragPreviewRef = useRef<HTMLDivElement | null>(null)
  const [expandedBoards, setExpandedBoards] = useState<Record<string, boolean>>(() => Object.fromEntries(boards.map((board) => [board.id, true])))
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [showBoardAdd, setShowBoardAdd] = useState(false)
  const [newLink, setNewLink] = useState({ title: '', url: '', groupId: '' })
  const [newGroupName, setNewGroupName] = useState('')
  const [newBoardName, setNewBoardName] = useState('')

  useEffect(() => {
    if (!boards.some((board) => board.id === activeBoardId)) setActiveBoardId(boards[0]?.id ?? '')
  }, [boards, activeBoardId])

  useEffect(() => {
    setExpandedBoards((current) => {
      const next = { ...current }
      boards.forEach((item) => {
        if (next[item.id] === undefined) next[item.id] = true
      })
      return next
    })
  }, [boards])

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

  const openBoardAdd = () => {
    setNewBoardName(`新看板 ${boards.length + 1}`)
    setShowBoardAdd(true)
  }

  const createBoard = () => {
    const name = newBoardName.trim()
    if (!name) {
      notify('请输入看板名称')
      return
    }
    const id = addBoard(name)
    setActiveBoardId(id)
    setActiveGroupId('all')
    setTagFilter('全部')
    setExpandedBoards((current) => ({ ...current, [id]: true }))
    setNewBoardName('')
    setShowBoardAdd(false)
  }

  const moveLink = (targetBoardId: string, targetGroupId: string) => {
    if (!draggedLink) return
    const sourceBoardId = draggedLink.boardId
    const sourceLinkId = draggedLink.linkId
    setBoards((current) => {
      const sourceBoard = current.find((item) => item.id === sourceBoardId)
      const targetBoard = current.find((item) => item.id === targetBoardId)
      const sourceLink = sourceBoard?.links.find((link) => link.id === sourceLinkId)
      if (!sourceBoard || !targetBoard || !sourceLink || !targetBoard.groups.some((group) => group.id === targetGroupId)) return current
      const timestamp = new Date().toISOString()
      if (sourceBoardId === targetBoardId) {
        return current.map((item) => item.id === sourceBoardId
          ? { ...item, updatedAt: timestamp, links: item.links.map((link) => link.id === sourceLinkId ? { ...link, groupId: targetGroupId } : link) }
          : item)
      }
      return current.map((item) => {
        if (item.id === sourceBoardId) return { ...item, updatedAt: timestamp, links: item.links.filter((link) => link.id !== sourceLinkId) }
        if (item.id === targetBoardId) return { ...item, updatedAt: timestamp, links: [{ ...sourceLink, groupId: targetGroupId }, ...item.links] }
        return item
      })
    })
    setActiveBoardId(targetBoardId)
    setActiveGroupId(targetGroupId)
    setTagFilter('全部')
    setDraggedLink(null)
    setDragOverTarget(null)
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

  if (!board) return <div className="empty-state"><Archive size={30} /><h2>还没有看板</h2><p>导入浏览器书签或创建一个新的工作看板。</p><button className="primary-button" onClick={() => addBoard()}><Plus size={16} />创建看板</button></div>

  return <div className="content-wrap">
    <div className="page-heading">
      <div><div className="eyebrow"><span className="eyebrow-dot" />COLLECTIONS</div><h1>书签看板</h1><p>把浏览器里散落的链接，整理成可以快速行动的工作台。</p></div>
      <div className="heading-actions"><button className="ghost-button" onClick={onImport}><FileUp size={16} />导入书签</button><button className="ghost-button" onClick={() => { setNewLink({ title: '', url: '', groupId: board.groups[0]?.id ?? '' }); setShowQuickAdd(true) }}><Link2 size={15} />添加链接</button><button className="ghost-button" onClick={() => board && onExport(board)}><FileDown size={16} />导出当前</button><button className="ghost-button" onClick={onExportAll}><Archive size={15} />导出全部</button><button className="primary-button" onClick={openBoardAdd}><Plus size={16} />新建看板</button></div>
    </div>

    <div className="workspace-grid">
      <aside className={`collection-sidebar ${draggedLink ? 'is-dragging' : ''}`}>
        <div className="side-section-header"><span>我的看板 <b>{boards.length}</b></span><button className="icon-button tiny" onClick={openBoardAdd} aria-label="新建看板"><Plus size={15} /></button></div>
        {draggedLink && <div className="sidebar-drop-hint"><GripVertical size={14} /><div><strong>移动链接</strong><span>拖到高亮分组后松开</span></div></div>}
        <div className="board-tree">
          {boards.map((item) => <div key={item.id} className="tree-item-wrap">
            <div className={`tree-item ${item.id === board.id ? 'selected' : ''}`} onClick={() => { setActiveBoardId(item.id); setActiveGroupId('all'); setTagFilter('全部') }}>
              <button className="disclosure" onClick={(event) => { event.stopPropagation(); setExpandedBoards((current) => ({ ...current, [item.id]: !current[item.id] })) }}>{expandedBoards[item.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <FolderOpen size={16} className="tree-folder" /> <span>{item.name}</span><b>{item.links.length}</b>
            </div>
            {expandedBoards[item.id] && <div className="tree-children">{item.groups.map((group) => {
              const targetId = `${item.id}:${group.id}`
              const isTarget = dragOverTarget === targetId
              return <button key={group.id} className={`tree-child ${item.id === board.id && activeGroupId === group.id ? 'selected' : ''} ${isTarget ? 'drop-target' : ''}`} aria-label={`${item.name} / ${group.name}，拖放链接到此分组`} onClick={() => { setActiveBoardId(item.id); setActiveGroupId(group.id); setTagFilter('全部') }} onDragEnter={() => { if (draggedLink) setDragOverTarget(targetId) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (draggedLink) setDragOverTarget(targetId) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverTarget((current) => current === targetId ? null : current) }} onDrop={(event) => { event.preventDefault(); moveLink(item.id, group.id) }}><span className="group-dot" style={{ background: group.color }} /><span className="tree-child-label">{group.name}</span><small>{item.links.filter((link) => link.groupId === group.id).length}</small>{isTarget && <em>松开归类</em>}</button>
            })}</div>}
          </div>)}
        </div>
        <button className="add-inline" onClick={openBoardAdd}><Plus size={14} />添加看板</button>
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

        {visibleLinks.length ? <div className="link-list">{visibleLinks.map((link) => <LinkRow key={link.id} link={link} group={board.groups.find((group) => group.id === link.groupId)} isDragging={draggedLink?.linkId === link.id && draggedLink.boardId === board.id} onCopy={onCopy} onDelete={() => { updateBoard((current) => ({ ...current, links: current.links.filter((item) => item.id !== link.id) })); notify('链接已删除') }} onDragStart={(event) => { const target = event.target as HTMLElement; if (target.closest('a, button')) { event.preventDefault(); return } dragPreviewRef.current?.remove(); const preview = document.createElement('div'); preview.className = 'drag-preview'; preview.textContent = link.title; document.body.appendChild(preview); dragPreviewRef.current = preview; event.dataTransfer.setDragImage(preview, 18, 18); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `${board.id}:${link.id}`); setDraggedLink({ boardId: board.id, linkId: link.id }) }} onDragEnd={() => { dragPreviewRef.current?.remove(); dragPreviewRef.current = null; setDraggedLink(null); setDragOverTarget(null) }} />)}</div> : <div className="empty-board"><Search size={24} /><h3>没有匹配的链接</h3><p>试试搜索其他关键词，或切换标签筛选。</p><button className="ghost-button" onClick={() => { setTagFilter('全部'); setActiveGroupId('all') }}>清除筛选</button></div>}

        <div className="drop-zones"><span>拖放到分组</span>{board.groups.map((group) => <button key={group.id} className={dragOverTarget === `stage:${group.id}` ? 'drop-target' : ''} onDragEnter={() => { if (draggedLink) setDragOverTarget(`stage:${group.id}`) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (draggedLink) setDragOverTarget(`stage:${group.id}`) }} onDragLeave={() => setDragOverTarget((current) => current === `stage:${group.id}` ? null : current)} onDrop={(event) => { event.preventDefault(); moveLink(board.id, group.id) }}><span className="group-dot" style={{ background: group.color }} />{group.name}<ChevronRight size={13} /></button>)}</div>
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
    {showBoardAdd && <Modal title="新建书签看板" onClose={() => setShowBoardAdd(false)}><div className="form-stack"><label>看板名称<input value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} placeholder="例如：前端开发" autoFocus onKeyDown={(event) => { if (event.key === 'Enter') createBoard() }} /></label><p className="form-hint">创建后会自动打开新看板，并附带一个“未分组”分组。</p><div className="modal-actions"><button className="ghost-button" onClick={() => setShowBoardAdd(false)}>取消</button><button className="primary-button" onClick={createBoard}><Save size={14} />创建看板</button></div></div></Modal>}
  </div>
}

function LinkRow({ link, group, isDragging, onCopy, onDelete, onDragStart, onDragEnd }: { link: BookmarkBoard['links'][number]; group?: BookmarkBoard['groups'][number]; isDragging?: boolean; onCopy: (value: string, label?: string) => void; onDelete: () => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void }) {
  const hostname = link.url.replace(/^(https?:\/\/|chrome-extension:\/\/)/, '').split('/')[0]
  return <article className={`link-row ${isDragging ? 'is-dragging' : ''}`} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <div className="favicon large">{link.title.slice(0, 1)}</div>
    <div className="row-content"><a className="link-title" href={link.url} target="_blank" rel="noreferrer">{link.title}<ExternalLink size={13} /></a><div className="link-host">{hostname}</div>{link.description && <p>{link.description}</p>}</div>
    <span className="group-label row-group"><span className="group-dot" style={{ background: group?.color }} />{group?.name ?? '未分组'}</span>
    <div className="mini-tags row-tags">{link.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className="row-actions"><button className="icon-button tiny" onClick={() => onCopy(link.url, '链接已复制')} aria-label="复制链接"><Copy size={14} /></button><button className="icon-button tiny" onClick={() => window.open(link.url, '_blank')} aria-label="打开链接"><ArrowUpRight size={15} /></button><button className="icon-button tiny danger-hover" onClick={onDelete} aria-label="删除链接"><Trash2 size={14} /></button><GripVertical size={14} className="drag-handle" /></div>
  </article>
}

function KubeconfigView({ configs, setConfigs, groups, setGroups, commands, setCommands, defaultCommandId, onDefaultCommandChange, query, onCopy, notify }: { configs: KubeConfig[]; setConfigs: React.Dispatch<React.SetStateAction<KubeConfig[]>>; groups: KubeGroup[]; setGroups: React.Dispatch<React.SetStateAction<KubeGroup[]>>; commands: CommandTemplate[]; setCommands: React.Dispatch<React.SetStateAction<CommandTemplate[]>>; defaultCommandId: string; onDefaultCommandChange: React.Dispatch<React.SetStateAction<string>>; query: string; onCopy: (value: string, label?: string) => void; notify: (message: string) => void }) {
  const initialSelectedId = configs[0]?.id ?? ''
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [templateId, setTemplateId] = useState(defaultCommandId && commands.some((item) => item.id === defaultCommandId) ? defaultCommandId : commands[0]?.id ?? '')
  const [context, setContext] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [extraArgs, setExtraArgs] = useState('')
  const [sortMode, setSortMode] = useState<ConfigSort>('created')
  const [showAdd, setShowAdd] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [showCommandManager, setShowCommandManager] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [newConfig, setNewConfig] = useState({ source: 'file' as KubeSource, name: '', envName: '', path: '', directoryPath: '', fileName: 'config.yaml', content: '', groupId: groups[0]?.id ?? '', contexts: '', server: '', tags: '' })
  const [newGroup, setNewGroup] = useState({ name: '', color: kubeGroupPalette[2] })
  const [savingConfig, setSavingConfig] = useState(false)
  const filePickerRef = useRef<HTMLInputElement>(null)
  const [draggedConfig, setDraggedConfig] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const kubeDragPreviewRef = useRef<HTMLDivElement | null>(null)
  const [envNameDraft, setEnvNameDraft] = useState('')
  const selected = configs.find((config) => config.id === selectedId) ?? configs[0]
  const filteredConfigs = configs.filter((config) => {
    const text = `${config.name} ${displayEnvName(config)} ${config.path} ${config.context} ${(config.contexts ?? []).join(' ')} ${config.server} ${config.tags.join(' ')}`.toLowerCase()
    return (selectedGroup === 'all' || config.groupId === selectedGroup) && (!query || text.includes(query.toLowerCase()))
  })
  const displayedConfigs = useMemo(() => [...filteredConfigs].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    return (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0)
  }), [filteredConfigs, sortMode])
  const template = commands.find((item) => item.id === templateId) ?? commands[0]
  const contextOptions = selected ? Array.from(new Set([...(selected.contexts ?? []), selected.context].filter(Boolean))) : []
  const generatedCommand = selected && template ? `${displayEnvName(selected)}=${quoteShellValue(selected.path)}\nKUBECONFIG=$${displayEnvName(selected)} kubectl ${template.command}${namespace && namespace !== 'default' ? ` -n ${namespace}` : ''}${context ? ` --context ${context}` : ''}${extraArgs ? ` ${extraArgs}` : ''}` : ''

  useEffect(() => {
    if (!filteredConfigs.some((item) => item.id === selectedId)) setSelectedId(filteredConfigs[0]?.id ?? configs[0]?.id ?? '')
  }, [filteredConfigs, selectedId, configs])

  useEffect(() => {
    if (!selected) {
      setContext('')
      return
    }
    setContext(selected.context || selected.contexts?.[0] || '')
    setEnvNameDraft(displayEnvName(selected))
  }, [selectedId])

  useEffect(() => {
    if (!commands.some((item) => item.id === templateId)) setTemplateId(defaultCommandId && commands.some((item) => item.id === defaultCommandId) ? defaultCommandId : commands[0]?.id ?? '')
  }, [commands, defaultCommandId, templateId])

  const updateConfig = (id: string, updater: (config: KubeConfig) => KubeConfig) => setConfigs((current) => current.map((item) => item.id === id ? updater(item) : item))
  const parseList = (value: string) => Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)))

  const applyDetectedContent = (content: string) => {
    const parsed = parseKubeconfigContent(content)
    setNewConfig((current) => ({
      ...current,
      content,
      contexts: parsed.contexts.length ? parsed.contexts.join(', ') : current.contexts,
      server: parsed.server || current.server,
    }))
  }

  const pickKubeconfigFile = async () => {
    if (window.orbitDesktop) {
      try {
        const result = await window.orbitDesktop.pickKubeconfigFile()
        if (!result) return
        const name = result.path.split('/').pop()?.replace(/\.(yaml|yml|config|conf|txt)$/i, '') || ''
        setNewConfig((current) => ({ ...current, source: 'file', path: result.path, name: current.name || name, fileName: result.path.split('/').pop() || current.fileName }))
        applyDetectedContent(result.content)
      } catch {
        notify('读取 kubeconfig 文件失败')
      }
      return
    }
    filePickerRef.current?.click()
  }

  const pickKubeconfigDirectory = async () => {
    if (!window.orbitDesktop) {
      notify('浏览器模式请手动填写保存目录，桌面版支持直接选择目录')
      setNewConfig((current) => ({ ...current, source: 'directory' }))
      return
    }
    try {
      const directoryPath = await window.orbitDesktop.pickDirectory()
      if (directoryPath) setNewConfig((current) => ({ ...current, source: 'directory', directoryPath }))
    } catch {
      notify('选择保存目录失败')
    }
  }

  const readClipboard = async () => {
    try {
      const content = await navigator.clipboard.readText()
      if (!content.trim()) {
        notify('剪贴板没有可用内容')
        return
      }
      setNewConfig((current) => ({ ...current, source: 'clipboard' }))
      applyDetectedContent(content)
      notify('已读取剪贴板内容')
    } catch {
      notify('无法读取剪贴板，请直接粘贴到内容框')
    }
  }

  const addConfig = async () => {
    const parsedContent = newConfig.content.trim()
    const fileName = (newConfig.fileName.trim() || `${newConfig.name.trim() || 'kubeconfig'}.yaml`).replace(/[^\w.-]+/g, '-')
    const directoryPath = newConfig.directoryPath.trim()
    let targetPath = newConfig.path.trim()
    if (newConfig.source !== 'file') targetPath = directoryPath ? `${directoryPath.replace(/[/\\]+$/, '')}/${fileName}` : ''
    if (!newConfig.name.trim() || !targetPath) {
      notify('请填写配置名称和保存路径')
      return
    }
    if (newConfig.source !== 'file' && !parsedContent) {
      notify('请粘贴 kubeconfig 原始内容')
      return
    }
    const envName = deriveEnvName(newConfig.envName.trim() || newConfig.name.trim() || filenameStem(fileName))
    setSavingConfig(true)
    try {
      if (parsedContent && window.orbitDesktop) {
        const saved = newConfig.source === 'file'
          ? await window.orbitDesktop.writeKubeconfigFile({ path: targetPath, content: parsedContent })
          : await window.orbitDesktop.saveKubeconfigFile({ directoryPath, fileName, content: parsedContent })
        targetPath = saved.path
      } else if (parsedContent && newConfig.source !== 'file') {
        const blob = new Blob([parsedContent], { type: 'text/yaml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        anchor.click()
        URL.revokeObjectURL(url)
        notify(`已生成 ${fileName} 下载文件`)
      }
    } catch {
      notify('保存 kubeconfig 文件失败，请检查目标路径')
      setSavingConfig(false)
      return
    }
    const contexts = parseList(newConfig.contexts)
    const parsed = parseKubeconfigContent(parsedContent)
    const availableContexts = Array.from(new Set([...contexts, ...parsed.contexts]))
    const item: KubeConfig = { id: uid('kube'), name: newConfig.name.trim(), envName, alias: envName, path: targetPath, metaName: envName, source: newConfig.source, content: parsedContent, groupId: newConfig.groupId || groups[0]?.id || '', context: parsed.context || availableContexts[0] || '未读取 context', contexts: availableContexts, server: newConfig.server.trim() || parsed.server || '待检测', tags: parseList(newConfig.tags), createdAt: new Date().toISOString(), updatedAt: '刚刚' }
    setConfigs((current) => [item, ...current])
    setSelectedId(item.id)
    setShowAdd(false)
    setNewConfig({ source: 'file', name: '', envName: '', path: '', directoryPath: '', fileName: 'config.yaml', content: '', groupId: groups[0]?.id ?? '', contexts: '', server: '', tags: '' })
    setSavingConfig(false)
    notify('kubeconfig 已添加')
  }

  const addKubeGroup = () => {
    setNewGroup({ name: '', color: kubeGroupPalette[2] })
    setShowGroupAdd(true)
  }

  const saveKubeGroup = () => {
    const name = newGroup.name.trim()
    if (!name) {
      notify('请填写分组名称')
      return
    }
    setGroups((current) => [...current, { id: uid('kube-group'), name, color: newGroup.color }])
    setShowGroupAdd(false)
    notify('分组已创建')
  }

  const moveConfig = (groupId: string) => {
    if (!draggedConfig) return
    updateConfig(draggedConfig, (item) => ({ ...item, groupId, updatedAt: '刚刚' }))
    setDraggedConfig(null)
    setDragOverGroupId(null)
    notify('配置已移动')
  }

  const changeContext = (value: string) => {
    setContext(value)
    if (selected) updateConfig(selected.id, (item) => ({ ...item, context: value, contexts: Array.from(new Set([...(item.contexts ?? []), value])) }))
  }

  const deleteConfig = () => {
    if (!selected) return
    if (!window.confirm(`确定移除 kubeconfig “${selected.name}”吗？`)) return
    const remaining = configs.filter((item) => item.id !== selected.id)
    setConfigs(remaining)
    setSelectedId(remaining[0]?.id ?? '')
    notify('kubeconfig 已移除')
  }

  const commitEnvName = () => {
    if (!selected) return
    const envName = deriveEnvName(envNameDraft.trim() || selected.name)
    setEnvNameDraft(envName)
    updateConfig(selected.id, (item) => ({ ...item, envName, alias: envName, metaName: envName, updatedAt: '刚刚' }))
  }

  const saveDetails = async (updated: KubeConfig) => {
    if (updated.content !== undefined && window.orbitDesktop && updated.path) {
      try {
        await window.orbitDesktop.writeKubeconfigFile({ path: updated.path, content: updated.content })
      } catch {
        notify('原始内容保存失败，请检查文件权限')
        return
      }
    }
    updateConfig(updated.id, () => updated)
    if (updated.id === selected?.id) {
      setContext(updated.context)
      setEnvNameDraft(displayEnvName(updated))
    }
    notify('配置详情已保存')
  }

  return <div className="content-wrap kube-page">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot green" />CLUSTER ACCESS</div><h1>Kubeconfig 管理</h1><p>把散落在不同目录的集群入口，整理成一组可复制的命令。</p></div><div className="heading-actions"><button className="ghost-button" onClick={addKubeGroup}><Plus size={16} />新建分组</button><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} />添加配置</button></div></div>
    <div className="kube-summary"><div><div className="summary-icon blue"><Database size={18} /></div><div><strong>{configs.length}</strong><span>个配置文件</span></div></div><div><div className="summary-icon green"><ShieldCheck size={18} /></div><div><strong>{groups.length}</strong><span>个环境分组</span></div></div><div><div className="summary-icon orange"><Command size={18} /></div><div><strong>{commands.length}</strong><span>条常用命令</span></div></div><div className="summary-tip"><Sparkles size={16} /><span>选择配置后，命令会自动带上 KUBECONFIG 和 Context</span></div></div>
    <div className="kube-grid">
      <aside className={`kube-groups panel ${draggedConfig ? 'is-dragging' : ''}`}><div className="panel-title"><span>环境分组</span><button className="icon-button tiny" onClick={addKubeGroup} aria-label="新建 kubeconfig 分组"><Plus size={15} /></button></div>{draggedConfig && <div className="group-drop-banner"><GripVertical size={13} />拖到高亮分组后松开</div>}<button className={`kube-group-item ${selectedGroup === 'all' ? 'active' : ''}`} onClick={() => setSelectedGroup('all')}><div className="group-icon"><HardDrive size={15} /></div><span>全部配置</span><b>{configs.length}</b></button>{groups.map((group) => <button className={`kube-group-item ${selectedGroup === group.id ? 'active' : ''} ${dragOverGroupId === group.id ? 'drop-target' : ''}`} key={group.id} onClick={() => setSelectedGroup(group.id)} onDragOver={(event) => { event.preventDefault(); setDragOverGroupId(group.id) }} onDragEnter={() => setDragOverGroupId(group.id)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverGroupId(null) }} onDrop={(event) => { event.preventDefault(); moveConfig(group.id) }} aria-label={`分组 ${group.name}，拖到此处归类`}><div className="group-icon" style={{ color: group.color, background: `${group.color}18` }}><Folder size={15} /></div><span>{group.name}{dragOverGroupId === group.id && <small>松开归类</small>}</span><b>{configs.filter((config) => config.groupId === group.id).length}</b></button>)}<button className="group-drop-hint" onClick={addKubeGroup}><Plus size={14} />新建分组</button></aside>
      <section className="config-list panel"><div className="config-list-header"><div className="panel-title"><span>配置文件 <b>{filteredConfigs.length}</b></span><span className="config-list-hint">拖动可调整分组</span></div><label className="sort-control"><ArrowDownUp size={13} /><span>排序</span><select aria-label="配置排序" value={sortMode} onChange={(event) => setSortMode(event.target.value as ConfigSort)}><option value="created">创建时间</option><option value="name">名称</option></select></label></div>{displayedConfigs.map((config) => <div key={config.id} className={`config-row ${selected?.id === config.id ? 'active' : ''} ${draggedConfig === config.id ? 'dragging' : ''}`} role="button" tabIndex={0} onClick={() => setSelectedId(config.id)} onKeyDown={(event) => { if (event.key === 'Enter') setSelectedId(config.id) }} draggable onDragStart={(event) => { const target = event.target as HTMLElement; if (target.closest('button')) { event.preventDefault(); return } kubeDragPreviewRef.current?.remove(); const preview = document.createElement('div'); preview.className = 'drag-preview kube-drag-preview'; preview.textContent = `${config.name} · ${displayEnvName(config)}`; document.body.appendChild(preview); kubeDragPreviewRef.current = preview; event.dataTransfer.setDragImage(preview, 18, 18); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', config.id); setDraggedConfig(config.id); setDragOverGroupId(null) }} onDragEnd={() => { kubeDragPreviewRef.current?.remove(); kubeDragPreviewRef.current = null; setDraggedConfig(null); setDragOverGroupId(null) }}><div className="config-file-icon"><KeyRound size={17} /></div><div className="config-row-main"><strong>{config.name}</strong><span>{config.path}</span><div className="config-row-meta"><span className="config-env-pill">环境变量：{displayEnvName(config)}</span><span className="context-pill">{config.context}</span>{config.tags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}</div></div><button className="config-detail-button" onClick={(event) => { event.stopPropagation(); setDetailsId(config.id) }} aria-label={`查看 ${config.name} 详情`} title="查看配置详情"><Info size={14} /></button><ChevronRight size={15} className="row-chevron" /></div>) }{!displayedConfigs.length && <div className="panel-empty"><Search size={22} /><p>没有找到匹配的配置</p></div>}<button className="add-config-row" onClick={() => setShowAdd(true)}><Plus size={15} />添加一个 kubeconfig</button></section>
      <section className="command-panel panel"><div className="command-panel-header"><div><div className="panel-kicker"><Terminal size={14} />COMMAND BUILDER</div><h2>命令生成器</h2><p>点击配置后生成对应命令，可直接复制到终端。</p></div><div className="terminal-badge"><span />shell</div></div>{selected ? <><div className="selected-config"><div className="config-file-icon big"><KeyRound size={18} /></div><div className="selected-config-main"><span>当前配置</span><strong>{selected.name}</strong><small>{selected.path}</small><label className="selected-env-name"><span>环境变量名称</span><input aria-label="环境变量名称" value={envNameDraft} onChange={(event) => setEnvNameDraft(event.target.value)} onBlur={commitEnvName} onKeyDown={(event) => { if (event.key === 'Enter') { event.currentTarget.blur() } }} placeholder="例如 PRODUCTION" /></label></div><button className="icon-button tiny" onClick={() => setDetailsId(selected.id)} aria-label="查看配置详情" title="查看配置详情"><Info size={14} /></button><button className="icon-button tiny" onClick={() => onCopy(selected.path, '路径已复制')} aria-label="复制配置路径"><Copy size={14} /></button><button className="icon-button tiny danger-hover" onClick={deleteConfig} aria-label="删除配置"><Trash2 size={14} /></button></div><div className="command-form"><div className="command-label-row"><label htmlFor="command-template">常用命令</label><div><button className="inline-control" onClick={() => setShowCommandManager(true)}><SlidersHorizontal size={13} />管理命令</button><button className="inline-control" onClick={() => onDefaultCommandChange(templateId)}><Star size={13} fill={defaultCommandId === templateId ? 'currentColor' : 'none'} />{defaultCommandId === templateId ? '默认命令' : '设为默认'}</button></div></div><select id="command-template" aria-label="常用命令" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{commands.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.command}</option>)}</select><div className="form-row"><label>Context<select aria-label="Context" value={context} onChange={(event) => changeContext(event.target.value)}>{contextOptions.length ? contextOptions.map((item) => <option value={item} key={item}>{item}</option>) : <option value="">未读取 context</option>}</select></label><label>命名空间<input value={namespace} onChange={(event) => setNamespace(event.target.value)} placeholder="default" /></label></div><label className="extra-args-field">附加参数<input value={extraArgs} onChange={(event) => setExtraArgs(event.target.value)} placeholder="例如 --watch 或 -l app=web" /></label></div><div className="command-preview"><div className="preview-header"><span>预览</span><button className="copy-command" onClick={() => onCopy(generatedCommand, '命令已复制')}><Copy size={14} />复制命令</button></div><pre><code>{generatedCommand.split('\n').map((line, index) => <span className="command-line" key={`${line}-${index}`}><b>{line}</b></span>)}</code></pre></div><div className="command-note"><ShieldCheck size={15} /><span>命令只在本地生成，不会执行或上传配置内容。</span></div></> : <div className="panel-empty"><KeyRound size={22} /><p>选择一个配置开始</p></div>}</section>
    </div>
    {showAdd && <Modal title="添加 kubeconfig" className="modal-wide" onClose={() => setShowAdd(false)}><div className="form-stack"><div className="source-switch" role="tablist" aria-label="配置来源"><button className={newConfig.source === 'file' ? 'active' : ''} onClick={() => setNewConfig((current) => ({ ...current, source: 'file' }))}>指定文件</button><button className={newConfig.source === 'directory' ? 'active' : ''} onClick={() => setNewConfig((current) => ({ ...current, source: 'directory' }))}>指定目录</button><button className={newConfig.source === 'clipboard' ? 'active' : ''} onClick={() => setNewConfig((current) => ({ ...current, source: 'clipboard' }))}>粘贴内容</button></div><div className="source-hint">{newConfig.source === 'file' ? '支持无后缀、.yaml、.yml、.config、.conf、.txt 等文本 kubeconfig 文件。' : newConfig.source === 'directory' ? '选择一个目录，把粘贴的内容保存为新的 kubeconfig 文件。' : '粘贴 kubeconfig 内容，桌面版会保存为本地文件。'}</div><div className="form-row"><label>配置名称<input autoFocus value={newConfig.name} onChange={(event) => setNewConfig((current) => ({ ...current, name: event.target.value }))} placeholder="例如：kind-dev" /></label><label>环境变量名称<input value={newConfig.envName || deriveEnvName(newConfig.name || filenameStem(newConfig.fileName))} onChange={(event) => setNewConfig((current) => ({ ...current, envName: event.target.value }))} placeholder="例如 PRODUCTION，命令会生成 KUBECONFIG=$PRODUCTION" /></label></div>{newConfig.source === 'file' ? <><label>文件路径<div className="input-with-action"><input value={newConfig.path} onChange={(event) => setNewConfig((current) => ({ ...current, path: event.target.value }))} placeholder="~/.kube/config" /><button className="toolbar-button" onClick={() => void pickKubeconfigFile()}><FolderOpen size={14} />选择文件</button></div></label><label>原始 kubeconfig 内容<textarea className="yaml-editor compact" value={newConfig.content} onChange={(event) => { setNewConfig((current) => ({ ...current, content: event.target.value })); }} placeholder="选择文件后会自动读取，也可以直接粘贴 YAML" /></label></> : <><div className="form-row"><label>保存目录<div className="input-with-action"><input value={newConfig.directoryPath} onChange={(event) => setNewConfig((current) => ({ ...current, directoryPath: event.target.value }))} placeholder="例如 ~/.kube/orbit" /><button className="toolbar-button" onClick={() => void pickKubeconfigDirectory()}><FolderOpen size={14} />选择目录</button></div></label><label>文件名<input value={newConfig.fileName} onChange={(event) => setNewConfig((current) => ({ ...current, fileName: event.target.value }))} placeholder="kind.config.yaml" /></label></div><label>原始 kubeconfig 内容<div className="textarea-with-action"><textarea className="yaml-editor" value={newConfig.content} onChange={(event) => setNewConfig((current) => ({ ...current, content: event.target.value }))} placeholder="粘贴 kubeconfig YAML 内容" /><button className="toolbar-button clipboard-button" onClick={() => void readClipboard()}><Clipboard size={14} />读取剪贴板</button></div></label></>}<div className="form-row"><label>Context 列表<input value={newConfig.contexts} onChange={(event) => setNewConfig((current) => ({ ...current, contexts: event.target.value }))} placeholder="context-a, context-b" /></label><label>集群地址<input value={newConfig.server} onChange={(event) => setNewConfig((current) => ({ ...current, server: event.target.value }))} placeholder="https://..." /></label></div><div className="form-row"><label>标签<input value={newConfig.tags} onChange={(event) => setNewConfig((current) => ({ ...current, tags: event.target.value }))} placeholder="生产, 只读" /></label><label>所属分组<select value={newConfig.groupId || groups[0]?.id} onChange={(event) => setNewConfig((current) => ({ ...current, groupId: event.target.value }))}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label></div><div className="modal-actions"><button className="ghost-button" onClick={() => setShowAdd(false)}>取消</button><button className="primary-button" disabled={savingConfig} onClick={() => void addConfig()}><Save size={14} />{savingConfig ? '保存中…' : '保存配置'}</button></div></div><input ref={filePickerRef} type="file" accept="*/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((content) => { setNewConfig((current) => ({ ...current, source: 'file', path: file.name, name: current.name || file.name.replace(/\.(yaml|yml|config|conf|txt)$/i, ''), envName: current.envName || deriveEnvName(current.name || file.name.replace(/\.(yaml|yml|config|conf|txt)$/i, '')), fileName: file.name })); applyDetectedContent(content) }); event.target.value = '' }} /></Modal>}
    {showGroupAdd && <Modal title="新建环境分组" onClose={() => setShowGroupAdd(false)}><div className="form-stack"><label>分组名称<input autoFocus value={newGroup.name} onChange={(event) => setNewGroup((current) => ({ ...current, name: event.target.value }))} placeholder="例如：生产集群" /></label><label>分组颜色<div className="color-palette" role="radiogroup" aria-label="分组颜色">{kubeGroupPalette.map((color) => <button key={color} type="button" className={newGroup.color === color ? 'selected' : ''} style={{ background: color }} aria-label={`选择颜色 ${color}`} aria-pressed={newGroup.color === color} onClick={() => setNewGroup((current) => ({ ...current, color }))} />)}</div></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowGroupAdd(false)}>取消</button><button className="primary-button" onClick={saveKubeGroup}><Save size={14} />创建分组</button></div></div></Modal>}
    {detailsId && configs.find((config) => config.id === detailsId) && <ConfigDetailModal config={configs.find((config) => config.id === detailsId)!} groups={groups} onClose={() => setDetailsId(null)} onSave={saveDetails} />}
    {showCommandManager && <CommandManagerModal commands={commands} defaultCommandId={defaultCommandId} setCommands={setCommands} onDefaultCommandChange={onDefaultCommandChange} onClose={() => setShowCommandManager(false)} notify={notify} />}
  </div>
}

function ConfigDetailModal({ config, groups, onClose, onSave }: { config: KubeConfig; groups: KubeGroup[]; onClose: () => void; onSave: (config: KubeConfig) => void }) {
  const [draft, setDraft] = useState({ name: config.name, envName: displayEnvName(config), path: config.path, groupId: config.groupId, context: config.context, contexts: (config.contexts ?? [config.context]).join(', '), server: config.server, tags: config.tags.join(', '), content: config.content ?? '' })
  const parseList = (value: string) => Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)))
  const save = () => {
    const contexts = parseList(draft.contexts)
    const activeContext = draft.context.trim() || contexts[0] || '未读取 context'
    const nextName = draft.name.trim() || config.name
    const envName = deriveEnvName(draft.envName.trim() || nextName)
    const parsed = parseKubeconfigContent(draft.content)
    const detectedContexts = Array.from(new Set([...contexts, ...parsed.contexts]))
    onSave({ ...config, name: nextName, envName, alias: envName, path: draft.path.trim() || config.path, metaName: envName, groupId: draft.groupId, context: activeContext, contexts: detectedContexts, server: draft.server.trim() || parsed.server || '待检测', tags: parseList(draft.tags), content: draft.content, updatedAt: '刚刚' })
    onClose()
  }
  const contextOptions = Array.from(new Set([draft.context, ...parseList(draft.contexts)].filter(Boolean)))
  return <Modal title="kubeconfig 详情" className="modal-wide" onClose={onClose}><div className="form-stack"><div className="detail-kicker"><Server size={15} /><span>配置文件信息 · {config.source === 'clipboard' || config.source === 'managed' ? 'Orbit 托管' : '源文件'}</span></div><div className="form-row"><label>配置名称<input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>环境变量名称<input value={draft.envName} onChange={(event) => setDraft((current) => ({ ...current, envName: event.target.value }))} placeholder="例如 PRODUCTION" /></label></div><label>文件路径<input value={draft.path} onChange={(event) => setDraft((current) => ({ ...current, path: event.target.value }))} /></label><div className="form-row"><label>当前 Context<select value={draft.context} onChange={(event) => setDraft((current) => ({ ...current, context: event.target.value }))}>{contextOptions.map((item) => <option value={item} key={item}>{item}</option>)}{!contextOptions.length && <option value="">未读取 context</option>}</select></label><label>所属分组<select value={draft.groupId} onChange={(event) => setDraft((current) => ({ ...current, groupId: event.target.value }))}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label></div><label>可用 Context（逗号分隔）<input value={draft.contexts} onChange={(event) => setDraft((current) => ({ ...current, contexts: event.target.value }))} placeholder="context-a, context-b" /></label><div className="form-row"><label>集群地址<input value={draft.server} onChange={(event) => setDraft((current) => ({ ...current, server: event.target.value }))} placeholder="https://..." /></label><label>标签（逗号分隔）<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="生产, 只读" /></label></div><label>原始 kubeconfig 内容<textarea className="yaml-editor" value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="粘贴或编辑 kubeconfig YAML 内容" /></label><div className="detail-meta"><span>环境变量</span><strong>{deriveEnvName(draft.envName.trim() || draft.name.trim() || config.name)}</strong><span>创建时间</span><strong>{config.createdAt ? new Date(config.createdAt).toLocaleString('zh-CN') : '未记录'}</strong><span>最近更新</span><strong>{config.updatedAt}</strong><span>保存方式</span><strong>{config.path.startsWith('~') ? '仅保存到本地工作区' : '保存时写回源文件'}</strong></div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}><Save size={14} />保存详情</button></div></div></Modal>
}

function CommandManagerModal({ commands, defaultCommandId, setCommands, onDefaultCommandChange, onClose, notify }: { commands: CommandTemplate[]; defaultCommandId: string; setCommands: React.Dispatch<React.SetStateAction<CommandTemplate[]>>; onDefaultCommandChange: React.Dispatch<React.SetStateAction<string>>; onClose: () => void; notify: (message: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', command: '', description: '' })
  const startEdit = (item?: CommandTemplate) => {
    setEditingId(item?.id ?? null)
    setDraft({ name: item?.name ?? '', command: item?.command ?? '', description: item?.description ?? '' })
  }
  const save = () => {
    if (!draft.name.trim() || !draft.command.trim()) {
      notify('请填写命令名称和命令内容')
      return
    }
    if (editingId) setCommands((current) => current.map((item) => item.id === editingId ? { ...item, name: draft.name.trim(), command: draft.command.trim(), description: draft.description.trim() } : item))
    else setCommands((current) => [...current, { id: uid('command'), name: draft.name.trim(), command: draft.command.trim(), description: draft.description.trim() || '自定义命令', createdAt: new Date().toISOString() }])
    setEditingId(null)
    setDraft({ name: '', command: '', description: '' })
    notify(editingId ? '命令已更新' : '命令已添加')
  }
  const remove = (item: CommandTemplate) => {
    if (item.builtin) return
    setCommands((current) => current.filter((command) => command.id !== item.id))
    if (defaultCommandId === item.id) onDefaultCommandChange(commands.find((command) => command.id !== item.id)?.id ?? '')
    notify('自定义命令已删除')
  }
  return <Modal title="管理常用命令" className="modal-wide command-manager-modal" onClose={onClose}><div className="command-manager"><div className="command-manager-list">{commands.map((item) => <div className="command-manager-row" key={item.id}><div className="command-manager-main"><strong>{item.name}</strong><code>{item.command}</code><small>{item.description}</small></div><div className="command-manager-actions"><button className={`command-default-button ${defaultCommandId === item.id ? 'active' : ''}`} onClick={() => onDefaultCommandChange(item.id)}>{defaultCommandId === item.id ? '默认' : '设为默认'}</button><button className="icon-button tiny" onClick={() => startEdit(item)} aria-label={`编辑 ${item.name}`}><Pencil size={13} /></button>{!item.builtin && <button className="icon-button tiny danger-hover" onClick={() => remove(item)} aria-label={`删除 ${item.name}`}><Trash2 size={13} /></button>}</div></div>)}</div><div className="command-manager-form"><div className="command-manager-form-header"><strong>{editingId ? '编辑命令' : '添加自定义命令'}</strong>{editingId && <button className="inline-control" onClick={() => startEdit()}><Plus size={13} />新建</button>}</div><div className="form-row"><label>名称<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：Pod 按创建时间排序" /></label><label>命令<input value={draft.command} onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} placeholder="get pods --sort-by=.metadata.creationTimestamp" /></label></div><label>说明<input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="说明这条命令的用途" /></label><button className="primary-button manager-save-button" onClick={save}><Save size={14} />{editingId ? '保存修改' : '添加命令'}</button></div></div></Modal>
}

function SettingsView({ boards, configs, theme, onThemeChange }: { boards: BookmarkBoard[]; configs: KubeConfig[]; theme: Theme; onThemeChange: React.Dispatch<React.SetStateAction<Theme>> }) {
  return <div className="content-wrap settings-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />WORKSPACE</div><h1>偏好设置</h1><p>调整界面显示并检查工作区状态。</p></div></div><div className="settings-grid"><section className="settings-card theme-settings-card"><div className={`settings-card-icon ${theme === 'light' ? 'orange' : ''}`}>{theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}</div><div><h3>界面主题</h3><p>在暗色和亮色界面之间切换，选择会自动保存到本机。</p></div><div className="theme-switch" role="group" aria-label="界面主题"><button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}><Moon size={13} />暗色</button><button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}><Sun size={13} />亮色</button></div></section><section className="settings-card"><div className="settings-card-icon"><Laptop size={18} /></div><div><h3>本地工作区</h3><p>当前版本将数据保存到浏览器本地存储，适合单机使用和快速验证。</p></div><span className="status-badge"><span />正常</span></section><section className="settings-card"><div className="settings-card-icon green"><Archive size={18} /></div><div><h3>数据概览</h3><p>{boards.length} 个书签看板 · {configs.length} 个 kubeconfig · 自动保存已开启</p></div><span className="status-badge"><span />已同步</span></section><section className="settings-card"><div className="settings-card-icon orange"><Code2 size={18} /></div><div><h3>跨平台路线</h3><p>桌面端可接入 Tauri 文件系统；Apple 端可复用同一数据模型，接入 iCloud 或 CloudKit。</p></div><span className="version-label">v0.1</span></section></div></div>
}

function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><div className={`modal ${className}`.trim()}><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={17} /></button></div>{children}</div></div>
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
