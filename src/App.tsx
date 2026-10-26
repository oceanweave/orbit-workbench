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
import { KubeImportPanel } from './components/KubeImportPanel'
import { inspectKubeconfig, prepareKubeImports } from '../shared/kubeconfig.mjs'
import type { BookmarkBoard, BookmarkGroup, CommandTemplate, KubeConfig, KubeGroup, LinkItem } from './types'

type Section = 'bookmarks' | 'kubeconfig' | 'settings'
type Theme = 'dark' | 'light'
type Density = 'comfortable' | 'compact'
type ConfigSort = 'created' | 'name'
type TagEditMode = 'replace' | 'add' | 'remove'
type GlobalSearchTab = 'all' | 'bookmarks' | 'kubeconfig'

type GlobalBookmarkResult = {
  board: BookmarkBoard
  group?: BookmarkGroup
  link: LinkItem
}

type GlobalKubeResult = {
  config: KubeConfig
  group?: KubeGroup
}

// Browsers report the Enter key while an IME is still composing (for example
// the first Enter that confirms a Chinese Pinyin candidate). Never treat that
// keypress as a form submission or inline-edit commit. `keyCode === 229` is
// kept as a fallback for WebKit/Electron versions that do not expose
// `nativeEvent.isComposing` consistently.
const isCommittedEnter = (event: React.KeyboardEvent) => (
  event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229
)

const kubeGroupPalette = ['#5d73e6', '#27a987', '#e09a38', '#a660d8', '#e35d74', '#2d9bc0', '#6f7d90', '#d46f35']

const filenameStem = (value: string) => value.split(/[\\/]/).pop()?.replace(/\.[^./]+$/, '') ?? ''

const deriveEnvName = (value: string, fallback = 'KUBECONFIG') => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) return fallback
  return /^[A-Z_]/.test(normalized) ? normalized : `KUBE_${normalized}`
}

const quoteShellValue = (value: string) => /^[A-Za-z0-9_./~:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`

const safeDownloadName = (value: string) => value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'orbit-bookmarks'

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const bookmarkTimestamp = (value?: string) => {
  const timestamp = value ? Math.floor(new Date(value).getTime() / 1000) : 0
  return Number.isFinite(timestamp) && timestamp > 0 ? String(timestamp) : ''
}

const createBrowserBookmarksHtml = (boards: BookmarkBoard[]) => {
  const folder = (name: string, groups: BookmarkBoard['groups'], links: BookmarkBoard['links'], timestamp?: string) => {
    const date = bookmarkTimestamp(timestamp)
    const dateAttribute = date ? ` ADD_DATE="${date}"` : ''
    const groupMarkup = groups.map((group) => {
      const groupLinks = links.filter((link) => link.groupId === group.id)
      const groupDate = bookmarkTimestamp(groupLinks[0]?.addedAt)
      const groupDateAttribute = groupDate ? ` ADD_DATE="${groupDate}"` : ''
      const linksMarkup = groupLinks.map((link) => {
        const linkDate = bookmarkTimestamp(link.addedAt)
        const linkDateAttribute = linkDate ? ` ADD_DATE="${linkDate}"` : ''
        return `<DT><A HREF="${escapeHtml(link.url)}"${linkDateAttribute}>${escapeHtml(link.title || link.url)}</A>`
      }).join('\n')
      return `<DT><H3${groupDateAttribute}>${escapeHtml(group.name)}</H3>\n<DL><p>\n${linksMarkup}\n</DL><p>`
    }).join('\n')
    const ungrouped = links.filter((link) => !groups.some((group) => group.id === link.groupId))
    const ungroupedMarkup = ungrouped.length ? `<DT><H3>未分组</H3>\n<DL><p>\n${ungrouped.map((link) => `<DT><A HREF="${escapeHtml(link.url)}">${escapeHtml(link.title || link.url)}</A>`).join('\n')}\n</DL><p>` : ''
    return `<DT><H3${dateAttribute}>${escapeHtml(name)}</H3>\n<DL><p>\n${groupMarkup}${ungroupedMarkup}\n</DL><p>`
  }

  const body = boards.map((board) => folder(board.name, board.groups, board.links, board.updatedAt)).join('\n')
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<!-- This is an automatically generated Orbit Workbench bookmark export. -->\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Orbit Workbench Bookmarks</TITLE>\n<H1>Orbit Workbench Bookmarks</H1>\n<DL><p>\n${body}\n</DL><p>\n`
}

const displayEnvName = (config: KubeConfig) => deriveEnvName(config.envName || config.alias || config.metaName?.replace(/^META_/i, '') || config.name || filenameStem(config.path))

const parseKubeconfigContent = (content: string) => {
  try { return inspectKubeconfig(content) }
  catch { return { context: '', contexts: [] as string[], server: '' } }
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
  const [density, setDensity] = usePersistentState<Density>('orbit-density', 'comfortable')
  const [query, setQuery] = useState('')
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lastPointerRef = useRef({ x: 220, y: 110 })
  const [toastPosition, setToastPosition] = useState({ x: 220, y: 110 })

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
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.clientX <= 0 && event.clientY <= 0) return
      lastPointerRef.current = { x: event.clientX, y: event.clientY }
      const target = event.target
      const activeDetails = target instanceof Element ? target.closest<HTMLDetailsElement>('details.tag-filter-dropdown, details.config-tag-filter') : null
      document.querySelectorAll<HTMLDetailsElement>('details.tag-filter-dropdown[open], details.config-tag-filter[open]').forEach((details) => {
        if (details !== activeDetails) details.removeAttribute('open')
      })
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [])

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

  const notify = (message: string) => {
    const point = lastPointerRef.current
    const x = Math.min(Math.max(point.x, 120), Math.max(120, window.innerWidth - 120))
    const y = Math.min(Math.max(point.y, 70), Math.max(70, window.innerHeight - 18))
    setToastPosition({ x, y })
    setToast(message)
  }

  const copyText = async (value: string, label = '已复制') => {
    // Show feedback immediately at the pointer location. In the desktop webview,
    // clipboard permission prompts can resolve asynchronously or remain pending.
    notify(label)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        return
      }
      throw new Error('clipboard API unavailable')
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        textarea.remove()
        if (!copied) throw new Error('copy command failed')
      } catch {
        notify('复制失败，请检查浏览器权限')
      }
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
    exportFile(`${safeDownloadName(board.name)}.html`, createBrowserBookmarksHtml([board]), 'text/html;charset=utf-8')
  }

  const exportWorkspace = () => {
    exportFile('orbit-bookmarks.html', createBrowserBookmarksHtml(boards), 'text/html;charset=utf-8')
  }

  const exportWorkspaceBackup = () => {
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
    <div className="app-shell" data-theme={theme} data-density={density}>
      <aside className="app-rail">
        <div className="brand-mark" aria-label="Orbit Workbench">
          <div className="brand-orbit"><span /></div>
          <div className="brand-text"><strong>orbit</strong><small>workbench</small></div>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <NavItem icon={<Bookmark size={17} />} label="书签看板" active={section === 'bookmarks'} onClick={() => { setGlobalSearchOpen(false); setQuery(''); setSection('bookmarks') }} />
          <NavItem icon={<Box size={17} />} label="Kubeconfig" active={section === 'kubeconfig'} onClick={() => { setGlobalSearchOpen(false); setQuery(''); setSection('kubeconfig') }} />
        </nav>

        <div className="rail-divider" />
        <nav className="secondary-nav" aria-label="辅助导航">
          <NavItem icon={<Settings2 size={17} />} label="偏好设置" active={section === 'settings'} onClick={() => { setGlobalSearchOpen(false); setQuery(''); setSection('settings') }} />
        </nav>

        <div className="rail-footer">
          <div className="sync-dot" />
          <div><strong>本地空间</strong><span>已自动保存</span></div>
          <MoreHorizontal size={15} className="muted-icon" />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumbs"><span>工作空间</span><ChevronRight size={14} /><strong>{globalSearchOpen ? '搜索结果' : section === 'bookmarks' ? '书签看板' : section === 'kubeconfig' ? 'Kubeconfig' : '偏好设置'}</strong></div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event) && query.trim()) { event.preventDefault(); setGlobalSearchOpen(true) } if (event.key === 'Escape') { setGlobalSearchOpen(false); setQuery('') } }} placeholder="搜索所有看板、配置、标签…" aria-label="搜索所有看板、配置、标签" />
              {query && <button className="icon-button tiny" onClick={() => { setQuery(''); setGlobalSearchOpen(false) }} aria-label="清空搜索"><X size={13} /></button>}
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'} title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="帮助" title="使用帮助"><CircleHelp size={17} /></button>
            <div className="avatar">DY</div>
          </div>
        </header>

        {globalSearchOpen ? <GlobalSearchView query={query} boards={boards} configs={kubeConfigs} kubeGroups={kubeGroups} setBoards={setBoards} setConfigs={setKubeConfigs} setKubeGroups={setKubeGroups} onCopy={copyText} notify={notify} onClose={() => { setGlobalSearchOpen(false); setQuery('') }} /> : <>
        {section === 'bookmarks' && (
          <BookmarksView
            boards={boards}
            setBoards={setBoards}
            query={query}
            addBoard={addBoard}
            onImport={() => importRef.current?.click()}
            onExport={(board) => exportBoard(board)}
            onExportAll={exportWorkspace}
            onExportBackup={exportWorkspaceBackup}
            onCopy={copyText}
            notify={notify}
            onClearQuery={() => setQuery('')}
          />
        )}
        {section === 'kubeconfig' && <KubeconfigView configs={kubeConfigs} setConfigs={setKubeConfigs} groups={kubeGroups} setGroups={setKubeGroups} commands={kubeCommands} setCommands={setKubeCommands} defaultCommandId={defaultCommandId} onDefaultCommandChange={setDefaultCommandId} query={query} onClearQuery={() => setQuery('')} onCopy={copyText} notify={notify} />}
        {section === 'settings' && <SettingsView boards={boards} configs={kubeConfigs} theme={theme} onThemeChange={setTheme} density={density} onDensityChange={setDensity} />}
        </>}
      </main>

      <input ref={importRef} type="file" accept=".html,.htm" hidden onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void handleBookmarkImport(file)
        event.target.value = ''
      }} />
      {showHelp && <Modal title="使用帮助" onClose={() => setShowHelp(false)}><div className="help-content"><p>Orbit Workbench 的数据默认只保存在本机浏览器中，并会自动保存。</p><div className="help-shortcuts"><div><kbd>⌘ / Ctrl</kbd><strong>+ K</strong><span>聚焦顶部搜索框</span></div><div><kbd>Esc</kbd><span>关闭当前弹窗</span></div><div><kbd>拖拽</kbd><span>把书签或 kubeconfig 拖到左侧高亮分组</span></div></div><p className="muted-copy">书签链接会在默认浏览器中打开；kubeconfig 命令只生成文本，不会自动执行。</p></div></Modal>}
      {toast && <div className="toast" style={{ left: toastPosition.x, top: toastPosition.y }} role="status" aria-live="polite"><Check size={16} />{toast}</div>}
    </div>
  )
}

function GlobalSearchView({ query, boards, configs, kubeGroups, setBoards, setConfigs, setKubeGroups, onCopy, notify, onClose }: {
  query: string
  boards: BookmarkBoard[]
  configs: KubeConfig[]
  kubeGroups: KubeGroup[]
  setBoards: React.Dispatch<React.SetStateAction<BookmarkBoard[]>>
  setConfigs: React.Dispatch<React.SetStateAction<KubeConfig[]>>
  setKubeGroups: React.Dispatch<React.SetStateAction<KubeGroup[]>>
  onCopy: (value: string, label?: string) => void
  notify: (message: string) => void
  onClose: () => void
}) {
  const normalized = query.trim().toLocaleLowerCase()
  const [tab, setTab] = useState<GlobalSearchTab>('all')
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([])
  const [selectedConfigIds, setSelectedConfigIds] = useState<string[]>([])
  const [createMode, setCreateMode] = useState<'copy-board' | 'move-board' | 'copy-group' | 'move-group' | null>(null)
  const [targetName, setTargetName] = useState('')

  useEffect(() => {
    setSelectedBookmarkIds([])
    setSelectedConfigIds([])
  }, [normalized])

  const bookmarkResults = useMemo<GlobalBookmarkResult[]>(() => boards.flatMap((board) => board.links.filter((link) => {
    const group = board.groups.find((item) => item.id === link.groupId)
    const searchable = [board.name, board.description, board.tags.join(' '), group?.name ?? '', link.title, link.url, link.description ?? '', link.tags.join(' ')].join(' ').toLocaleLowerCase()
    return !normalized || searchable.includes(normalized)
  }).map((link) => ({ board, link, group: board.groups.find((item) => item.id === link.groupId) }))), [boards, normalized])

  const kubeResults = useMemo<GlobalKubeResult[]>(() => configs.filter((config) => {
    const group = kubeGroups.find((item) => item.id === config.groupId)
    const searchable = [config.name, config.path, config.context, config.contexts?.join(' ') ?? '', config.server, config.tags.join(' '), group?.name ?? '', displayEnvName(config)].join(' ').toLocaleLowerCase()
    return !normalized || searchable.includes(normalized)
  }).map((config) => ({ config, group: kubeGroups.find((item) => item.id === config.groupId) })), [configs, kubeGroups, normalized])

  const visibleBookmarkResults = tab === 'kubeconfig' ? [] : bookmarkResults
  const visibleKubeResults = tab === 'bookmarks' ? [] : kubeResults
  const totalResults = bookmarkResults.length + kubeResults.length
  const visibleResultCount = visibleBookmarkResults.length + visibleKubeResults.length
  const selectedBookmarkCount = selectedBookmarkIds.length
  const selectedConfigCount = selectedConfigIds.length
  const bookmarkSelectionId = (item: GlobalBookmarkResult) => `${item.board.id}:${item.link.id}`

  const toggleBookmark = (id: string) => setSelectedBookmarkIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleConfig = (id: string) => setSelectedConfigIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const selectAllVisible = () => {
    const bookmarkIds = visibleBookmarkResults.map(bookmarkSelectionId)
    const configIds = visibleKubeResults.map((item) => item.config.id)
    const allBookmarksSelected = bookmarkIds.length > 0 && bookmarkIds.every((id) => selectedBookmarkIds.includes(id))
    const allConfigsSelected = configIds.length > 0 && configIds.every((id) => selectedConfigIds.includes(id))
    setSelectedBookmarkIds((current) => allBookmarksSelected ? current.filter((id) => !bookmarkIds.includes(id)) : Array.from(new Set([...current, ...bookmarkIds])))
    setSelectedConfigIds((current) => allConfigsSelected ? current.filter((id) => !configIds.includes(id)) : Array.from(new Set([...current, ...configIds])))
  }

  const beginCreate = (mode: typeof createMode, selectAll = false) => {
    if (!mode) return
    if (selectAll) {
      if (mode.endsWith('board')) {
        setSelectedBookmarkIds(bookmarkResults.map((item) => item.link.id))
        setSelectedConfigIds([])
      } else {
        setSelectedConfigIds(kubeResults.map((item) => item.config.id))
        setSelectedBookmarkIds([])
      }
    }
    setTargetName(mode.endsWith('board') ? `搜索结果 · ${query.trim()}` : `搜索分组 · ${query.trim()}`)
    setCreateMode(mode)
  }

  const confirmCreate = () => {
    const name = targetName.trim() || (createMode?.endsWith('board') ? '搜索结果' : '搜索分组')
    if (!createMode) return
    if (createMode.endsWith('board')) {
      const selected = bookmarkResults.filter((item) => selectedBookmarkIds.includes(bookmarkSelectionId(item)))
      if (!selected.length) return
      const groupBySource = new Map<string, BookmarkGroup>()
      selected.forEach(({ board, group }) => {
        const key = `${board.id}:${group?.id ?? 'ungrouped'}`
        if (!groupBySource.has(key)) groupBySource.set(key, { id: uid('group'), name: group ? `${board.name} · ${group.name}` : `${board.name} · 未分组`, color: group?.color ?? '#6f8cff' })
      })
      const links = selected.map(({ board, group, link }) => {
        const key = `${board.id}:${group?.id ?? 'ungrouped'}`
        return { ...link, id: uid('link'), groupId: groupBySource.get(key)!.id }
      })
      const newBoard: BookmarkBoard = { id: uid('board'), name, description: `从“${query.trim()}”搜索结果创建`, tags: ['搜索结果'], groups: Array.from(groupBySource.values()), links, updatedAt: new Date().toISOString() }
      if (createMode === 'copy-board') setBoards((current) => [newBoard, ...current])
      else {
        const selectedIds = new Set(selected.map(bookmarkSelectionId))
        setBoards((current) => [newBoard, ...current.map((board) => ({ ...board, links: board.links.filter((link) => !selectedIds.has(`${board.id}:${link.id}`)), updatedAt: selected.some((item) => item.board.id === board.id) ? new Date().toISOString() : board.updatedAt }))])
      }
      notify(createMode === 'copy-board' ? `已复制 ${links.length} 条链接到新看板` : `已移动 ${links.length} 条链接到新看板`)
    } else {
      const selected = kubeResults.filter((item) => selectedConfigIds.includes(item.config.id))
      if (!selected.length) return
      const group: KubeGroup = { id: uid('kube-group'), name, color: '#5d73e6' }
      setKubeGroups((current) => [...current, group])
      if (createMode === 'copy-group') setConfigs((current) => [...current, ...selected.map(({ config }) => ({ ...config, id: uid('config'), groupId: group.id, name: `${config.name}（副本）`, createdAt: new Date().toISOString(), updatedAt: '刚刚' }))])
      else {
        const selectedIds = new Set(selected.map((item) => item.config.id))
        setConfigs((current) => current.map((config) => selectedIds.has(config.id) ? { ...config, groupId: group.id, updatedAt: '刚刚' } : config))
      }
      notify(createMode === 'copy-group' ? `已复制 ${selected.length} 个 kubeconfig 到新分组` : `已移动 ${selected.length} 个 kubeconfig 到新分组`)
    }
    setCreateMode(null)
    setTargetName('')
    setSelectedBookmarkIds([])
    setSelectedConfigIds([])
  }

  return <div className="content-wrap global-search-view">
    <div className="page-heading search-result-header">
      <div><div className="eyebrow"><span className="eyebrow-dot" />GLOBAL SEARCH</div><h1>搜索结果</h1><p>在所有书签看板和 kubeconfig 中查找“<strong>{query}</strong>”，结果不会受当前页面限制。</p></div>
      <div className="heading-actions"><button className="ghost-button" onClick={() => beginCreate('copy-board', true)} disabled={!bookmarkResults.length}><Save size={15} />保存为新看板</button><button className="ghost-button" onClick={() => beginCreate('copy-group', true)} disabled={!kubeResults.length}><Save size={15} />保存为新分组</button><button className="ghost-button" onClick={onClose}><X size={15} />返回当前页面</button></div>
    </div>
    <div className="search-result-summary"><div><strong>{totalResults}</strong><span>条结果</span></div><div className="search-result-scope"><span className="search-scope-badge bookmark">书签 {bookmarkResults.length}</span><span className="search-scope-badge kube">Kubeconfig {kubeResults.length}</span></div></div>
    <div className="search-result-tabs" role="tablist" aria-label="搜索结果类型"><button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>全部</button><button className={tab === 'bookmarks' ? 'active' : ''} onClick={() => setTab('bookmarks')}>书签链接 <b>{bookmarkResults.length}</b></button><button className={tab === 'kubeconfig' ? 'active' : ''} onClick={() => setTab('kubeconfig')}>Kubeconfig <b>{kubeResults.length}</b></button><button className="search-select-button" onClick={selectAllVisible} disabled={!visibleResultCount}><Check size={14} />选择当前结果</button></div>
    {(selectedBookmarkCount > 0 || selectedConfigCount > 0) && <div className="search-result-actions"><span>已选择 {selectedBookmarkCount + selectedConfigCount} 项</span>{selectedBookmarkCount > 0 && <><button className="toolbar-button" onClick={() => beginCreate('copy-board')}>复制新建看板</button><button className="toolbar-button" onClick={() => beginCreate('move-board')}>移动新建看板</button></>}{selectedConfigCount > 0 && <><button className="toolbar-button" onClick={() => beginCreate('copy-group')}>复制新建分组</button><button className="toolbar-button" onClick={() => beginCreate('move-group')}>移动新建分组</button></>}</div>}
    {visibleResultCount === 0 ? <div className="search-result-empty"><Search size={28} /><h2>{totalResults === 0 ? '没有找到匹配结果' : '当前分类没有匹配结果'}</h2><p>试试名称、链接、路径、Context 或标签。</p></div> : <div className="search-result-grid">{visibleBookmarkResults.map((item) => { const { board, group, link } = item; const selectionId = bookmarkSelectionId(item); return <article className="search-result-card" key={`link:${selectionId}`}><label className="search-result-check"><input type="checkbox" checked={selectedBookmarkIds.includes(selectionId)} onChange={() => toggleBookmark(selectionId)} aria-label={`选择 ${link.title}`} /><span /></label><button className="search-result-card-main" onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}><div className="search-result-icon bookmark">{link.title.slice(0, 1).toUpperCase()}</div><div className="search-result-card-content"><strong>{link.title}</strong><span>{link.url}</span><small>{link.description || '无备注'}</small><div className="search-result-meta"><em>{board.name}</em>{group && <em>{group.name}</em>}{link.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}{link.tags.length > 3 && <em>+{link.tags.length - 3}</em>}</div></div><ArrowUpRight size={16} /></button><div className="search-result-card-tools"><button className="icon-button tiny" onClick={() => onCopy(link.url, '链接已复制')} aria-label="复制链接" title="复制链接"><Copy size={14} /></button></div></article> })}{visibleKubeResults.map(({ config, group }) => <article className="search-result-card search-result-card--kube" key={`config:${config.id}`}><label className="search-result-check"><input type="checkbox" checked={selectedConfigIds.includes(config.id)} onChange={() => toggleConfig(config.id)} aria-label={`选择 ${config.name}`} /><span /></label><div className="search-result-card-main"><div className="search-result-icon kube"><KeyRound size={17} /></div><div className="search-result-card-content"><strong>{config.name}</strong><span>{config.path}</span><small>Context：{config.context || '未设置'} · 环境变量：{displayEnvName(config)}</small><div className="search-result-meta">{group && <em>{group.name}</em>}{config.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}{config.tags.length > 3 && <em>+{config.tags.length - 3}</em>}</div></div></div></article>)}</div>}
    {createMode && <Modal title={createMode.endsWith('board') ? (createMode === 'copy-board' ? '复制新建看板' : '移动新建看板') : (createMode === 'copy-group' ? '复制新建 kubeconfig 分组' : '移动新建 kubeconfig 分组')} onClose={() => setCreateMode(null)}><div className="form-stack"><label>{createMode.endsWith('board') ? '看板名称' : '分组名称'}<input autoFocus value={targetName} onChange={(event) => setTargetName(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) confirmCreate() }} /></label><p className="form-hint">{createMode.startsWith('copy') ? '复制会保留原项目，并建立一份新的结果集合。' : '移动会从原分组中移除选中项目。'}</p><div className="modal-actions"><button className="ghost-button" onClick={() => setCreateMode(null)}>取消</button><button className="primary-button" onClick={confirmCreate}><Save size={14} />确认创建</button></div></div></Modal>}
  </div>
}

function NavItem({ icon, label, active, onClick, soon }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; soon?: boolean }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{soon && <em>Soon</em>}</button>
}

function BookmarksView({ boards, setBoards, query, addBoard, onImport, onExport, onExportAll, onExportBackup, onCopy, notify, onClearQuery }: {
  boards: BookmarkBoard[]
  setBoards: React.Dispatch<React.SetStateAction<BookmarkBoard[]>>
  query: string
  addBoard: (name?: string) => string
  onImport: () => void
  onExport: (board: BookmarkBoard) => void
  onExportAll: () => void
  onExportBackup: () => void
  onCopy: (value: string, label?: string) => void
  notify: (message: string) => void
  onClearQuery: () => void
}) {
  const [activeBoardId, setActiveBoardId] = useState(boards[0]?.id ?? '')
  const [activeGroupId, setActiveGroupId] = useState('all')
  const [tagFilters, setTagFilters] = useState<string[]>([])
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
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([])
  const [showBatchMove, setShowBatchMove] = useState(false)
  const [batchTargetBoardId, setBatchTargetBoardId] = useState('')
  const [batchTargetGroupId, setBatchTargetGroupId] = useState('')
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [boardNameDraft, setBoardNameDraft] = useState('')
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupBoardId, setEditingGroupBoardId] = useState<string | null>(null)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [deletingGroupBoardId, setDeletingGroupBoardId] = useState<string | null>(null)
  const [tagEditorLinkIds, setTagEditorLinkIds] = useState<string[]>([])

  useEffect(() => {
    if (!boards.some((board) => board.id === activeBoardId)) {
      setActiveBoardId(boards[0]?.id ?? '')
      setActiveGroupId('all')
      setTagFilters([])
    }
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
  const allTags = useMemo(() => Array.from(new Set(board?.links.flatMap((link) => link.tags) ?? [])).sort((a, b) => a.localeCompare(b, 'zh-CN')), [board])
  const visibleLinks = useMemo(() => {
    if (!board) return []
    const normalized = query.toLowerCase().trim()
    return board.links.filter((link) => {
      const matchesGroup = activeGroupId === 'all' || link.groupId === activeGroupId
      const matchesTag = !tagFilters.length || tagFilters.every((tag) => link.tags.includes(tag))
      const matchesSearch = !normalized || `${link.title} ${link.url} ${link.description ?? ''} ${link.tags.join(' ')}`.toLowerCase().includes(normalized)
      return matchesGroup && matchesTag && matchesSearch
    })
  }, [board, activeGroupId, tagFilters, query])

  useEffect(() => {
    setSelectedLinkIds((current) => current.filter((id) => board?.links.some((link) => link.id === id)))
  }, [board])

  useEffect(() => {
    setSelectedLinkIds([])
  }, [activeBoardId, activeGroupId, tagFilters, query])

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

  const openBoardRename = (target = board) => {
    if (!target) return
    setEditingBoardId(target.id)
    setBoardNameDraft(target.name)
  }

  const renameBoard = () => {
    const name = boardNameDraft.trim()
    if (!editingBoardId || !name) {
      notify('请输入看板名称')
      return
    }
    setBoards((current) => current.map((item) => item.id === editingBoardId ? { ...item, name, updatedAt: new Date().toISOString() } : item))
    setEditingBoardId(null)
    notify('看板名称已更新')
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
    setTagFilters([])
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
    setTagFilters([])
    setDraggedLink(null)
    setDragOverTarget(null)
    notify('链接已移动')
  }

  const requestDeleteBoard = () => {
    if (boards.length <= 1) {
      notify('至少保留一个看板')
      return
    }
    if (!board) return
    setDeletingBoardId(board.id)
  }

  const deleteBoard = () => {
    if (!deletingBoardId) return
    if (boards.length <= 1) {
      setDeletingBoardId(null)
      notify('至少保留一个看板')
      return
    }
    const target = boards.find((item) => item.id === deletingBoardId)
    if (!target) return
    const remaining = boards.filter((item) => item.id !== target.id)
    setBoards(remaining)
    const nextBoard = remaining[0]
    setActiveBoardId(nextBoard?.id ?? '')
    setActiveGroupId('all')
    setSelectedLinkIds([])
    setDeletingBoardId(null)
    notify('看板已删除')
  }

  const openGroupRename = (group: BookmarkBoard['groups'][number], boardId = board?.id) => {
    setEditingGroupId(group.id)
    setEditingGroupBoardId(boardId ?? null)
    setGroupNameDraft(group.name)
  }

  const renameGroup = () => {
    const name = groupNameDraft.trim()
    if (!editingGroupBoardId || !editingGroupId || !name) {
      notify('请输入分组名称')
      return
    }
    setBoards((current) => current.map((item) => item.id === editingGroupBoardId ? { ...item, updatedAt: new Date().toISOString(), groups: item.groups.map((group) => group.id === editingGroupId ? { ...group, name } : group) } : item))
    setEditingGroupId(null)
    setEditingGroupBoardId(null)
    notify('分组名称已更新')
  }

  const requestDeleteGroup = (group: BookmarkBoard['groups'][number], boardId = board?.id) => {
    const targetBoard = boards.find((item) => item.id === boardId)
    if (!targetBoard || targetBoard.groups.length <= 1) {
      notify('至少保留一个分组')
      return
    }
    setDeletingGroupId(group.id)
    setDeletingGroupBoardId(targetBoard.id)
  }

  const deleteGroup = () => {
    const targetBoard = boards.find((item) => item.id === deletingGroupBoardId)
    if (!targetBoard || !deletingGroupId) return
    const fallback = targetBoard.groups.find((group) => group.id !== deletingGroupId)
    if (!fallback) return
    setBoards((current) => current.map((item) => item.id === targetBoard.id ? { ...item, updatedAt: new Date().toISOString(), groups: item.groups.filter((group) => group.id !== deletingGroupId), links: item.links.map((link) => link.groupId === deletingGroupId ? { ...link, groupId: fallback.id } : link) } : item))
    if (activeBoardId === targetBoard.id && activeGroupId === deletingGroupId) setActiveGroupId('all')
    setDeletingGroupId(null)
    setDeletingGroupBoardId(null)
    notify(`分组已删除，链接已移入“${fallback.name}”`)
  }

  const toggleLinkSelection = (linkId: string) => {
    setSelectedLinkIds((current) => current.includes(linkId) ? current.filter((id) => id !== linkId) : [...current, linkId])
  }

  const toggleSelectVisible = () => {
    const visibleIds = visibleLinks.map((link) => link.id)
    setSelectedLinkIds((current) => visibleIds.every((id) => current.includes(id))
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])))
  }

  const openBatchMove = () => {
    if (!selectedLinkIds.length) {
      notify('请先选择要移动的链接')
      return
    }
    const targetBoard = board ?? boards[0]
    const targetGroup = targetBoard?.groups[0]
    setBatchTargetBoardId(targetBoard?.id ?? '')
    setBatchTargetGroupId(targetGroup?.id ?? '')
    setShowBatchMove(true)
  }

  const batchTargetBoard = boards.find((item) => item.id === batchTargetBoardId) ?? board

  const batchMove = () => {
    if (!board || !selectedLinkIds.length || !batchTargetBoard || !batchTargetGroupId) return
    const sourceIds = new Set(selectedLinkIds)
    const sourceLinks = board.links.filter((link) => sourceIds.has(link.id))
    if (!sourceLinks.length) return
    const timestamp = new Date().toISOString()
    setBoards((current) => current.map((item) => {
      if (item.id === board.id && item.id === batchTargetBoard.id) return { ...item, updatedAt: timestamp, links: item.links.map((link) => sourceIds.has(link.id) ? { ...link, groupId: batchTargetGroupId } : link) }
      if (item.id === board.id) return { ...item, updatedAt: timestamp, links: item.links.filter((link) => !sourceIds.has(link.id)) }
      if (item.id === batchTargetBoard.id) return { ...item, updatedAt: timestamp, links: [...sourceLinks.map((link) => ({ ...link, groupId: batchTargetGroupId })), ...item.links] }
      return item
    }))
    setSelectedLinkIds([])
    setSelectionMode(false)
    setShowBatchMove(false)
    setActiveBoardId(batchTargetBoard.id)
    setActiveGroupId(batchTargetGroupId)
    notify(`已移动 ${sourceLinks.length} 条链接`)
  }

  const batchDelete = () => {
    if (!selectedLinkIds.length) return
    const count = selectedLinkIds.length
    const selectedIds = new Set(selectedLinkIds)
    updateBoard((current) => ({ ...current, updatedAt: new Date().toISOString(), links: current.links.filter((link) => !selectedIds.has(link.id)) }))
    setSelectedLinkIds([])
    setSelectionMode(false)
    notify(`已删除 ${count} 条链接`)
  }

  const saveLinkTags = (tags: string[], mode: TagEditMode) => {
    if (!board || !tagEditorLinkIds.length) return
    const targetIds = new Set(tagEditorLinkIds)
    updateBoard((current) => ({ ...current, updatedAt: new Date().toISOString(), links: current.links.map((link) => {
      if (!targetIds.has(link.id)) return link
      const nextTags = mode === 'replace' ? tags : mode === 'add' ? Array.from(new Set([...link.tags, ...tags])) : link.tags.filter((tag) => !tags.includes(tag))
      return { ...link, tags: nextTags }
    }) }))
    const count = tagEditorLinkIds.length
    setTagEditorLinkIds([])
    setSelectedLinkIds([])
    setSelectionMode(false)
    notify(count > 1 ? `已更新 ${count} 条链接的标签` : '链接标签已更新')
  }

  const hasActiveFilters = Boolean(query.trim()) || activeGroupId !== 'all' || tagFilters.length > 0
  const clearFilters = () => {
    setActiveGroupId('all')
    setTagFilters([])
    onClearQuery()
  }

  if (!board) return <div className="empty-state"><Archive size={30} /><h2>还没有看板</h2><p>导入浏览器书签或创建一个新的工作看板。</p><button className="primary-button" onClick={() => addBoard()}><Plus size={16} />创建看板</button></div>

  return <div className="content-wrap">
    <div className="page-heading">
      <div><div className="eyebrow"><span className="eyebrow-dot" />COLLECTIONS</div><h1>书签看板</h1><p>把浏览器里散落的链接，整理成可以快速行动的工作台。</p></div>
      <div className="heading-actions"><button className="ghost-button" onClick={onImport}><FileUp size={16} />导入书签</button><button className="ghost-button" onClick={() => { setNewLink({ title: '', url: '', groupId: board.groups[0]?.id ?? '' }); setShowQuickAdd(true) }}><Link2 size={15} />添加链接</button><button className="ghost-button" onClick={() => board && onExport(board)} title="导出为浏览器可导入的 HTML"><FileDown size={16} />导出当前</button><button className="ghost-button" onClick={onExportAll} title="把所有看板导出为浏览器可导入的 HTML"><Archive size={15} />导出全部</button><button className="ghost-button" onClick={onExportBackup} title="导出 Orbit Workbench JSON 备份"><CloudDownload size={15} />备份 JSON</button><button className="primary-button" onClick={openBoardAdd}><Plus size={16} />新建看板</button></div>
    </div>

    <div className="workspace-grid">
      <aside className={`collection-sidebar ${draggedLink ? 'is-dragging' : ''}`}>
        <div className="side-section-header"><span>我的看板 <b>{boards.length}</b></span><button className="icon-button tiny" onClick={openBoardAdd} aria-label="新建看板"><Plus size={15} /></button></div>
        {draggedLink && <div className="sidebar-drop-hint"><GripVertical size={14} /><div><strong>移动链接</strong><span>拖到高亮分组后松开</span></div></div>}
        <div className="board-tree">
          {boards.map((item) => <div key={item.id} className="tree-item-wrap">
            <div className={`tree-item ${item.id === board.id ? 'selected' : ''}`} onClick={() => { setActiveBoardId(item.id); setActiveGroupId('all'); setTagFilters([]) }}>
              <button className="disclosure" onClick={(event) => { event.stopPropagation(); setExpandedBoards((current) => ({ ...current, [item.id]: !current[item.id] })) }}>{expandedBoards[item.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <FolderOpen size={16} className="tree-folder" /> <span>{item.name}</span><b>{item.links.length}</b><span className="tree-item-actions"><button className="icon-button tiny" onClick={(event) => { event.stopPropagation(); openBoardRename(item) }} aria-label={`重命名看板 ${item.name}`} title="重命名看板"><Pencil size={12} /></button><button className="icon-button tiny danger-hover" onClick={(event) => { event.stopPropagation(); if (boards.length <= 1) notify('至少保留一个看板'); else setDeletingBoardId(item.id) }} aria-label={`删除看板 ${item.name}`} title="删除看板"><Trash2 size={12} /></button></span>
            </div>
            {expandedBoards[item.id] && <div className="tree-children">{item.groups.map((group) => {
              const targetId = `${item.id}:${group.id}`
              const isTarget = dragOverTarget === targetId
              return <div key={group.id} className="tree-child-wrap"><button className={`tree-child ${item.id === board.id && activeGroupId === group.id ? 'selected' : ''} ${isTarget ? 'drop-target' : ''}`} aria-label={`${item.name} / ${group.name}，拖放链接到此分组`} onClick={() => { setActiveBoardId(item.id); setActiveGroupId(group.id); setTagFilters([]) }} onDragEnter={() => { if (draggedLink) setDragOverTarget(targetId) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (draggedLink) setDragOverTarget(targetId) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverTarget((current) => current === targetId ? null : current) }} onDrop={(event) => { event.preventDefault(); moveLink(item.id, group.id) }}><span className="group-dot" style={{ background: group.color }} /><span className="tree-child-label">{group.name}</span><small>{item.links.filter((link) => link.groupId === group.id).length}</small>{isTarget && <em>松开归类</em>}</button><span className="tree-item-actions tree-child-actions"><button className="icon-button tiny" onClick={() => { setActiveBoardId(item.id); openGroupRename(group, item.id) }} aria-label={`重命名分组 ${group.name}`} title="重命名分组"><Pencil size={11} /></button><button className="icon-button tiny danger-hover" onClick={() => { setActiveBoardId(item.id); requestDeleteGroup(group, item.id) }} aria-label={`删除分组 ${group.name}`} title="删除分组"><Trash2 size={11} /></button></span></div>
            })}</div>}
          </div>)}
        </div>
        <button className="add-inline" onClick={openBoardAdd}><Plus size={14} />添加看板</button>
        <div className="side-helper"><Sparkles size={15} /><div><strong>小提示</strong><p>拖拽链接到左侧分组即可整理。</p></div></div>
      </aside>

      <section className="board-stage">
        <div className="board-header">
          <div className="board-title-row"><div className="board-icon"><LayoutGrid size={18} /></div><div><div className="title-with-menu"><h2>{board.name}</h2><button className="icon-button tiny" onClick={() => openBoardRename()} aria-label="重命名看板" title="重命名看板"><Pencil size={14} /></button><button className="icon-button tiny danger-hover" onClick={requestDeleteBoard} aria-label="删除看板" title="删除看板"><Trash2 size={14} /></button></div><p>{board.description}</p></div></div>
          <div className="board-meta"><span><Link2 size={14} />{board.links.length} 个链接</span><span><CloudDownload size={14} />更新于刚刚</span></div>
          <div className="tag-row">{board.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </div>
        <div className="stage-toolbar"><div className="filter-tabs"><button className={activeGroupId === 'all' ? 'active' : ''} onClick={() => setActiveGroupId('all')}>全部链接 <b>{board.links.length}</b></button>{board.groups.map((group) => <span className="filter-tab-wrap" key={group.id}><button className={activeGroupId === group.id ? 'active' : ''} onClick={() => setActiveGroupId(group.id)}><span className="group-dot" style={{ background: group.color }} />{group.name}</button><span className="filter-tab-actions"><button className="icon-button tiny" onClick={() => openGroupRename(group)} aria-label={`重命名分组 ${group.name}`} title="重命名分组"><Pencil size={11} /></button><button className="icon-button tiny danger-hover" onClick={() => requestDeleteGroup(group)} aria-label={`删除分组 ${group.name}`} title="删除分组"><Trash2 size={11} /></button></span></span>)}</div><button className="toolbar-button" onClick={() => setShowGroupAdd(true)}><Plus size={15} />分组</button></div>
        <div className="tag-filter-row"><div className="tag-filter-label"><ListFilter size={14} />标签筛选</div><details className="tag-filter-dropdown"><summary className="tag-filter-trigger"><span>{tagFilters.length ? `已选 ${tagFilters.length} 个标签` : '全部标签'}</span><ChevronDown size={13} /></summary><div className="tag-filter-menu" role="group" aria-label="标签筛选"><label className="tag-filter-option"><input type="checkbox" checked={!tagFilters.length} onChange={() => setTagFilters([])} />全部标签</label>{allTags.map((tag) => <label className="tag-filter-option" key={tag}><input type="checkbox" checked={tagFilters.includes(tag)} onChange={() => setTagFilters((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} /><span className="tag-filter-option-dot" />{tag}</label>)}{tagFilters.length > 0 && <><div className="tag-filter-hint">多选标签按全部匹配</div><button className="tag-filter-clear" onClick={() => setTagFilters([])}><X size={12} />清除标签筛选</button></>}</div></details>{tagFilters.length > 0 && <div className="active-tag-summary" aria-label="已选择的标签筛选">{tagFilters.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}{tagFilters.length > 2 && <b>+{tagFilters.length - 2}</b>}</div>}{hasActiveFilters && <button className="clear-filter-button" onClick={clearFilters}><X size={12} />清除筛选</button>}<div className={`selection-toolbar ${selectionMode ? 'is-active' : ''}`}><button className={`toolbar-button ${selectionMode ? 'active' : ''}`} onClick={() => { setSelectionMode((current) => !current); if (selectionMode) setSelectedLinkIds([]) }}><Check size={14} />{selectionMode ? '退出选择' : '批量管理'}</button>{selectionMode && <div className="selection-actions"><button className="selection-toggle" onClick={toggleSelectVisible}>{visibleLinks.length && visibleLinks.every((link) => selectedLinkIds.includes(link.id)) ? '取消全选' : '选择当前'}<span>{selectedLinkIds.length ? `已选 ${selectedLinkIds.length}` : ''}</span></button><button className="toolbar-button" disabled={!selectedLinkIds.length} onClick={openBatchMove}><Folder size={14} />批量移动</button><button className="toolbar-button" disabled={!selectedLinkIds.length} onClick={() => setTagEditorLinkIds(selectedLinkIds)}><Bookmark size={14} />批量标签</button><button className="toolbar-button danger-action" disabled={!selectedLinkIds.length} onClick={batchDelete}><Trash2 size={14} />批量删除</button></div>}</div></div>

        {visibleLinks.length ? <div className="link-list">{visibleLinks.map((link) => <div key={link.id} className={`link-select-row ${selectedLinkIds.includes(link.id) ? 'selected' : ''}`}>{selectionMode && <input type="checkbox" className="link-select-checkbox" checked={selectedLinkIds.includes(link.id)} onChange={() => toggleLinkSelection(link.id)} aria-label={`选择 ${link.title}`} /> }<LinkRow link={link} group={board.groups.find((group) => group.id === link.groupId)} isDragging={draggedLink?.linkId === link.id && draggedLink.boardId === board.id} onUpdate={(patch) => updateBoard((current) => ({ ...current, updatedAt: new Date().toISOString(), links: current.links.map((item) => item.id === link.id ? { ...item, ...patch } : item) }))} onCopy={onCopy} onDelete={() => { updateBoard((current) => ({ ...current, links: current.links.filter((item) => item.id !== link.id) })); setSelectedLinkIds((current) => current.filter((id) => id !== link.id)); notify('链接已删除') }} onEditTags={() => setTagEditorLinkIds([link.id])} onDragStart={(event) => { const target = event.target as HTMLElement; if (target.closest('input, button, select, textarea')) { event.preventDefault(); return } dragPreviewRef.current?.remove(); const preview = document.createElement('div'); preview.className = 'drag-preview'; preview.textContent = link.title; document.body.appendChild(preview); dragPreviewRef.current = preview; event.dataTransfer.setDragImage(preview, 18, 18); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `${board.id}:${link.id}`); setDraggedLink({ boardId: board.id, linkId: link.id }) }} onDragEnd={() => { dragPreviewRef.current?.remove(); dragPreviewRef.current = null; setDraggedLink(null); setDragOverTarget(null) }} /></div>)}</div> : <div className="empty-board"><Search size={24} /><h3>没有匹配的链接</h3><p>试试搜索其他关键词，或切换标签筛选。</p><button className="ghost-button" onClick={clearFilters}>清除筛选</button></div>}

        <div className="drop-zones"><span>拖放到分组</span>{board.groups.map((group) => <button key={group.id} className={dragOverTarget === `stage:${group.id}` ? 'drop-target' : ''} onDragEnter={() => { if (draggedLink) setDragOverTarget(`stage:${group.id}`) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (draggedLink) setDragOverTarget(`stage:${group.id}`) }} onDragLeave={() => setDragOverTarget((current) => current === `stage:${group.id}` ? null : current)} onDrop={(event) => { event.preventDefault(); moveLink(board.id, group.id) }}><span className="group-dot" style={{ background: group.color }} />{group.name}<ChevronRight size={13} /></button>)}</div>
      </section>

      <aside className="board-inspector">
        <div className="inspector-header"><span>快捷操作</span><Zap size={15} /></div>
        <button className="quick-action" onClick={() => { setNewLink({ title: '', url: '', groupId: board.groups[0]?.id ?? '' }); setShowQuickAdd(true) }}><div className="quick-icon blue"><Plus size={17} /></div><div><strong>添加链接</strong><span>保存一个新网址</span></div><ChevronRight size={15} /></button>
        <button className="quick-action" onClick={() => onExport(board)}><div className="quick-icon green"><FileDown size={17} /></div><div><strong>导出看板</strong><span>保存为浏览器 HTML</span></div><ChevronRight size={15} /></button>
        <div className="inspector-divider" />
        <div className="inspector-block"><div className="inspector-label">最近添加</div>{board.links.slice(0, 3).map((link) => <div className="recent-link" key={link.id}><div className="favicon">{link.title.slice(0, 1)}</div><div><strong>{link.title}</strong><span>{link.url.replace(/^https?:\/\//, '').split('/')[0]}</span></div></div>)}</div>
        <div className="inspector-note"><ShieldCheck size={16} /><div><strong>本地优先</strong><p>数据保存在当前设备，导出文件可用于迁移。</p></div></div>
      </aside>
    </div>
    {showQuickAdd && <Modal title="添加链接" onClose={() => setShowQuickAdd(false)}><div className="form-stack"><label>链接名称<input value={newLink.title} onChange={(event) => setNewLink((current) => ({ ...current, title: event.target.value }))} onKeyDown={(event) => { if (isCommittedEnter(event)) addLink() }} placeholder="例如：Kubernetes 文档" autoFocus /></label><label>网址<input value={newLink.url} onChange={(event) => setNewLink((current) => ({ ...current, url: event.target.value }))} placeholder="https://" /></label><label>所属分组<select value={newLink.groupId || board.groups[0]?.id} onChange={(event) => setNewLink((current) => ({ ...current, groupId: event.target.value }))}>{board.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowQuickAdd(false)}>取消</button><button className="primary-button" onClick={addLink}>保存链接</button></div></div></Modal>}
    {showGroupAdd && <Modal title="添加分组" onClose={() => setShowGroupAdd(false)}><div className="form-stack"><label>分组名称<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) addGroup() }} placeholder="例如：设计灵感" autoFocus /></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowGroupAdd(false)}>取消</button><button className="primary-button" onClick={addGroup}>保存分组</button></div></div></Modal>}
    {showBoardAdd && <Modal title="新建书签看板" onClose={() => setShowBoardAdd(false)}><div className="form-stack"><label>看板名称<input value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} placeholder="例如：前端开发" autoFocus onKeyDown={(event) => { if (isCommittedEnter(event)) createBoard() }} /></label><p className="form-hint">创建后会自动打开新看板，并附带一个“未分组”分组。</p><div className="modal-actions"><button className="ghost-button" onClick={() => setShowBoardAdd(false)}>取消</button><button className="primary-button" onClick={createBoard}><Save size={14} />创建看板</button></div></div></Modal>}
    {editingBoardId && boards.find((item) => item.id === editingBoardId) && <Modal title="重命名书签看板" onClose={() => setEditingBoardId(null)}><div className="form-stack"><label>看板名称<input autoFocus value={boardNameDraft} onChange={(event) => setBoardNameDraft(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) renameBoard() }} placeholder="例如：产品资料" /></label><div className="modal-actions"><button className="ghost-button" onClick={() => setEditingBoardId(null)}>取消</button><button className="primary-button" onClick={renameBoard}><Save size={14} />保存名称</button></div></div></Modal>}
    {editingGroupId && editingGroupBoardId && <Modal title="重命名分组" onClose={() => { setEditingGroupId(null); setEditingGroupBoardId(null) }}><div className="form-stack"><label>分组名称<input autoFocus value={groupNameDraft} onChange={(event) => setGroupNameDraft(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) renameGroup() }} placeholder="例如：常用工具" /></label><div className="modal-actions"><button className="ghost-button" onClick={() => { setEditingGroupId(null); setEditingGroupBoardId(null) }}>取消</button><button className="primary-button" onClick={renameGroup}><Save size={14} />保存名称</button></div></div></Modal>}
    {deletingBoardId && boards.find((item) => item.id === deletingBoardId) && <Modal title="删除书签看板" onClose={() => setDeletingBoardId(null)}><div className="confirm-content"><div className="confirm-icon danger"><Trash2 size={18} /></div><p>确定删除“{boards.find((item) => item.id === deletingBoardId)?.name}”吗？该看板中的链接也会一起移除。</p><div className="modal-actions"><button className="ghost-button" onClick={() => setDeletingBoardId(null)}>取消</button><button className="primary-button danger-button" onClick={deleteBoard}><Trash2 size={14} />确认删除</button></div></div></Modal>}
    {deletingGroupId && deletingGroupBoardId && boards.find((item) => item.id === deletingGroupBoardId) && <Modal title="删除书签分组" onClose={() => { setDeletingGroupId(null); setDeletingGroupBoardId(null) }}><div className="confirm-content"><div className="confirm-icon danger"><Trash2 size={18} /></div><p>确定删除“{boards.find((item) => item.id === deletingGroupBoardId)?.groups.find((group) => group.id === deletingGroupId)?.name}”吗？其中的链接会自动移动到其他分组。</p><div className="modal-actions"><button className="ghost-button" onClick={() => { setDeletingGroupId(null); setDeletingGroupBoardId(null) }}>取消</button><button className="primary-button danger-button" onClick={deleteGroup}><Trash2 size={14} />确认删除</button></div></div></Modal>}
    {showBatchMove && batchTargetBoard && <Modal title={`批量移动 ${selectedLinkIds.length} 条链接`} onClose={() => setShowBatchMove(false)}><div className="form-stack"><label>目标看板<select value={batchTargetBoardId} onChange={(event) => { const nextBoard = boards.find((item) => item.id === event.target.value); setBatchTargetBoardId(event.target.value); setBatchTargetGroupId(nextBoard?.groups[0]?.id ?? '') }}>{boards.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>目标分组<select value={batchTargetGroupId} onChange={(event) => setBatchTargetGroupId(event.target.value)}>{batchTargetBoard.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><p className="form-hint">链接会保留名称、地址、标签和备注。</p><div className="modal-actions"><button className="ghost-button" onClick={() => setShowBatchMove(false)}>取消</button><button className="primary-button" onClick={batchMove}><Folder size={14} />确认移动</button></div></div></Modal>}
    {tagEditorLinkIds.length > 0 && <TagEditorModal title={tagEditorLinkIds.length > 1 ? `批量管理 ${tagEditorLinkIds.length} 条链接标签` : '管理链接标签'} currentTags={tagEditorLinkIds.length === 1 ? board.links.find((link) => link.id === tagEditorLinkIds[0])?.tags ?? [] : []} suggestions={allTags.filter((tag) => tag !== '全部')} batchCount={tagEditorLinkIds.length > 1 ? tagEditorLinkIds.length : undefined} onClose={() => setTagEditorLinkIds([])} onSave={saveLinkTags} />}
  </div>
}

function LinkRow({ link, group, isDragging, onUpdate, onCopy, onDelete, onEditTags, onDragStart, onDragEnd }: { link: BookmarkBoard['links'][number]; group?: BookmarkBoard['groups'][number]; isDragging?: boolean; onUpdate: (patch: Partial<BookmarkBoard['links'][number]>) => void; onCopy: (value: string, label?: string) => void; onDelete: () => void; onEditTags: () => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void }) {
  const hostname = link.url.replace(/^(https?:\/\/|chrome-extension:\/\/)/, '').split('/')[0]
  const visibleTags = link.tags.slice(0, 2)
  const hiddenTagCount = Math.max(0, link.tags.length - visibleTags.length)
  const [draft, setDraft] = useState({ title: link.title, url: link.url, description: link.description ?? '' })
  useEffect(() => setDraft({ title: link.title, url: link.url, description: link.description ?? '' }), [link.id, link.title, link.url, link.description])
  const commit = (field: 'title' | 'url' | 'description') => {
    const value = draft[field].trim()
    if (field !== 'description' && !value) {
      setDraft((current) => ({ ...current, [field]: link[field] }))
      return
    }
    if (value !== (link[field] ?? '')) onUpdate({ [field]: value })
  }
  const openLink = () => window.open(link.url, '_blank')
  return <article className={`link-row ${isDragging ? 'is-dragging' : ''}`} draggable onClick={(event) => { if (!(event.target as HTMLElement).closest('input, button, select, textarea')) openLink() }} onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <div className="favicon large">{link.title.slice(0, 1)}</div>
    <div className="row-content"><div className="link-title-edit"><input className="link-inline-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} onBlur={() => commit('title')} onKeyDown={(event) => { if (isCommittedEnter(event)) event.currentTarget.blur() }} aria-label="链接名称" /><ExternalLink size={14} /></div><input className="link-inline-url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} onBlur={() => commit('url')} onKeyDown={(event) => { if (isCommittedEnter(event)) event.currentTarget.blur() }} aria-label="链接地址" /><input className="link-inline-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} onBlur={() => commit('description')} placeholder="添加备注…" aria-label="链接备注" /><div className="link-host">{hostname}</div></div>
    <span className="group-label row-group"><span className="group-dot" style={{ background: group?.color }} />{group?.name ?? '未分组'}</span>
    <button className="mini-tags row-tags tag-trigger" onClick={(event) => { event.stopPropagation(); onEditTags() }} aria-label={`编辑 ${link.title} 标签`} title="点击管理标签">{link.tags.length ? <>{visibleTags.map((tag) => <span key={tag}>{tag}</span>)}{hiddenTagCount > 0 && <span className="tag-overflow">+{hiddenTagCount}</span>}</> : <span className="tag-empty">+ 标签</span>}</button>
    <div className="row-actions"><button className="icon-button tiny" onClick={(event) => { event.stopPropagation(); onEditTags() }} aria-label={`编辑 ${link.title} 标签`} title="管理标签"><Bookmark size={15} /></button><button className="icon-button tiny" onClick={() => onCopy(link.url, '链接已复制')} aria-label="复制链接"><Copy size={16} /></button><button className="icon-button tiny" onClick={openLink} aria-label="打开链接"><ArrowUpRight size={17} /></button><button className="icon-button tiny danger-hover" onClick={onDelete} aria-label="删除链接"><Trash2 size={16} /></button><GripVertical size={17} className="drag-handle" /></div>
  </article>
}

function TagEditorModal({ title, currentTags, suggestions, batchCount, onClose, onSave }: { title: string; currentTags: string[]; suggestions: string[]; batchCount?: number; onClose: () => void; onSave: (tags: string[], mode: TagEditMode) => void }) {
  const [tags, setTags] = useState(currentTags)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<TagEditMode>(batchCount ? 'add' : 'replace')
  const addTag = (value = draft) => {
    const tag = value.trim().replace(/^#/, '')
    if (!tag) return
    setTags((current) => Array.from(new Set([...current, tag])))
    setDraft('')
  }
  const removeTag = (tag: string) => setTags((current) => current.filter((item) => item !== tag))
  return <Modal title={title} onClose={onClose}><div className="tag-editor">
    {batchCount && <p className="form-hint">将对选中的 {batchCount} 个条目执行标签操作。</p>}
    {batchCount && <div className="tag-operation" role="group" aria-label="标签操作"><button className={mode === 'add' ? 'active' : ''} onClick={() => setMode('add')}><Plus size={13} />追加</button><button className={mode === 'remove' ? 'active' : ''} onClick={() => setMode('remove')}><Trash2 size={13} />移除</button><button className={mode === 'replace' ? 'active' : ''} onClick={() => setMode('replace')}><Save size={13} />替换</button></div>}
    <div className="tag-editor-label">{batchCount ? '选择标签' : '当前标签'}</div>
    <div className="tag-editor-chips">{tags.map((tag) => <span className="editable-tag" key={tag}>{tag}<button onClick={() => removeTag(tag)} aria-label={`移除标签 ${tag}`}><X size={12} /></button></span>)}{!tags.length && <span className="tag-editor-empty">还没有标签</span>}</div>
    <div className="tag-input-row"><input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) { event.preventDefault(); addTag() } }} placeholder="输入标签后按 Enter" /><button className="toolbar-button" onClick={() => addTag()} disabled={!draft.trim()}><Plus size={14} />添加</button></div>
    {suggestions.length > 0 && <div className="tag-suggestions"><span>已有标签</span>{suggestions.map((tag) => <button key={tag} className={tags.includes(tag) ? 'selected' : ''} onClick={() => tags.includes(tag) ? removeTag(tag) : addTag(tag)}>{tag}</button>)}</div>}
    <div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => onSave(tags, mode)}><Save size={14} />保存标签</button></div>
  </div></Modal>
}

function KubeconfigView({ configs, setConfigs, groups, setGroups, commands, setCommands, defaultCommandId, onDefaultCommandChange, query, onClearQuery, onCopy, notify }: { configs: KubeConfig[]; setConfigs: React.Dispatch<React.SetStateAction<KubeConfig[]>>; groups: KubeGroup[]; setGroups: React.Dispatch<React.SetStateAction<KubeGroup[]>>; commands: CommandTemplate[]; setCommands: React.Dispatch<React.SetStateAction<CommandTemplate[]>>; defaultCommandId: string; onDefaultCommandChange: React.Dispatch<React.SetStateAction<string>>; query: string; onClearQuery: () => void; onCopy: (value: string, label?: string) => void; notify: (message: string) => void }) {
  const initialSelectedId = configs[0]?.id ?? ''
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [configTagFilters, setConfigTagFilters] = useState<string[]>([])
  const [templateId, setTemplateId] = useState(defaultCommandId && commands.some((item) => item.id === defaultCommandId) ? defaultCommandId : commands[0]?.id ?? '')
  const [context, setContext] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [extraArgs, setExtraArgs] = useState('')
  const [sortMode, setSortMode] = useState<ConfigSort>('created')
  const [showAdd, setShowAdd] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [showCommandManager, setShowCommandManager] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState({ name: '', color: kubeGroupPalette[2] })
  const [draggedConfig, setDraggedConfig] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const kubeDragPreviewRef = useRef<HTMLDivElement | null>(null)
  const [envNameDraft, setEnvNameDraft] = useState('')
  const [selectedConfigIds, setSelectedConfigIds] = useState<string[]>([])
  const [groupEditor, setGroupEditor] = useState<KubeGroup | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'configs' | 'group'; groupId?: string } | null>(null)
  const [tagEditorConfigIds, setTagEditorConfigIds] = useState<string[]>([])
  const selected = configs.find((config) => config.id === selectedId) ?? configs[0]
  const availableConfigTags = useMemo(() => Array.from(new Set(configs.flatMap((config) => config.tags))).sort((a, b) => a.localeCompare(b, 'zh-CN')), [configs])
  const filteredConfigs = configs.filter((config) => {
    const text = `${config.name} ${displayEnvName(config)} ${config.path} ${config.context} ${(config.contexts ?? []).join(' ')} ${config.server} ${config.tags.join(' ')}`.toLowerCase()
    const matchesTags = configTagFilters.length === 0 || configTagFilters.every((tag) => config.tags.includes(tag))
    return (selectedGroup === 'all' || config.groupId === selectedGroup) && matchesTags && (!query || text.includes(query.toLowerCase()))
  })
  const displayedConfigs = useMemo(() => [...filteredConfigs].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    return (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0)
  }), [filteredConfigs, sortMode])
  const hasActiveConfigFilter = Boolean(query.trim()) || selectedGroup !== 'all' || configTagFilters.length > 0
  const clearConfigFilters = () => {
    setSelectedGroup('all')
    setConfigTagFilters([])
    onClearQuery()
  }
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

  useEffect(() => {
    setSelectedConfigIds((current) => current.filter((id) => configs.some((config) => config.id === id)))
  }, [configs])

  const updateConfig = (id: string, updater: (config: KubeConfig) => KubeConfig) => setConfigs((current) => current.map((item) => item.id === id ? updater(item) : item))
  const parseList = (value: string) => Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)))

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

  const saveGroupEdit = () => {
    if (!groupEditor) return
    const name = groupEditor.name.trim()
    if (!name) {
      notify('请填写分组名称')
      return
    }
    setGroups((current) => current.map((group) => group.id === groupEditor.id ? { ...group, name, color: groupEditor.color } : group))
    setGroupEditor(null)
    notify('分组已更新')
  }

  const deleteGroup = (groupId: string) => {
    if (!groups.some((group) => group.id === groupId)) return
    if (groups.length <= 1) {
      setConfirmAction(null)
      notify('至少保留一个分组')
      return
    }
    setGroups((current) => current.filter((group) => group.id !== groupId))
    const fallbackGroupId = groups.find((group) => group.id !== groupId)?.id ?? ''
    setConfigs((current) => current.map((config) => config.groupId === groupId ? { ...config, groupId: fallbackGroupId, updatedAt: '刚刚' } : config))
    if (selectedGroup === groupId) setSelectedGroup('all')
    setConfirmAction(null)
    notify('分组已删除，配置已移入其他分组')
  }

  const moveConfig = (groupId: string) => {
    if (!draggedConfig) return
    updateConfig(draggedConfig, (item) => ({ ...item, groupId, updatedAt: '刚刚' }))
    setDraggedConfig(null)
    setDragOverGroupId(null)
    notify('配置已移动')
  }

  const toggleConfigSelection = (id: string) => {
    setSelectedConfigIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const toggleVisibleSelection = () => {
    const visibleIds = displayedConfigs.map((config) => config.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedConfigIds.includes(id))
    setSelectedConfigIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])))
  }

  const moveSelectedConfigs = (groupId: string) => {
    if (!selectedConfigIds.length) return
    const selectedCount = selectedConfigIds.length
    const ids = new Set(selectedConfigIds)
    setConfigs((current) => current.map((config) => ids.has(config.id) ? { ...config, groupId, updatedAt: '刚刚' } : config))
    setSelectedConfigIds([])
    notify(`${selectedCount} 个配置已移动`)
  }

  const deleteSelectedConfigs = () => {
    if (!selectedConfigIds.length) return
    setConfirmAction({ type: 'configs' })
  }

  const saveConfigTags = (tags: string[], mode: TagEditMode) => {
    if (!tagEditorConfigIds.length) return
    const targetIds = new Set(tagEditorConfigIds)
    setConfigs((current) => current.map((config) => {
      if (!targetIds.has(config.id)) return config
      const nextTags = mode === 'replace' ? tags : mode === 'add' ? Array.from(new Set([...config.tags, ...tags])) : config.tags.filter((tag) => !tags.includes(tag))
      return { ...config, tags: nextTags, updatedAt: '刚刚' }
    }))
    const count = tagEditorConfigIds.length
    setTagEditorConfigIds([])
    setSelectedConfigIds([])
    notify(count > 1 ? `已更新 ${count} 个配置的标签` : '配置标签已更新')
  }

  const confirmDeleteAction = () => {
    if (!confirmAction) return
    if (confirmAction.type === 'configs') {
      const ids = new Set(selectedConfigIds)
      const remaining = configs.filter((config) => !ids.has(config.id))
      setConfigs(remaining)
      setSelectedConfigIds([])
      if (selected && ids.has(selected.id)) setSelectedId(remaining[0]?.id ?? '')
      notify('已删除选中的 kubeconfig')
    } else if (confirmAction.groupId) {
      deleteGroup(confirmAction.groupId)
      return
    }
    setConfirmAction(null)
  }

  const changeContext = (value: string) => {
    setContext(value)
    if (selected) updateConfig(selected.id, (item) => ({ ...item, context: value, contexts: Array.from(new Set([...(item.contexts ?? []), value])) }))
  }

  const deleteConfig = () => {
    if (!selected) return
    setSelectedConfigIds([selected.id])
    setConfirmAction({ type: 'configs' })
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
      <aside className={`kube-groups panel ${draggedConfig ? 'is-dragging' : ''}`}><div className="panel-title"><span>环境分组</span><button className="icon-button tiny" onClick={addKubeGroup} aria-label="新建 kubeconfig 分组"><Plus size={15} /></button></div>{draggedConfig && <div className="group-drop-banner"><GripVertical size={13} />拖到高亮分组后松开</div>}<button className={`kube-group-item ${selectedGroup === 'all' ? 'active' : ''}`} onClick={() => setSelectedGroup('all')}><div className="group-icon"><HardDrive size={15} /></div><span>全部配置</span><b>{configs.length}</b></button>{groups.map((group) => <div className={`kube-group-item ${selectedGroup === group.id ? 'active' : ''} ${dragOverGroupId === group.id ? 'drop-target' : ''}`} key={group.id} role="button" tabIndex={0} onClick={() => setSelectedGroup(group.id)} onKeyDown={(event) => { if ((isCommittedEnter(event)) || event.key === ' ') { event.preventDefault(); setSelectedGroup(group.id) } }} onDragOver={(event) => { event.preventDefault(); setDragOverGroupId(group.id) }} onDragEnter={() => setDragOverGroupId(group.id)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverGroupId(null) }} onDrop={(event) => { event.preventDefault(); moveConfig(group.id) }} aria-label={`分组 ${group.name}，拖到此处归类`}><div className="group-icon" style={{ color: group.color, background: `${group.color}18` }}><Folder size={15} /></div><span>{group.name}{dragOverGroupId === group.id && <small>松开归类</small>}</span><b>{configs.filter((config) => config.groupId === group.id).length}</b><div className="group-item-actions"><button className="icon-button tiny" onClick={(event) => { event.stopPropagation(); setGroupEditor(group) }} aria-label={`重命名 ${group.name}`} title="重命名分组"><Pencil size={12} /></button><button className="icon-button tiny danger-hover" onClick={(event) => { event.stopPropagation(); setConfirmAction({ type: 'group', groupId: group.id }) }} aria-label={`删除 ${group.name}`} title="删除分组"><Trash2 size={12} /></button></div></div>)}<button className="group-drop-hint" onClick={addKubeGroup}><Plus size={14} />新建分组</button></aside>
      <section className="config-list panel"><div className="config-list-header"><div className="panel-title"><span>配置文件 <b>{filteredConfigs.length}</b></span><span className="config-list-hint">拖动可调整分组</span>{hasActiveConfigFilter && <button className="clear-filter-button" onClick={clearConfigFilters}><X size={12} />清除筛选</button>}</div><div className="config-list-controls"><div className={`config-selection-toolbar ${selectedConfigIds.length ? 'has-selection' : ''}`}><label className="select-all-control"><input type="checkbox" checked={displayedConfigs.length > 0 && displayedConfigs.every((config) => selectedConfigIds.includes(config.id))} onChange={toggleVisibleSelection} aria-label="全选当前配置" />{selectedConfigIds.length ? `已选 ${selectedConfigIds.length}` : '全选'}</label>{selectedConfigIds.length > 0 && <><select aria-label="批量移动配置" value="" onChange={(event) => { if (event.target.value) moveSelectedConfigs(event.target.value) }}><option value="">批量移动</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select><button className="inline-control" onClick={() => setTagEditorConfigIds(selectedConfigIds)}><Bookmark size={13} />标签</button><button className="inline-control danger-control" onClick={deleteSelectedConfigs}><Trash2 size={13} />删除</button></>}</div><details className="config-tag-filter"><summary><ListFilter size={13} />标签{configTagFilters.length ? <b>{configTagFilters.length}</b> : null}<ChevronDown size={12} /></summary><div className="config-tag-menu"><div className="config-tag-menu-head"><span>选择标签</span>{configTagFilters.length > 0 && <button onClick={() => setConfigTagFilters([])}>清除</button>}</div>{availableConfigTags.length ? availableConfigTags.map((tag) => <label key={tag}><input type="checkbox" checked={configTagFilters.includes(tag)} onChange={() => setConfigTagFilters((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} /> <span>{tag}</span></label>) : <span className="config-tag-empty">暂无标签</span>}<p>多个标签同时选择时按全部匹配。</p></div></details><label className="sort-control"><ArrowDownUp size={13} /><span>排序</span><select aria-label="配置排序" value={sortMode} onChange={(event) => setSortMode(event.target.value as ConfigSort)}><option value="created">创建时间</option><option value="name">名称</option></select></label></div></div>{displayedConfigs.map((config) => <div key={config.id} className={`config-row ${selected?.id === config.id ? 'active' : ''} ${draggedConfig === config.id ? 'dragging' : ''} ${selectedConfigIds.includes(config.id) ? 'checked' : ''}`} role="button" tabIndex={0} onClick={() => setSelectedId(config.id)} onKeyDown={(event) => { if (isCommittedEnter(event)) setSelectedId(config.id) }} draggable onDragStart={(event) => { const target = event.target as HTMLElement; if (target.closest('button,input,select')) { event.preventDefault(); return } kubeDragPreviewRef.current?.remove(); const preview = document.createElement('div'); preview.className = 'drag-preview kube-drag-preview'; preview.textContent = `${config.name} · ${displayEnvName(config)}`; document.body.appendChild(preview); kubeDragPreviewRef.current = preview; event.dataTransfer.setDragImage(preview, 18, 18); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', config.id); setDraggedConfig(config.id); setDragOverGroupId(null) }} onDragEnd={() => { kubeDragPreviewRef.current?.remove(); kubeDragPreviewRef.current = null; setDraggedConfig(null); setDragOverGroupId(null) }}><input className="config-select-checkbox" type="checkbox" checked={selectedConfigIds.includes(config.id)} onChange={() => toggleConfigSelection(config.id)} onClick={(event) => event.stopPropagation()} aria-label={`选择 ${config.name}`} /><div className="config-file-icon"><KeyRound size={17} /></div><div className="config-row-main"><strong>{config.name}</strong><span>{config.path}</span><div className="config-row-meta"><span className="config-env-pill">环境变量：{displayEnvName(config)}</span><span className="context-pill">{config.context}</span><button className="config-tags-trigger" onClick={(event) => { event.stopPropagation(); setTagEditorConfigIds([config.id]) }} aria-label={`编辑 ${config.name} 标签`} title="点击管理标签">{config.tags.length ? <>{config.tags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}{config.tags.length > 2 && <em className="tag-overflow">+{config.tags.length - 2}</em>}</> : <em className="tag-empty">+ 标签</em>}</button></div></div><button className="config-detail-button" onClick={(event) => { event.stopPropagation(); setDetailsId(config.id) }} aria-label={`查看 ${config.name} 详情`} title="查看配置详情"><Info size={14} /></button><ChevronRight size={15} className="row-chevron" /></div>) }{!displayedConfigs.length && <div className="panel-empty"><Search size={22} /><p>没有找到匹配的配置</p></div>}<button className="add-config-row" onClick={() => setShowAdd(true)}><Plus size={15} />添加一个 kubeconfig</button></section>
      <section className="command-panel panel"><div className="command-panel-header"><div><div className="panel-kicker"><Terminal size={14} />COMMAND BUILDER</div><h2>命令生成器</h2><p>点击配置后生成对应命令，可直接复制到终端。</p></div><div className="terminal-badge"><span />shell</div></div>{selected ? <><div className="selected-config"><div className="config-file-icon big"><KeyRound size={18} /></div><div className="selected-config-main"><span>当前配置</span><strong>{selected.name}</strong><small>{selected.path}</small><label className="selected-env-name"><span>环境变量名称</span><input aria-label="环境变量名称" value={envNameDraft} onChange={(event) => setEnvNameDraft(event.target.value)} onBlur={commitEnvName} onKeyDown={(event) => { if (isCommittedEnter(event)) { event.currentTarget.blur() } }} placeholder="例如 PRODUCTION" /></label></div><button className="icon-button tiny" onClick={() => setDetailsId(selected.id)} aria-label="查看配置详情" title="查看配置详情"><Info size={14} /></button><button className="icon-button tiny" onClick={() => onCopy(selected.path, '路径已复制')} aria-label="复制配置路径"><Copy size={14} /></button><button className="icon-button tiny danger-hover" onClick={deleteConfig} aria-label="删除配置"><Trash2 size={14} /></button></div><div className="command-form"><div className="command-label-row"><label htmlFor="command-template">常用命令</label><div><button className="inline-control" onClick={() => setShowCommandManager(true)}><SlidersHorizontal size={13} />管理命令</button><button className="inline-control" onClick={() => onDefaultCommandChange(templateId)}><Star size={13} fill={defaultCommandId === templateId ? 'currentColor' : 'none'} />{defaultCommandId === templateId ? '默认命令' : '设为默认'}</button></div></div><select id="command-template" aria-label="常用命令" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{commands.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.command}</option>)}</select><div className="form-row"><label>Context<select aria-label="Context" value={context} onChange={(event) => changeContext(event.target.value)}>{contextOptions.length ? contextOptions.map((item) => <option value={item} key={item}>{item}</option>) : <option value="">未读取 context</option>}</select></label><label>命名空间<input value={namespace} onChange={(event) => setNamespace(event.target.value)} placeholder="default" /></label></div><label className="extra-args-field">附加参数<input value={extraArgs} onChange={(event) => setExtraArgs(event.target.value)} placeholder="例如 --watch 或 -l app=web" /></label></div><div className="command-preview"><div className="preview-header"><span>预览</span><button className="copy-command" onClick={() => onCopy(generatedCommand, '命令已复制')}><Copy size={14} />复制命令</button></div><pre><code>{generatedCommand.split('\n').map((line, index) => <span className="command-line" key={`${line}-${index}`}><b>{line}</b></span>)}</code></pre></div><div className="command-note"><ShieldCheck size={15} /><span>命令只在本地生成，不会执行或上传配置内容。</span></div></> : <div className="panel-empty"><KeyRound size={22} /><p>选择一个配置开始</p></div>}</section>
    </div>
    {showAdd && <Modal title="导入 kubeconfig" className="modal-wide kube-import-modal" onClose={() => { if (!importBusy) setShowAdd(false) }}><KubeImportPanel onBusyChange={setImportBusy} configs={configs} groups={groups} initialGroupId={selectedGroup} onClose={() => setShowAdd(false)} onImport={(files, options) => {
      const groupId = options.groupId || groups[0]?.id || uid('kube-group')
      const { configs: imported, duplicateCount } = prepareKubeImports(files, configs, { ...options, groupId })
      if (!imported.length) { notify('选中的配置已存在，无需重复导入'); return }
      try { localStorage.setItem('orbit-kube-configs', JSON.stringify([...imported, ...configs])) }
      catch { throw new Error('本地工作区空间不足，请减少本次导入数量。源文件未修改；粘贴内容若已保存，可用单个文件入口再次导入。') }
      if (!groups.length) setGroups((current) => [...current, { id: groupId, name: '导入配置', color: kubeGroupPalette[0] }])
      setConfigs((current) => [...imported, ...current])
      setSelectedGroup(groupId)
      setConfigTagFilters([])
      onClearQuery()
      setSelectedId(imported[0].id)
      setShowAdd(false)
      notify(`已导入 ${imported.length} 个配置${duplicateCount ? `，跳过 ${duplicateCount} 个重复文件` : ''}`)
    }} /></Modal>}
    {showGroupAdd && <Modal title="新建环境分组" onClose={() => setShowGroupAdd(false)}><div className="form-stack"><label>分组名称<input autoFocus value={newGroup.name} onChange={(event) => setNewGroup((current) => ({ ...current, name: event.target.value }))} onKeyDown={(event) => { if (isCommittedEnter(event)) saveKubeGroup() }} placeholder="例如：生产集群" /></label><label>分组颜色<div className="color-palette" role="radiogroup" aria-label="分组颜色">{kubeGroupPalette.map((color) => <button key={color} type="button" className={newGroup.color === color ? 'selected' : ''} style={{ background: color }} aria-label={`选择颜色 ${color}`} aria-pressed={newGroup.color === color} onClick={() => setNewGroup((current) => ({ ...current, color }))} />)}</div></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowGroupAdd(false)}>取消</button><button className="primary-button" onClick={saveKubeGroup}><Save size={14} />创建分组</button></div></div></Modal>}
    {groupEditor && <Modal title="编辑环境分组" onClose={() => setGroupEditor(null)}><div className="form-stack"><label>分组名称<input autoFocus value={groupEditor.name} onChange={(event) => setGroupEditor((current) => current ? { ...current, name: event.target.value } : current)} onKeyDown={(event) => { if (isCommittedEnter(event)) saveGroupEdit() }} placeholder="例如：生产集群" /></label><label>分组颜色<div className="color-palette" role="radiogroup" aria-label="分组颜色">{kubeGroupPalette.map((color) => <button key={color} type="button" className={groupEditor.color === color ? 'selected' : ''} style={{ background: color }} aria-label={`选择颜色 ${color}`} aria-pressed={groupEditor.color === color} onClick={() => setGroupEditor((current) => current ? { ...current, color } : current)} />)}</div></label><div className="modal-actions"><button className="ghost-button" onClick={() => setGroupEditor(null)}>取消</button><button className="primary-button" onClick={saveGroupEdit}><Save size={14} />保存分组</button></div></div></Modal>}
    {detailsId && configs.find((config) => config.id === detailsId) && <ConfigDetailModal config={configs.find((config) => config.id === detailsId)!} groups={groups} onClose={() => setDetailsId(null)} onSave={saveDetails} />}
    {showCommandManager && <CommandManagerModal commands={commands} defaultCommandId={defaultCommandId} setCommands={setCommands} onDefaultCommandChange={onDefaultCommandChange} onClose={() => setShowCommandManager(false)} notify={notify} />}
    {tagEditorConfigIds.length > 0 && <TagEditorModal title={tagEditorConfigIds.length > 1 ? `批量管理 ${tagEditorConfigIds.length} 个配置标签` : '管理配置标签'} currentTags={tagEditorConfigIds.length === 1 ? configs.find((config) => config.id === tagEditorConfigIds[0])?.tags ?? [] : []} suggestions={Array.from(new Set(configs.flatMap((config) => config.tags)))} batchCount={tagEditorConfigIds.length > 1 ? tagEditorConfigIds.length : undefined} onClose={() => setTagEditorConfigIds([])} onSave={saveConfigTags} />}
    {confirmAction && <Modal title={confirmAction.type === 'configs' ? '删除 kubeconfig' : '删除环境分组'} onClose={() => setConfirmAction(null)}><div className="confirm-dialog"><p>{confirmAction.type === 'configs' ? `确定删除选中的 ${selectedConfigIds.length} 个 kubeconfig 吗？此操作只会移除 Orbit 中的记录，不会删除磁盘上的源文件。` : '确定删除这个环境分组吗？组内配置会自动移动到其他分组。'}</p><div className="modal-actions"><button className="ghost-button" onClick={() => setConfirmAction(null)}>取消</button><button className="primary-button danger-button" onClick={confirmDeleteAction}><Trash2 size={14} />确认删除</button></div></div></Modal>}
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

function SettingsView({ boards, configs, theme, onThemeChange, density, onDensityChange }: { boards: BookmarkBoard[]; configs: KubeConfig[]; theme: Theme; onThemeChange: React.Dispatch<React.SetStateAction<Theme>>; density: Density; onDensityChange: React.Dispatch<React.SetStateAction<Density>> }) {
  return <div className="content-wrap settings-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />WORKSPACE</div><h1>偏好设置</h1><p>调整界面显示并检查工作区状态。</p></div></div><div className="settings-grid"><section className="settings-card theme-settings-card"><div className={`settings-card-icon ${theme === 'light' ? 'orange' : ''}`}>{theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}</div><div><h3>界面主题</h3><p>在暗色和亮色界面之间切换，选择会自动保存到本机。</p></div><div className="theme-switch" role="group" aria-label="界面主题"><button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}><Moon size={13} />暗色</button><button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}><Sun size={13} />亮色</button></div></section><section className="settings-card density-settings-card"><div className="settings-card-icon green"><SlidersHorizontal size={18} /></div><div><h3>信息密度</h3><p>在快速浏览和完整信息之间切换，配置会自动保存到本机。</p></div><div className="density-switch" role="group" aria-label="信息密度"><button className={density === 'comfortable' ? 'active' : ''} onClick={() => onDensityChange('comfortable')}><LayoutGrid size={13} />舒适</button><button className={density === 'compact' ? 'active' : ''} onClick={() => onDensityChange('compact')}><ListFilter size={13} />紧凑</button></div></section><section className="settings-card"><div className="settings-card-icon"><Laptop size={18} /></div><div><h3>本地工作区</h3><p>当前版本将数据保存到浏览器本地存储，适合单机使用和快速验证。</p></div><span className="status-badge"><span />正常</span></section><section className="settings-card"><div className="settings-card-icon green"><Archive size={18} /></div><div><h3>数据概览</h3><p>{boards.length} 个书签看板 · {configs.length} 个 kubeconfig · 自动保存已开启</p></div><span className="status-badge"><span />已同步</span></section><section className="settings-card"><div className="settings-card-icon orange"><Code2 size={18} /></div><div><h3>跨平台路线</h3><p>桌面端可接入 Tauri 文件系统；Apple 端可复用同一数据模型，接入 iCloud 或 CloudKit。</p></div><span className="version-label">v0.1</span></section></div></div>
}

function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><div className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={17} /></button></div>{children}</div></div>
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
