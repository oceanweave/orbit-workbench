import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
  Undo2,
  X,
  Zap,
  Moon,
} from 'lucide-react'
import { commandTemplates, initialBoards, initialKubeConfigs, initialKubeGroups } from './data'
import { BookmarkPanels } from './components/BookmarkPanels'
import { GroupOrganizer } from './components/GroupOrganizer'
import { BoardOrganizer } from './components/BoardOrganizer'
import { ColorPicker } from './components/ColorPicker'
import { useContextMenu } from './components/ContextMenu'
import { DropGap } from './components/DropGap'
import { StoragePanel } from './components/StoragePanel'
import { ExchangePanel } from './components/ExchangePanel'
import { useDirectorySize } from './components/DirectorySizer'
import { usePersistentState, commitStorage, canUndoWorkspace, undoWorkspace } from './lib/workspaceStore'
import { validateBackup, mergeBackup, selectBookmarks, copyBoards, independentGroup, type WorkspaceBackup } from '../shared/workspace.mjs'
import { Modal } from './components/Modal'
import { useCommandLibrary } from './features/commands/useCommandLibrary'
import { KubeImportPanel } from './components/KubeImportPanel'
import { BookmarkGroupTree } from './components/BookmarkGroupTree'
import { useWorkspaceDrag, rowDropTarget, dropClassName, isSameDragItem, type WorkspaceDropTarget } from './hooks/useWorkspaceDrag'
import { reorderItems, placeGroupedItems, orderVisibleItems } from '../shared/ordering.mjs'
import { bookmarkGroupRows, bookmarkGroupPath, bookmarkDescendantIds, reparentBookmarkGroup, deleteBookmarkGroup, moveBookmarkLinks, placeBookmarkGroup, placeBookmarkLink, createBrowserBookmarksHtml, parseBookmarksHtml, bookmarkSearchBoard } from '../shared/bookmarks.mjs'
import { generateKubeCommand, validateEnvName, type CommandFormat, type CommandShell } from '../shared/kube-command.mjs'
import { inspectKubeconfig, prepareKubeImports, setKubeCurrentContext } from '../shared/kubeconfig.mjs'
import type { BookmarkBoard, BookmarkGroup, BoardCategory, CommandTemplate, KubeConfig, KubeGroup, LinkItem } from './types'

const CommandLibraryView = lazy(() => import('./features/commands/CommandLibraryView').then((module) => ({ default: module.CommandLibraryView })))

type Section = 'bookmarks' | 'kubeconfig' | 'commands' | 'settings'
type Theme = 'dark' | 'light'
type Density = 'comfortable' | 'compact'
type ConfigSort = 'manual' | 'created' | 'name'
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


const safeDownloadName = (value: string) => value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'orbit-bookmarks'

const displayEnvName = (config: KubeConfig) => deriveEnvName(config.envName || config.alias || config.metaName?.replace(/^META_/i, '') || config.name || filenameStem(config.path))

const parseKubeconfigContent = (content: string) => {
  try { return inspectKubeconfig(content) }
  catch { return { context: '', contexts: [] as string[], server: '' } }
}

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`

function App() {
  const [section, setSection] = useState<Section>('bookmarks')
  const [boards, setBoards] = usePersistentState<BookmarkBoard[]>('orbit-boards', initialBoards)
  const [kubeConfigs, setKubeConfigs] = usePersistentState<KubeConfig[]>('orbit-kube-configs', initialKubeConfigs)
  const [kubeGroups, setKubeGroups] = usePersistentState<KubeGroup[]>('orbit-kube-groups', initialKubeGroups)
  const [kubeCommands, setKubeCommands] = usePersistentState<CommandTemplate[]>('orbit-kube-commands', commandTemplates)
  const [defaultCommandId, setDefaultCommandId] = usePersistentState('orbit-default-kube-command', commandTemplates[0]?.id ?? '')
  const [theme, setTheme] = usePersistentState<Theme>('orbit-theme', 'dark')
  const [density, setDensity] = usePersistentState<Density>('orbit-density', 'comfortable')
  const [categories, setCategories] = usePersistentState<BoardCategory[]>('orbit-board-categories', [])
  const [showStorage, setShowStorage] = useState(false)
  const [exchange, setExchange] = useState<{ imported?: WorkspaceBackup } | null>(null)
  const [undoReady, setUndoReady] = useState(false)
  const [commandsVisited, setCommandsVisited] = useState(false)
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
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        notify(label)
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
        notify(label)
      } catch {
        notify('复制失败，请检查浏览器权限')
      }
    }
  }

  const [commandLibrary, saveCommandLibrary] = useCommandLibrary(notify)

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

  const viewState = Object.fromEntries(['orbit-bookmark-collapse', 'orbit-tree-collapse', 'orbit-expanded-boards', 'orbit-bookmark-view'].map((key) => { try { return [key, JSON.parse(localStorage.getItem(key) || 'null')] } catch { return [key, null] } }))
  const workspace: WorkspaceBackup = { viewState, version: 2, exportedAt: new Date().toISOString(), boards, categories, kubeGroups, kubeConfigs, kubeCommands, commandLibrary }
  const exportWorkspaceBackup = () => { const event = new window.CustomEvent('orbit:before-export', { cancelable: true }); window.dispatchEvent(event); if (!event.defaultPrevented) setExchange({}); else notify('命令草稿未保存，备份已取消，请先保留草稿') }
  const applyExchange = (imported: WorkspaceBackup, replace: boolean) => {
    try {
      validateBackup(imported)
      if (imported.commandLibrary) { const event = new window.CustomEvent('orbit:before-replace', { cancelable: true }); window.dispatchEvent(event); if (event.defaultPrevented) return }
      if (replace) {
        const previous: WorkspaceBackup = { version: 2, scope: 'before-restore', exportedAt: new Date().toISOString() }
        if (imported.boards) { previous.boards = boards; previous.categories = categories; previous.viewState = viewState }
        if (imported.commandLibrary) previous.commandLibrary = commandLibrary
        if (imported.kubeConfigs) { previous.kubeConfigs = kubeConfigs; previous.kubeGroups = kubeGroups }
        if (imported.kubeCommands) previous.kubeCommands = kubeCommands
        commitStorage({ 'orbit-recovery-backup': previous }, false)
        exportFile('orbit-before-restore.backup.json', JSON.stringify(previous, null, 2), 'application/json')
      }
      const next = replace ? imported : mergeBackup(workspace, imported)
      const values: Record<string, unknown> = {}
      const keys = { boards: 'orbit-boards', categories: 'orbit-board-categories', kubeGroups: 'orbit-kube-groups', kubeConfigs: 'orbit-kube-configs', kubeCommands: 'orbit-kube-commands', commandLibrary: 'orbit-command-library' } as const
      for (const [field, key] of Object.entries(keys)) if (next[field as keyof typeof keys] !== undefined) values[key] = next[field as keyof typeof keys]
      if (replace && imported.viewState) for (const [key, value] of Object.entries(imported.viewState)) if (['orbit-bookmark-collapse', 'orbit-tree-collapse', 'orbit-expanded-boards', 'orbit-bookmark-view'].includes(key) && value !== null) values[key] = value
      commitStorage(values)
      window.dispatchEvent(new window.CustomEvent('orbit:restore'))
      setExchange(null); notify('导入完成，可使用顶部撤销恢复本机记录')
    } catch (error) { notify(error instanceof Error ? error.message : '恢复失败，原库已保留') }
  }


  const handleBookmarkImport = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请拆分后导入；当前库未改变')
      const content = await file.text()
      if (file.name.toLowerCase().endsWith('.json')) setExchange({ imported: validateBackup(JSON.parse(content)) })
      else {
        const imported = parseBookmarksHtml(content)
        if (!imported.length) throw new Error('没有发现可导入的书签文件夹')
        setExchange({ imported: { version: 2, boards: imported } })
      }
    } catch (error) { notify(error instanceof Error ? error.message : '导入文件无效，当前库未改变') }
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

  useEffect(() => {
    const refresh = () => setUndoReady(canUndoWorkspace())
    const failed = (event: Event) => notify((event as CustomEvent<string>).detail)
    window.addEventListener('orbit:history', refresh)
    window.addEventListener('orbit:save-error', failed)
    return () => { window.removeEventListener('orbit:history', refresh); window.removeEventListener('orbit:save-error', failed) }
  }, [])

  return (
    <div className="app-shell" data-theme={theme} data-density={density}>
      <main className="main-area">
        <header className="topbar">
          <div className="brand-mark" aria-label="Orbit Workbench"><div className="brand-orbit"><span /></div><strong>orbit</strong></div>
        <nav className="primary-nav" aria-label="主导航">
          <NavItem icon={<Bookmark size={17} />} label="书签看板" active={section === 'bookmarks'} onClick={() => { setGlobalSearchOpen(false); setQuery(''); setSection('bookmarks') }} />
          <NavItem icon={<Box size={17} />} label="Kubeconfig" active={section === 'kubeconfig'} onClick={() => { setGlobalSearchOpen(false); setQuery(''); setSection('kubeconfig') }} />
          <NavItem icon={<Terminal size={17} />} label="命令管理" active={section === 'commands'} onClick={() => { setGlobalSearchOpen(false); setQuery(''); setCommandsVisited(true); setSection('commands') }} />
        </nav>

          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event) && query.trim()) { event.preventDefault(); if (section !== 'commands') setGlobalSearchOpen(true) } if (event.key === 'Escape') { setGlobalSearchOpen(false); setQuery('') } }} placeholder={section === 'commands' ? '搜索所有命令、分组、备注…' : '搜索所有看板、配置、标签…'} aria-label={section === 'commands' ? '搜索所有命令、分组、备注' : '搜索所有看板、配置、标签'} />
              {query && <button className="icon-button tiny" onClick={() => { setQuery(''); setGlobalSearchOpen(false) }} aria-label="清空搜索"><X size={13} /></button>}
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'} title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="帮助" title="使用帮助"><CircleHelp size={17} /></button>
            <button className="icon-button" disabled={!undoReady} aria-label="撤销库操作" title="撤销最近的移动、删除或导入（不会改写磁盘源文件）" onClick={() => notify(undoWorkspace() ? '已撤销库操作；磁盘源文件不变' : '撤销失败，请检查存储权限')}><Undo2 size={17} /></button>
            <button className="icon-button" aria-label="本机存储" onClick={() => setShowStorage(true)}><HardDrive size={17} /></button>
            <button className={`icon-button ${section === 'settings' ? 'active' : ''}`} aria-label="偏好设置" onClick={() => { setGlobalSearchOpen(false); setSection('settings') }}><Settings2 size={17} /></button>
          </div>
        </header>

        {globalSearchOpen && <GlobalSearchView query={query} boards={boards} configs={kubeConfigs} kubeGroups={kubeGroups} setBoards={setBoards} setConfigs={setKubeConfigs} setKubeGroups={setKubeGroups} onCopy={copyText} notify={notify} onClose={() => { setGlobalSearchOpen(false); setQuery('') }} />}
        <>
        <div className="module-page" hidden={section !== 'bookmarks' || globalSearchOpen}>
          <BookmarksView
            boards={boards}
            categories={categories}
            setCategories={setCategories}
            setBoards={setBoards}
            query={query}
            addBoard={addBoard}
            onImport={() => importRef.current?.click()}
            onExport={(board) => exportBoard(board)}
            onExportSelection={(selection) => exportFile('orbit-selected-bookmarks.html', createBrowserBookmarksHtml(selection), 'text/html;charset=utf-8')}
            onExportAll={exportWorkspace}
            onExportBackup={exportWorkspaceBackup}
            onCopy={copyText}
            notify={notify}
            onClearQuery={() => setQuery('')}
          />
        </div>
        <div className="module-page" hidden={section !== 'kubeconfig' || globalSearchOpen}><KubeconfigView configs={kubeConfigs} setConfigs={setKubeConfigs} groups={kubeGroups} setGroups={setKubeGroups} commands={kubeCommands} setCommands={setKubeCommands} defaultCommandId={defaultCommandId} onDefaultCommandChange={setDefaultCommandId} query={query} onClearQuery={() => setQuery('')} onCopy={copyText} notify={notify} /></div>
        {commandsVisited && <div className="module-page" hidden={section !== 'commands' || globalSearchOpen}><Suspense fallback={<div className="content-wrap" role="status">正在打开命令库…</div>}><CommandLibraryView library={commandLibrary} saveLibrary={saveCommandLibrary} onCopy={copyText} notify={notify} query={query} clearQuery={() => setQuery('')} onExport={(snippets) => exportFile('orbit-commands.backup.json', JSON.stringify({ version: 2, scope: 'commands', exportedAt: new Date().toISOString(), commandLibrary: { version: 1, snippets, groups: commandLibrary.groups.filter((group) => snippets.some((item) => item.groupId === group.id)) } }, null, 2), 'application/json')} /></Suspense></div>}
        {section === 'settings' && <SettingsView boards={boards} configs={kubeConfigs} theme={theme} onThemeChange={setTheme} density={density} onDensityChange={setDensity} />}
        </>
      </main>

      <input ref={importRef} type="file" accept=".html,.htm,.json" hidden onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void handleBookmarkImport(file)
        event.target.value = ''
      }} />
      {showStorage && <StoragePanel onClose={() => setShowStorage(false)} onCopy={copyText} onBackup={() => { setShowStorage(false); setExchange({}) }} onRestore={() => { setShowStorage(false); importRef.current?.click() }} onRecovery={() => { try { const imported = validateBackup(JSON.parse(localStorage.getItem('orbit-recovery-backup') || 'null')); setShowStorage(false); setExchange({ imported }) } catch { notify('没有可用的替换前备份，当前库未改变') } }} />}
      {exchange && <ExchangePanel current={workspace} imported={exchange.imported} onClose={() => setExchange(null)} onDownload={exportFile} onApply={applyExchange} />}
      {showHelp && <Modal title="使用帮助" onClose={() => setShowHelp(false)}><div className="help-content"><p>Orbit Workbench 的数据默认只保存在本机浏览器中，并会自动保存。</p><div className="help-shortcuts"><div><kbd>⌘ / Ctrl</kbd><strong>+ K</strong><span>聚焦顶部搜索框</span></div><div><kbd>Esc</kbd><span>关闭当前弹窗</span></div><div><kbd>拖拽</kbd><span>把书签、kubeconfig 或命令记录拖到左侧高亮分组</span></div></div><p className="muted-copy">书签链接会在默认浏览器中打开；kubeconfig 命令只生成文本，不会自动执行。</p></div></Modal>}
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
    const searchable = [board.name, board.description, board.tags.join(' '), group ? bookmarkGroupPath(board.groups, group.id) : '', link.title, link.url, link.description ?? '', link.tags.join(' ')].join(' ').toLocaleLowerCase()
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
        setSelectedBookmarkIds(bookmarkResults.map(bookmarkSelectionId))
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
      const newBoard = bookmarkSearchBoard(selected, name)
      const links = newBoard.links
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
    {visibleResultCount === 0 ? <div className="search-result-empty"><Search size={28} /><h2>{totalResults === 0 ? '没有找到匹配结果' : '当前分类没有匹配结果'}</h2><p>试试名称、链接、路径、Context 或标签。</p></div> : <div className="search-result-grid">{visibleBookmarkResults.map((item) => { const { board, group, link } = item; const selectionId = bookmarkSelectionId(item); return <article className="search-result-card" key={`link:${selectionId}`}><label className="search-result-check"><input type="checkbox" checked={selectedBookmarkIds.includes(selectionId)} onChange={() => toggleBookmark(selectionId)} aria-label={`选择 ${link.title}`} /><span /></label><button className="search-result-card-main" onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}><div className="search-result-icon bookmark">{link.title.slice(0, 1).toUpperCase()}</div><div className="search-result-card-content"><strong>{link.title}</strong><span>{link.url}</span><small>{link.description || '无备注'}</small><div className="search-result-meta"><em>{board.name}</em>{group && <em>{bookmarkGroupPath(board.groups, group.id)}</em>}{link.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}{link.tags.length > 3 && <em>+{link.tags.length - 3}</em>}</div></div><ArrowUpRight size={16} /></button><div className="search-result-card-tools"><button className="icon-button tiny" onClick={() => onCopy(link.url, '链接已复制')} aria-label="复制链接" title="复制链接"><Copy size={14} /></button></div></article> })}{visibleKubeResults.map(({ config, group }) => <article className="search-result-card search-result-card--kube" key={`config:${config.id}`}><label className="search-result-check"><input type="checkbox" checked={selectedConfigIds.includes(config.id)} onChange={() => toggleConfig(config.id)} aria-label={`选择 ${config.name}`} /><span /></label><div className="search-result-card-main"><div className="search-result-icon kube"><KeyRound size={17} /></div><div className="search-result-card-content"><strong>{config.name}</strong><span title={config.path}>{config.path}</span><small>Context：{config.context || '未设置'} · 环境变量：{displayEnvName(config)}</small><div className="search-result-meta">{group && <em>{group.name}</em>}{config.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}{config.tags.length > 3 && <em>+{config.tags.length - 3}</em>}</div></div></div></article>)}</div>}
    {createMode && <Modal title={createMode.endsWith('board') ? (createMode === 'copy-board' ? '复制新建看板' : '移动新建看板') : (createMode === 'copy-group' ? '复制新建 kubeconfig 分组' : '移动新建 kubeconfig 分组')} onClose={() => setCreateMode(null)}><div className="form-stack"><label>{createMode.endsWith('board') ? '看板名称' : '分组名称'}<input autoFocus value={targetName} onChange={(event) => setTargetName(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) confirmCreate() }} /></label><p className="form-hint">{createMode.startsWith('copy') ? '复制会保留原项目，并建立一份新的结果集合。' : '移动会从原分组中移除选中项目。'}</p><div className="modal-actions"><button className="ghost-button" onClick={() => setCreateMode(null)}>取消</button><button className="primary-button" onClick={confirmCreate}><Save size={14} />确认创建</button></div></div></Modal>}
  </div>
}

function NavItem({ icon, label, active, onClick, soon }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; soon?: boolean }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{soon && <em>Soon</em>}</button>
}

function BookmarksView({ boards, categories, setCategories, setBoards, query, addBoard, onImport, onExport, onExportSelection, onExportAll, onExportBackup, onCopy, notify, onClearQuery }: {
  boards: BookmarkBoard[]
  categories: BoardCategory[]
  setCategories: React.Dispatch<React.SetStateAction<BoardCategory[]>>
  setBoards: React.Dispatch<React.SetStateAction<BookmarkBoard[]>>
  query: string
  addBoard: (name?: string) => string
  onImport: () => void
  onExport: (board: BookmarkBoard) => void
  onExportSelection: (boards: BookmarkBoard[]) => void
  onExportAll: () => void
  onExportBackup: () => void
  onCopy: (value: string, label?: string) => void
  notify: (message: string) => void
  onClearQuery: () => void
}) {
  const [activeBoardId, setActiveBoardId] = useState(boards[0]?.id ?? '')
  const directory = useDirectorySize('bookmarks', 280)
  const menu = useContextMenu()
  const [organizing, setOrganizing] = useState(false)
  const [organizingGroups, setOrganizingGroups] = useState(false)
  const [groupColorDraft, setGroupColorDraft] = useState('#6f8cff')
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('')
  const [boardDescriptionDraft, setBoardDescriptionDraft] = useState('')
  const [boardCategoryDraft, setBoardCategoryDraft] = useState('')
  const [promoting, setPromoting] = useState<{ board: BookmarkBoard; groupId: string; name: string; categoryId: string; copy: boolean } | null>(null)
  const [activeGroupId, setActiveGroupId] = useState('all')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const drag = useWorkspaceDrag()
  const [hoverExpandedBoard, setHoverExpandedBoard] = useState<string | null>(null)
  const [expandedBoards, setExpandedBoards] = usePersistentState<Record<string, boolean>>('orbit-expanded-boards', Object.fromEntries(boards.map((board) => [board.id, true])))
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [showBoardAdd, setShowBoardAdd] = useState(false)
  const [newLink, setNewLink] = useState({ title: '', url: '', groupId: '' })
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#6f8cff')
  const [newGroupBoardId, setNewGroupBoardId] = useState('')
  const [newGroupParentId, setNewGroupParentId] = useState('')
  const [groupParentDraft, setGroupParentDraft] = useState('')
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardCategory, setNewBoardCategory] = useState('')
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

  useEffect(() => { const current = boards.find((item) => item.id === activeBoardId); if (current && activeGroupId !== 'all' && !current.groups.some((group) => group.id === activeGroupId)) setActiveGroupId('all') }, [boards, activeBoardId, activeGroupId])

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
  const groupRows = useMemo(() => bookmarkGroupRows(board?.groups ?? []), [board?.groups])
  const activeGroupIds = useMemo(() => bookmarkDescendantIds(board?.groups ?? [], activeGroupId), [board?.groups, activeGroupId])
  const activeGroupRow = groupRows.find((row) => row.group.id === activeGroupId)
  const draggedSubtree = useMemo(() => drag.item?.kind === 'group' ? bookmarkDescendantIds(boards.find((item) => item.id === drag.item?.boardId)?.groups ?? [], drag.item.id) : new Set<string>(), [boards, drag.item])
  const canDrop = (target: WorkspaceDropTarget) => {
    const source = drag.item
    if (!source || isSameDragItem(source, target)) return false
    if (source.kind === 'category') return !!target.id && target.kind === 'category' && target.position !== 'inside'
    if (source.kind === 'board') return target.kind === 'category' || target.kind === 'board' && target.position !== 'inside'
    if (source.kind === 'group') return (target.kind === 'board' && target.position === 'inside') || (target.kind === 'group' && !(source.boardId === target.boardId && draggedSubtree.has(target.id)))
    if (source.kind === 'link' && target.kind === 'link' && source.boardId === target.boardId && selectedLinkIds.includes(source.id) && selectedLinkIds.includes(target.id)) return false
    return source.kind === 'link' && (target.kind === 'group' || target.kind === 'link' || target.kind === 'board')
  }
  const targetBoard = boards.find((item) => item.id === drag.target?.boardId || (drag.target?.kind === 'board' && item.id === drag.target.id))
  const targetName = drag.target?.kind === 'board' ? `${targetBoard?.name}${drag.item?.kind === 'link' ? ' / 未分组' : ''}` : drag.target?.kind === 'group' ? `${targetBoard?.name} / ${bookmarkGroupPath(targetBoard?.groups ?? [], drag.target.id)}` : targetBoard?.links.find((link) => link.id === drag.target?.id)?.title
  const dropHint = drag.target ? `${drag.target.position === 'inside' ? '移入' : drag.target.position === 'before' ? '插入到前面' : '插入到后面'}：${targetName}` : '边缘显示插入线；分组中央高亮表示移入'
  useEffect(() => {
    if (!drag.item || drag.target?.kind !== 'board' || drag.target.position !== 'inside') return
    const id = drag.target.id
    const timer = window.setTimeout(() => setHoverExpandedBoard(id), 500)
    return () => window.clearTimeout(timer)
  }, [drag.item, drag.target])
  useEffect(() => { if (!drag.item) setHoverExpandedBoard(null) }, [drag.item])
  const allTags = useMemo(() => Array.from(new Set(board?.links.flatMap((link) => link.tags) ?? [])).sort((a, b) => a.localeCompare(b, 'zh-CN')), [board])
  const visibleLinks = useMemo(() => {
    if (!board) return []
    const normalized = query.toLowerCase().trim()
    return board.links.filter((link) => {
      const matchesGroup = activeGroupId === 'all' || activeGroupIds.has(link.groupId)
      const matchesTag = !tagFilters.length || tagFilters.every((tag) => link.tags.includes(tag))
      const matchesSearch = !normalized || `${link.title} ${link.url} ${link.description ?? ''} ${link.tags.join(' ')}`.toLowerCase().includes(normalized)
      return matchesGroup && matchesTag && matchesSearch
    })
  }, [board, activeGroupId, activeGroupIds, tagFilters, query])

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
    const groupId = newLink.groupId || board.groups[0]?.id || uid('group')
    updateBoard((current) => ({ ...current, groups: current.groups.length ? current.groups : [{ id: groupId, name: '未分组', color: '#6f8cff' }], updatedAt: new Date().toISOString(), links: [{ id: uid('link'), title: newLink.title.trim(), url: newLink.url.trim(), groupId, tags: ['新建'], description: '刚添加的链接', addedAt: new Date().toISOString() }, ...current.links] }))
    setNewLink({ title: '', url: '', groupId: '' })
    setShowQuickAdd(false)
    notify('链接已添加')
  }

  const openGroupAdd = (target = board, parentId = activeGroupId === 'all' ? '' : activeGroupId) => {
    if (!target) return
    setNewGroupName('')
    setNewGroupColor('#6f8cff')
    setNewGroupBoardId(target.id)
    setNewGroupParentId(parentId)
    setShowGroupAdd(true)
  }

  const addGroup = () => {
    const target = boards.find((item) => item.id === newGroupBoardId)
    if (!target || !newGroupName.trim()) { notify('请输入分组名称'); return }
    if (newGroupParentId && !target.groups.some((group) => group.id === newGroupParentId)) { notify('上级分组不存在，请重新选择'); return }
    const groupId = uid('group')
    setBoards((current) => current.map((item) => item.id === target.id ? { ...item, updatedAt: new Date().toISOString(), groups: [...item.groups, { id: groupId, name: newGroupName.trim(), parentId: newGroupParentId || undefined, color: newGroupColor }] } : item))
    setActiveBoardId(target.id)
    setActiveGroupId(groupId)
    setExpandedBoards((current) => ({ ...current, [target.id]: true }))
    setNewGroupName('')
    setShowGroupAdd(false)
    notify('分组已添加')
  }

  const openBoardRename = (target = board) => {
    if (!target) return
    setEditingBoardId(target.id)
    setBoardNameDraft(target.name)
    setBoardDescriptionDraft(target.description)
    setBoardCategoryDraft(target.categoryId ?? '')
  }

  const renameBoard = () => {
    const name = boardNameDraft.trim()
    if (!editingBoardId || !name) {
      notify('请输入看板名称')
      return
    }
    setBoards((current) => current.map((item) => item.id === editingBoardId ? { ...item, name, description: boardDescriptionDraft, categoryId: boardCategoryDraft || undefined, updatedAt: new Date().toISOString() } : item))
    setEditingBoardId(null)
    notify('看板名称已更新')
  }

  const openBoardAdd = () => {
    setNewBoardName(`新看板 ${boards.length + 1}`)
    setNewBoardCategory(board?.categoryId ?? '')
    setShowBoardAdd(true)
  }

  const createBoard = () => {
    const name = newBoardName.trim()
    if (!name) {
      notify('请输入看板名称')
      return
    }
    const id = addBoard(name)
    if (newBoardCategory) setBoards((current) => current.map((item) => item.id === id ? { ...item, categoryId: newBoardCategory } : item))
    setActiveBoardId(id)
    setActiveGroupId('all')
    setTagFilters([])
    setExpandedBoards((current) => ({ ...current, [id]: true }))
    setNewBoardName('')
    setShowBoardAdd(false)
  }

  const applyDrop = (event: React.DragEvent<HTMLElement>, target: WorkspaceDropTarget) => {
    if (!drag.item) return
    event.preventDefault()
    event.stopPropagation()
    const source = drag.item
    if (!canDrop(target)) { drag.finish(); return }
    try {
      if (source.kind === 'category') { setCategories(reorderItems(categories, source.id, target.id, target.position === 'before' ? 'before' : 'after')); drag.finish(); return }
      if (source.kind === 'board' && target.kind === 'category') { setBoards((current) => current.map((item) => item.id === source.id ? { ...item, categoryId: target.id || undefined } : item)); drag.finish(); return }
      const targetBoardId = target.kind === 'board' ? target.id : target.boardId!
      let next = boards
      let selectedGroupId = activeGroupId
      if (source.kind === 'board' && target.position !== 'inside') next = reorderItems(boards, source.id, target.id, target.position)
      else if (source.kind === 'group') {
        next = placeBookmarkGroup(boards, source.boardId!, source.id, targetBoardId, target.kind === 'group' ? target.id : undefined, target.position)
        selectedGroupId = source.id
      } else if (source.kind === 'link') {
        if (target.kind === 'link' && target.position !== 'inside') {
          next = placeBookmarkLink(boards, source.boardId!, selectedLinkIds.includes(source.id) ? selectedLinkIds : source.id, targetBoardId, target.id, target.position)
          selectedGroupId = targetBoardId === activeBoardId ? activeGroupId : 'all'
        } else {
          // A board header means its root, never an arbitrary first folder.
          let destination = target.kind === 'group' ? target.id : ''
          let prepared = boards
          if (target.kind === 'board') {
            const ungrouped = boards.find((item) => item.id === targetBoardId)?.groups.find((group) => !group.parentId && group.name === '未分组')
            destination = ungrouped?.id || uid('group')
            if (!ungrouped) prepared = boards.map((item) => item.id === targetBoardId ? { ...item, groups: [...item.groups, { id: destination, name: '未分组', color: '#6f8cff' }] } : item)
          }
          const moved = moveBookmarkLinks(prepared, source.boardId!, selectedLinkIds.includes(source.id) ? selectedLinkIds : [source.id], targetBoardId, destination)
          next = moved.boards
          selectedGroupId = moved.groupId
        }
      }
      setBoards(next)
      if (source.kind !== 'board') {
        setActiveBoardId(targetBoardId)
        setActiveGroupId(selectedGroupId)
        setTagFilters([])
        setExpandedBoards((current) => ({ ...current, [targetBoardId]: true }))
      }
      notify(target.position === 'inside' ? '已移动，子分组和条目均已保留' : '顺序与分组已更新')
    } catch (error) { notify(error instanceof Error ? error.message : '无法移动') }
    drag.finish()
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
    setGroupColorDraft(group.color)
    setGroupDescriptionDraft(group.description ?? '')
    setGroupParentDraft(group.parentId || '')
  }

  const renameGroup = () => {
    const name = groupNameDraft.trim()
    if (!editingGroupBoardId || !editingGroupId || !name) {
      notify('请输入分组名称')
      return
    }
    const target = boards.find((item) => item.id === editingGroupBoardId)
    if (!target) return
    try { reparentBookmarkGroup(target, editingGroupId, groupParentDraft) }
    catch (error) { notify(error instanceof Error ? error.message : '无法移动分组'); return }
    setBoards((current) => current.map((item) => {
      if (item.id !== editingGroupBoardId) return item
      const moved = reparentBookmarkGroup(item, editingGroupId, groupParentDraft)
      return { ...moved, groups: moved.groups.map((group) => group.id === editingGroupId ? { ...group, name, color: groupColorDraft, description: groupDescriptionDraft } : group) }
    }))
    setEditingGroupId(null)
    setEditingGroupBoardId(null)
    notify('分组已更新，子分组随之保留')
  }

  const requestDeleteGroup = (group: BookmarkGroup, boardId = board?.id) => {
    if (!boards.some((item) => item.id === boardId)) return
    setDeletingGroupId(group.id)
    setDeletingGroupBoardId(boardId ?? null)
  }

  const deleteGroup = () => {
    const target = boards.find((item) => item.id === deletingGroupBoardId)
    if (!target || !deletingGroupId) return
    setBoards((current) => current.map((item) => item.id === target.id ? deleteBookmarkGroup(item, deletingGroupId) : item))
    if (activeBoardId === target.id && activeGroupId === deletingGroupId) setActiveGroupId('all')
    setDeletingGroupId(null)
    setDeletingGroupBoardId(null)
    setEditingGroupId(null)
    setEditingGroupBoardId(null)
    notify('分组已删除，子分组与链接已保留')
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
    if (!board || !selectedLinkIds.length || !batchTargetBoard) return
    const moved = moveBookmarkLinks(boards, board.id, selectedLinkIds, batchTargetBoard.id, batchTargetGroupId)
    if (!moved.count) return
    setBoards(moved.boards)
    setSelectedLinkIds([])
    setSelectionMode(false)
    setShowBatchMove(false)
    setActiveBoardId(batchTargetBoard.id)
    setActiveGroupId(moved.groupId)
    notify(`已移动 ${moved.count} 条链接`)
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

  const promote = (target: BookmarkBoard, groupId: string) => setPromoting({ board: target, groupId, name: target.groups.find((item) => item.id === groupId)?.name ?? '新看板', categoryId: target.categoryId ?? '', copy: false })
  const groupMenu = (event: React.MouseEvent, target: BookmarkBoard, group: BookmarkGroup) => menu.open(event, [
    { label: '编辑名称、颜色与备注', run: () => openGroupRename(group, target.id) },
    { label: '新建子分组', run: () => openGroupAdd(target, group.id) },
    { label: '独立为新看板…', run: () => promote(target, group.id) },
    { label: '导出此分组', run: () => { const selected = selectBookmarks([target], [group.id])[0]; if (selected) onExport(selected) } },
    { label: '移到同级顶部', run: () => { const first = target.groups.find((item) => item.parentId === group.parentId); if (first && first.id !== group.id) setBoards(placeBookmarkGroup(boards, target.id, group.id, target.id, first.id, 'before')) } },
    { label: '移到同级末尾', run: () => { const siblings = target.groups.filter((item) => item.parentId === group.parentId); const last = siblings[siblings.length - 1]; if (last && last.id !== group.id) setBoards(placeBookmarkGroup(boards, target.id, group.id, target.id, last.id, 'after')) } },
    { label: '删除分组（保留内容）', run: () => requestDeleteGroup(group, target.id), danger: true },
  ])
  const renderBoard = (item: BookmarkBoard) => <Fragment key={item.id}><DropGap target={{ kind: 'board', id: item.id, position: 'before' }} current={drag.target} enabled={drag.item?.kind === 'board' && canDrop({ kind: 'board', id: item.id, position: 'before' })} onOver={drag.over} onLeave={drag.leave} onDrop={applyDrop} /><div className="tree-item-wrap">
            <div className={`tree-item drag-sort-row ${item.id === board.id ? 'selected' : ''} ${dropClassName(drag.target, { kind: 'board', id: item.id })} ${isSameDragItem(drag.item, { kind: 'board', id: item.id }) ? 'drag-source' : ''}`} data-board-id={item.id} onContextMenu={(event) => menu.open(event, [{ label: '编辑看板', run: () => openBoardRename(item) }, { label: '新建分组', run: () => openGroupAdd(item, '') }, { label: '创建副本', run: () => setBoards((current) => [...current, ...copyBoards([item]).map((copy) => ({ ...copy, name: copy.name + ' · 副本' }))]) }, { label: '分类与批量管理…', run: () => setOrganizing(true) }, { label: '导出看板', run: () => onExport(item) }, { label: '删除看板', run: () => setDeletingBoardId(item.id), disabled: boards.length <= 1, danger: true }])} draggable onDragStart={(event) => drag.start(event, { kind: 'board', id: item.id }, `看板 · ${item.name}`)} onDragEnd={drag.finish}
              onDragOver={(event) => { const target: WorkspaceDropTarget = drag.item?.kind === 'board' ? rowDropTarget(event, { kind: 'board', id: item.id }) : { kind: 'board', id: item.id, position: 'inside' }; drag.over(event, canDrop(target) ? target : null) }} onDragLeave={drag.leave}
              onDrop={(event) => applyDrop(event, drag.item?.kind === 'board' ? rowDropTarget(event, { kind: 'board', id: item.id }) : { kind: 'board', id: item.id, position: 'inside' })} onClick={() => { setActiveBoardId(item.id); setActiveGroupId('all'); setTagFilters([]) }}>
              <button className="disclosure" onClick={(event) => { event.stopPropagation(); setExpandedBoards((current) => ({ ...current, [item.id]: !current[item.id] })) }}>{(expandedBoards[item.id] || hoverExpandedBoard === item.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <FolderOpen size={16} className="tree-folder" /> <span onDoubleClick={(event) => { event.stopPropagation(); openBoardRename(item) }}>{item.name}</span><b>{item.links.length}</b><span className="tree-item-actions"><button className="icon-button tiny" onClick={(event) => { event.stopPropagation(); openBoardRename(item) }} aria-label={`重命名看板 ${item.name}`} title="重命名看板"><Pencil size={12} /></button><button className="icon-button tiny danger-hover" onClick={(event) => { event.stopPropagation(); if (boards.length <= 1) notify('至少保留一个看板'); else setDeletingBoardId(item.id) }} aria-label={`删除看板 ${item.name}`} title="删除看板"><Trash2 size={12} /></button></span><button className="sort-drag-handle" draggable data-drag-handle aria-label={`拖动看板 ${item.name}`} title="拖动调整看板顺序"><GripVertical size={14} /></button>
            </div>
            {(expandedBoards[item.id] || hoverExpandedBoard === item.id) && <BookmarkGroupTree board={item} activeGroupId={item.id === board.id ? activeGroupId : ''} dragItem={drag.item} dropTarget={drag.target} canDrop={canDrop} onTarget={drag.over} onLeave={drag.leave} onDragStart={(event, group) => drag.start(event, { kind: 'group', boardId: item.id, id: group.id }, `分组 · ${group.name}`)} onDragEnd={drag.finish} onSelect={(groupId) => { setActiveBoardId(item.id); setActiveGroupId(groupId); setTagFilters([]) }} onEdit={(group) => openGroupRename(group, item.id)} onContext={(event, group) => groupMenu(event, item, group)} onDrop={applyDrop} />}
          </div><DropGap target={{ kind: 'board', id: item.id, position: 'after' }} current={drag.target} enabled={drag.item?.kind === 'board' && canDrop({ kind: 'board', id: item.id, position: 'after' })} onOver={drag.over} onLeave={drag.leave} onDrop={applyDrop} /></Fragment>

  if (!board) return <div className="empty-state"><Archive size={30} /><h2>还没有看板</h2><p>导入浏览器书签或创建一个新的工作看板。</p><button className="primary-button" onClick={() => addBoard()}><Plus size={16} />创建看板</button></div>

  const renderLink = (link: LinkItem) => <Fragment key={link.id}><DropGap target={{ kind: 'link', boardId: board.id, id: link.id, position: 'before' }} current={drag.target} enabled={!!drag.item && canDrop({ kind: 'link', boardId: board.id, id: link.id, position: 'before' })} onOver={drag.over} onLeave={drag.leave} onDrop={applyDrop} /><div key={link.id} className={`link-select-row drag-sort-row ${selectedLinkIds.includes(link.id) ? 'selected' : ''} ${dropClassName(drag.target, { kind: 'link', boardId: board.id, id: link.id })}`} data-link-id={link.id} onContextMenu={(event) => menu.open(event, [{ label: `管理${selectedLinkIds.includes(link.id) ? `选中的 ${selectedLinkIds.length} 条` : '此条'}链接标签`, run: () => setTagEditorLinkIds(selectedLinkIds.includes(link.id) ? selectedLinkIds : [link.id]) }, { label: '移动所选链接…', run: () => { setSelectedLinkIds(selectedLinkIds.includes(link.id) ? selectedLinkIds : [link.id]); setBatchTargetBoardId(board.id); setBatchTargetGroupId(link.groupId); setShowBatchMove(true) } }, { label: '导出所选链接', run: () => { const result = selectBookmarks([board], selectedLinkIds.includes(link.id) ? selectedLinkIds : [link.id])[0]; if (result) onExport(result) } }])} onDragOver={(event) => { const target = rowDropTarget(event, { kind: 'link', boardId: board.id, id: link.id }); drag.over(event, canDrop(target) ? target : null) }} onDragLeave={drag.leave} onDrop={(event) => applyDrop(event, rowDropTarget(event, { kind: 'link', boardId: board.id, id: link.id }))}>{selectionMode && <input type="checkbox" className="link-select-checkbox" checked={selectedLinkIds.includes(link.id)} onChange={() => toggleLinkSelection(link.id)} aria-label={`选择 ${link.title}`} /> }<LinkRow link={link} groupOptions={groupRows} group={board.groups.find((group) => group.id === link.groupId)} isDragging={isSameDragItem(drag.item, { kind: 'link', id: link.id, boardId: board.id })} onUpdate={(patch) => updateBoard((current) => ({ ...current, updatedAt: new Date().toISOString(), links: current.links.map((item) => item.id === link.id ? { ...item, ...patch } : item) }))} onCopy={onCopy} onDelete={() => { updateBoard((current) => ({ ...current, links: current.links.filter((item) => item.id !== link.id) })); setSelectedLinkIds((current) => current.filter((id) => id !== link.id)); notify('链接已删除') }} onEditTags={() => setTagEditorLinkIds([link.id])} onDragStart={(event) => drag.start(event, { kind: 'link', boardId: board.id, id: link.id }, selectedLinkIds.includes(link.id) && selectedLinkIds.length > 1 ? `选中的 ${selectedLinkIds.length} 条链接` : `链接 · ${link.title}`)} onDragEnd={drag.finish} /></div><DropGap target={{ kind: 'link', boardId: board.id, id: link.id, position: 'after' }} current={drag.target} enabled={!!drag.item && canDrop({ kind: 'link', boardId: board.id, id: link.id, position: 'after' })} onOver={drag.over} onLeave={drag.leave} onDrop={applyDrop} /></Fragment>
  return <div className="content-wrap" onClickCapture={drag.suppressClick}>
    <div className="page-heading">
      <div><div className="eyebrow"><span className="eyebrow-dot" />COLLECTIONS</div><h1>书签看板</h1><p>把浏览器里散落的链接，整理成可以快速行动的工作台。</p></div>
      <div className="heading-actions"><button className="ghost-button" onClick={onImport}><FileUp size={16} />导入书签</button><button className="ghost-button" onClick={() => { setNewLink({ title: '', url: '', groupId: activeGroupId === 'all' ? board.groups[0]?.id ?? '' : activeGroupId }); setShowQuickAdd(true) }}><Link2 size={15} />添加链接</button><button className="ghost-button" onClick={() => board && onExport(board)} title="导出为浏览器可导入的 HTML"><FileDown size={16} />导出当前</button><button className="ghost-button" onClick={onExportAll} title="把所有看板导出为浏览器可导入的 HTML"><Archive size={15} />导出全部</button><button className="ghost-button" onClick={onExportBackup} title="导出 Orbit Workbench JSON 备份"><CloudDownload size={15} />备份 JSON</button><button className="ghost-button" onClick={() => setOrganizing(true)}>整理看板</button><button className="primary-button" onClick={openBoardAdd}><Plus size={16} />新建看板</button></div>
    </div>

    <div className={`workspace-grid ${directory.className}`} style={directory.style}>
      <aside className={`collection-sidebar ${drag.item ? 'is-dragging' : ''}`}>
        {directory.control}<div className="side-section-header"><span>我的看板 <b>{boards.length}</b></span><button className="icon-button tiny" onClick={openBoardAdd} aria-label="新建看板"><Plus size={15} /></button></div>
        <div className="board-tree">
          {[...categories, { id: '', name: '未分类', color: '#8290a6', collapsed: false }].map((category) => <section key={category.id} className="board-category"><div className={`category-heading drag-sort-row ${dropClassName(drag.target, { kind: 'category', id: category.id })}`} data-category-id={category.id} onDragOver={(event) => { const target: WorkspaceDropTarget = drag.item?.kind === 'category' ? rowDropTarget(event, { kind: 'category', id: category.id }) : { kind: 'category', id: category.id, position: 'inside' }; drag.over(event, canDrop(target) ? target : null) }} onDragLeave={drag.leave} onDrop={(event) => applyDrop(event, drag.item?.kind === 'category' ? rowDropTarget(event, { kind: 'category', id: category.id }) : { kind: 'category', id: category.id, position: 'inside' })}><button onClick={() => category.id && setCategories((current) => current.map((item) => item.id === category.id ? { ...item, collapsed: !item.collapsed } : item))} aria-expanded={!category.collapsed} style={{ color: category.color }}><ChevronDown size={13} />{category.name}<small>{boards.filter((item) => (item.categoryId ?? '') === category.id).length}</small></button>{category.id && <button className="sort-drag-handle" draggable data-drag-handle aria-label={`拖动分类 ${category.name}`} onDragStart={(event) => drag.start(event, { kind: 'category', id: category.id }, category.name)} onDragEnd={drag.finish}><GripVertical size={13} /></button>}</div>{!category.collapsed && boards.filter((item) => (item.categoryId ?? '') === category.id).map(renderBoard)}</section>)}
        </div>
        <button className="add-inline" onClick={openBoardAdd}><Plus size={14} />添加看板</button>
        <div className="side-helper drag-status" role="status" aria-live="polite"><GripVertical size={15} /><div><strong>{drag.item ? '松开放置' : '拖拽整理'}</strong><p>{drag.item ? dropHint : '看板上下排序；分组边缘排序、中央嵌套；链接可排序或归类。'}</p></div></div>
      </aside>

      <section className="board-stage">{menu.node}
        <div className="board-header">
          <div className="board-title-row"><div className="board-icon"><LayoutGrid size={18} /></div><div><div className="title-with-menu"><h2 onDoubleClick={() => openBoardRename()}>{board.name}</h2><button className="icon-button tiny" onClick={() => openBoardRename()} aria-label="重命名看板" title="重命名看板"><Pencil size={14} /></button><button className="icon-button tiny danger-hover" onClick={requestDeleteBoard} aria-label="删除看板" title="删除看板"><Trash2 size={14} /></button></div><p>{board.description}</p></div></div>
          <div className="board-meta"><span><Link2 size={14} />{board.links.length} 个链接</span><span><CloudDownload size={14} />更新于刚刚</span></div>
          <div className="tag-row">{board.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </div>
        <div className="stage-toolbar"><div className="folder-toolbar"><label><Folder size={15} /><select aria-label="书签分组筛选" value={activeGroupId} onChange={(event) => setActiveGroupId(event.target.value)}><option value="all">全部链接</option>{groupRows.map(({ group, path }) => <option value={group.id} key={group.id}>{path}</option>)}</select></label><span>{visibleLinks.length} 条链接</span></div><button className="inline-control" onClick={() => setOrganizingGroups(true)}>管理分组</button><button className="toolbar-button" onClick={() => openGroupAdd()}><Plus size={15} />分组</button></div>
        <nav className="folder-breadcrumb" aria-label="当前分组路径"><button aria-current={!activeGroupRow ? 'location' : undefined} onClick={() => setActiveGroupId('all')}>全部链接</button>{activeGroupRow && [...activeGroupRow.ancestors, activeGroupRow.group.id].map((id) => <span key={id}><ChevronRight size={11} /><button aria-current={id === activeGroupId ? 'location' : undefined} onClick={() => setActiveGroupId(id)}>{board.groups.find((group) => group.id === id)?.name}</button></span>)}<small>{activeGroupRow ? '包含所有子分组的链接' : `${board.groups.length} 个分组，支持多层目录`}</small></nav>
        <div className="tag-filter-row"><div className="tag-filter-label"><ListFilter size={14} />标签筛选</div><details className="tag-filter-dropdown"><summary className="tag-filter-trigger"><span>{tagFilters.length ? `已选 ${tagFilters.length} 个标签` : '全部标签'}</span><ChevronDown size={13} /></summary><div className="tag-filter-menu" role="group" aria-label="标签筛选"><label className="tag-filter-option"><input type="checkbox" checked={!tagFilters.length} onChange={() => setTagFilters([])} />全部标签</label>{allTags.map((tag) => <label className="tag-filter-option" key={tag}><input type="checkbox" checked={tagFilters.includes(tag)} onChange={() => setTagFilters((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} /><span className="tag-filter-option-dot" />{tag}</label>)}{tagFilters.length > 0 && <><div className="tag-filter-hint">多选标签按全部匹配</div><button className="tag-filter-clear" onClick={() => setTagFilters([])}><X size={12} />清除标签筛选</button></>}</div></details>{tagFilters.length > 0 && <div className="active-tag-summary" aria-label="已选择的标签筛选">{tagFilters.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}{tagFilters.length > 2 && <b>+{tagFilters.length - 2}</b>}</div>}{hasActiveFilters && <button className="clear-filter-button" onClick={clearFilters}><X size={12} />清除筛选</button>}<div className={`selection-toolbar ${selectionMode ? 'is-active' : ''}`}><button className={`toolbar-button ${selectionMode ? 'active' : ''}`} onClick={() => { setSelectionMode((current) => !current); if (selectionMode) setSelectedLinkIds([]) }}><Check size={14} />{selectionMode ? '退出选择' : '批量管理'}</button>{selectionMode && <div className="selection-actions"><button className="selection-toggle" onClick={toggleSelectVisible}>{visibleLinks.length && visibleLinks.every((link) => selectedLinkIds.includes(link.id)) ? '取消全选' : '选择当前'}<span>{selectedLinkIds.length ? `已选 ${selectedLinkIds.length}` : ''}</span></button><button className="toolbar-button" disabled={!selectedLinkIds.length} onClick={openBatchMove}><Folder size={14} />批量移动</button><button className="toolbar-button" disabled={!selectedLinkIds.length} onClick={() => setTagEditorLinkIds(selectedLinkIds)}><Bookmark size={14} />批量标签</button><button className="toolbar-button danger-action" disabled={!selectedLinkIds.length} onClick={batchDelete}><Trash2 size={14} />批量删除</button></div>}</div></div>

        {visibleLinks.length || !hasActiveFilters ? <BookmarkPanels board={board} links={visibleLinks} groups={board.groups.filter((group) => activeGroupId === 'all' || activeGroupIds.has(group.id))} search={query || (tagFilters.length ? 'tags' : '')} renderLink={renderLink} onEdit={(group) => openGroupRename(group)} onContext={(event, group) => groupMenu(event, board, group)} /> : <div className="empty-board"><Search size={24} /><h3>没有匹配的链接</h3><p>试试搜索其他关键词，或切换标签筛选。</p><button className="ghost-button" onClick={clearFilters}>清除筛选</button></div>}

        {drag.item && <p className="folder-drop-path">{dropHint}</p>}
      </section>

      <aside className="board-inspector">
        <div className="inspector-header"><span>快捷操作</span><Zap size={15} /></div>
        <button className="quick-action" onClick={() => { setNewLink({ title: '', url: '', groupId: activeGroupId === 'all' ? board.groups[0]?.id ?? '' : activeGroupId }); setShowQuickAdd(true) }}><div className="quick-icon blue"><Plus size={17} /></div><div><strong>添加链接</strong><span>保存一个新网址</span></div><ChevronRight size={15} /></button>
        <button className="quick-action" onClick={() => onExport(board)}><div className="quick-icon green"><FileDown size={17} /></div><div><strong>导出看板</strong><span>保存为浏览器 HTML</span></div><ChevronRight size={15} /></button>
        <div className="inspector-divider" />
        <div className="inspector-block"><div className="inspector-label">最近添加</div>{board.links.slice(0, 3).map((link) => <div className="recent-link" key={link.id}><div className="favicon">{link.title.slice(0, 1)}</div><div><strong>{link.title}</strong><span>{link.url.replace(/^https?:\/\//, '').split('/')[0]}</span></div></div>)}</div>
        <div className="inspector-note"><ShieldCheck size={16} /><div><strong>本地优先</strong><p>数据保存在当前设备，导出文件可用于迁移。</p></div></div>
      </aside>
    </div>
    {showQuickAdd && <Modal title="添加链接" onClose={() => setShowQuickAdd(false)}><div className="form-stack"><label>链接名称<input value={newLink.title} onChange={(event) => setNewLink((current) => ({ ...current, title: event.target.value }))} onKeyDown={(event) => { if (isCommittedEnter(event)) addLink() }} placeholder="例如：Kubernetes 文档" autoFocus /></label><label>网址<input value={newLink.url} onChange={(event) => setNewLink((current) => ({ ...current, url: event.target.value }))} placeholder="https://" /></label><label>所属分组<select value={newLink.groupId || board.groups[0]?.id} onChange={(event) => setNewLink((current) => ({ ...current, groupId: event.target.value }))}>{groupRows.map(({ group, path }) => <option value={group.id} key={group.id}>{path}</option>)}</select></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowQuickAdd(false)}>取消</button><button className="primary-button" onClick={addLink}>保存链接</button></div></div></Modal>}
    {showGroupAdd && <Modal title="添加分组" onClose={() => setShowGroupAdd(false)}><div className="form-stack"><label>分组名称<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) addGroup() }} placeholder="例如：集群排障" autoFocus /></label><label>分组颜色<ColorPicker value={newGroupColor} onChange={setNewGroupColor} /></label><label>上级分组<select value={newGroupParentId} onChange={(event) => setNewGroupParentId(event.target.value)}><option value="">看板根目录</option>{bookmarkGroupRows(boards.find((item) => item.id === newGroupBoardId)?.groups ?? []).map(({ group, path }) => <option value={group.id} key={group.id}>{path}</option>)}</select></label><p className="form-hint">选择上级分组即可新建子分组，目录可以继续嵌套。</p><div className="modal-actions"><button className="ghost-button" onClick={() => setShowGroupAdd(false)}>取消</button><button className="primary-button" onClick={addGroup}>保存分组</button></div></div></Modal>}
    {showBoardAdd && <Modal title="新建书签看板" onClose={() => setShowBoardAdd(false)}><div className="form-stack"><label>看板名称<input value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} placeholder="例如：前端开发" autoFocus onKeyDown={(event) => { if (isCommittedEnter(event)) createBoard() }} /></label><p className="form-hint">创建后会自动打开新看板，并附带一个“未分组”分组。</p><label>所属分类<select value={newBoardCategory} onChange={(event) => setNewBoardCategory(event.target.value)}><option value="">未分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowBoardAdd(false)}>取消</button><button className="primary-button" onClick={createBoard}><Save size={14} />创建看板</button></div></div></Modal>}
    {organizingGroups && <GroupOrganizer board={board} boards={boards} setBoards={setBoards} onClose={() => setOrganizingGroups(false)} onExport={onExport} />}
    {organizing && <BoardOrganizer boards={boards} categories={categories} setBoards={setBoards} setCategories={setCategories} onClose={() => setOrganizing(false)} onExport={onExportSelection} />}
    {promoting && <Modal title="分组独立为看板" onClose={() => setPromoting(null)}><div className="form-stack"><label>看板名称<input autoFocus value={promoting.name} onChange={(event) => setPromoting({ ...promoting, name: event.target.value })} /></label><label>所属分类<select value={promoting.categoryId} onChange={(event) => setPromoting({ ...promoting, categoryId: event.target.value })}><option value="">未分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>操作<select value={promoting.copy ? 'copy' : 'move'} onChange={(event) => setPromoting({ ...promoting, copy: event.target.value === 'copy' })}><option value="move">移动：从原看板移出，保留原 ID</option><option value="copy">复制：原看板不变，副本使用新 ID</option></select></label><p className="form-hint">包含全部子目录、链接、备注、标签、颜色和顺序。</p><button className="primary-button" disabled={!promoting.name.trim()} onClick={() => { const result = independentGroup(promoting.board, promoting.groupId, { ...promoting, name: promoting.name.trim() }); setBoards((current) => [...current.map((item) => item.id === result.source.id ? result.source : item), result.board]); setActiveBoardId(result.board.id); setActiveGroupId('all'); setPromoting(null) }}>确认创建</button></div></Modal>}
    {editingBoardId && boards.find((item) => item.id === editingBoardId) && <Modal title="重命名书签看板" onClose={() => setEditingBoardId(null)}><div className="form-stack"><label>看板名称<input autoFocus value={boardNameDraft} onChange={(event) => setBoardNameDraft(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) renameBoard() }} placeholder="例如：产品资料" /></label><label>看板备注<input value={boardDescriptionDraft} onChange={(event) => setBoardDescriptionDraft(event.target.value)} /></label><label>所属分类<select value={boardCategoryDraft} onChange={(event) => setBoardCategoryDraft(event.target.value)}><option value="">未分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="modal-actions"><button className="ghost-button" onClick={() => setEditingBoardId(null)}>取消</button><button className="primary-button" onClick={renameBoard}><Save size={14} />保存名称</button></div></div></Modal>}
    {editingGroupId && editingGroupBoardId && <Modal title="编辑分组" onClose={() => { setEditingGroupId(null); setEditingGroupBoardId(null) }}><div className="form-stack"><label>分组名称<input autoFocus value={groupNameDraft} onChange={(event) => setGroupNameDraft(event.target.value)} onKeyDown={(event) => { if (isCommittedEnter(event)) renameGroup() }} /></label><label>备注<input value={groupDescriptionDraft} onChange={(event) => setGroupDescriptionDraft(event.target.value)} /></label><label>分组颜色<ColorPicker value={groupColorDraft} onChange={setGroupColorDraft} /></label><label>上级分组<select value={groupParentDraft} onChange={(event) => setGroupParentDraft(event.target.value)}><option value="">看板根目录</option>{bookmarkGroupRows(boards.find((item) => item.id === editingGroupBoardId)?.groups ?? []).filter((row) => row.group.id !== editingGroupId && !row.ancestors.includes(editingGroupId)).map(({ group, path }) => <option value={group.id} key={group.id}>{path}</option>)}</select></label><button className="ghost-button" onClick={() => { const target = boards.find((item) => item.id === editingGroupBoardId); if (target && editingGroupId) { promote(target, editingGroupId); setEditingGroupId(null) } }}>独立为新看板…</button><p className="form-hint">调整上级分组时，所有子分组及链接会一起保留。</p><div className="folder-editor-extra"><button className="toolbar-button" onClick={() => { const target = boards.find((item) => item.id === editingGroupBoardId); setEditingGroupId(null); setEditingGroupBoardId(null); openGroupAdd(target, editingGroupId) }}><Plus size={14} />新建子分组</button><button className="toolbar-button danger-action" onClick={() => { const group = boards.find((item) => item.id === editingGroupBoardId)?.groups.find((item) => item.id === editingGroupId); if (group) { requestDeleteGroup(group, editingGroupBoardId); setEditingGroupId(null); setEditingGroupBoardId(null) } }}><Trash2 size={14} />删除分组</button></div><div className="modal-actions"><button className="ghost-button" onClick={() => { setEditingGroupId(null); setEditingGroupBoardId(null) }}>取消</button><button className="primary-button" onClick={renameGroup}><Save size={14} />保存分组</button></div></div></Modal>}
    {deletingBoardId && boards.find((item) => item.id === deletingBoardId) && <Modal title="删除书签看板" onClose={() => setDeletingBoardId(null)}><div className="confirm-content"><div className="confirm-icon danger"><Trash2 size={18} /></div><p>确定删除“{boards.find((item) => item.id === deletingBoardId)?.name}”吗？该看板中的链接也会一起移除。</p><div className="modal-actions"><button className="ghost-button" onClick={() => setDeletingBoardId(null)}>取消</button><button className="primary-button danger-button" onClick={deleteBoard}><Trash2 size={14} />确认删除</button></div></div></Modal>}
    {deletingGroupId && deletingGroupBoardId && boards.find((item) => item.id === deletingGroupBoardId) && <Modal title="删除书签分组" onClose={() => { setDeletingGroupId(null); setDeletingGroupBoardId(null) }}><div className="confirm-content"><div className="confirm-icon danger"><Trash2 size={18} /></div><p>确定删除“{boards.find((item) => item.id === deletingGroupBoardId)?.groups.find((group) => group.id === deletingGroupId)?.name}”吗？直属链接会移到上级或其他分组；子分组提升一级，内部链接和目录均保留。</p><div className="modal-actions"><button className="ghost-button" onClick={() => { setDeletingGroupId(null); setDeletingGroupBoardId(null) }}>取消</button><button className="primary-button danger-button" onClick={deleteGroup}><Trash2 size={14} />确认删除</button></div></div></Modal>}
    {showBatchMove && batchTargetBoard && <Modal title={`批量移动 ${selectedLinkIds.length} 条链接`} onClose={() => setShowBatchMove(false)}><div className="form-stack"><label>目标看板<select value={batchTargetBoardId} onChange={(event) => { const nextBoard = boards.find((item) => item.id === event.target.value); setBatchTargetBoardId(event.target.value); setBatchTargetGroupId(nextBoard?.groups[0]?.id ?? '') }}>{boards.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>目标分组<select value={batchTargetGroupId} onChange={(event) => setBatchTargetGroupId(event.target.value)}>{batchTargetBoard.groups.length ? bookmarkGroupRows(batchTargetBoard.groups).map(({ group, path }) => <option value={group.id} key={group.id}>{path}</option>) : <option value="">自动创建“未分组”</option>}</select></label><p className="form-hint">链接会保留名称、地址、标签和备注。</p><div className="modal-actions"><button className="ghost-button" onClick={() => setShowBatchMove(false)}>取消</button><button className="primary-button" onClick={batchMove}><Folder size={14} />确认移动</button></div></div></Modal>}
    {tagEditorLinkIds.length > 0 && <TagEditorModal title={tagEditorLinkIds.length > 1 ? `批量管理 ${tagEditorLinkIds.length} 条链接标签` : '管理链接标签'} currentTags={tagEditorLinkIds.length === 1 ? board.links.find((link) => link.id === tagEditorLinkIds[0])?.tags ?? [] : []} suggestions={allTags.filter((tag) => tag !== '全部')} batchCount={tagEditorLinkIds.length > 1 ? tagEditorLinkIds.length : undefined} onClose={() => setTagEditorLinkIds([])} onSave={saveLinkTags} />}
  </div>
}

function LinkRow({ link, group, groupOptions, isDragging, onUpdate, onCopy, onDelete, onEditTags, onDragStart, onDragEnd }: { link: BookmarkBoard['links'][number]; group?: BookmarkBoard['groups'][number]; groupOptions: ReturnType<typeof bookmarkGroupRows>; isDragging?: boolean; onUpdate: (patch: Partial<BookmarkBoard['links'][number]>) => void; onCopy: (value: string, label?: string) => void; onDelete: () => void; onEditTags: () => void; onDragStart: (event: React.DragEvent<HTMLElement>) => void; onDragEnd: () => void }) {
  const hostname = link.url.replace(/^(https?:\/\/|chrome-extension:\/\/)/, '').split('/')[0]
  const groupPath = groupOptions.find((row) => row.group.id === link.groupId)?.path || '未分组'
  const visibleTags = link.tags.slice(0, 2)
  const hiddenTagCount = Math.max(0, link.tags.length - visibleTags.length)
  const [editing, setEditing] = useState(false)
  const editRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) { editRef.current?.focus(); editRef.current?.select() } }, [editing])
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
  return <article className={`link-row ${isDragging ? 'is-dragging' : ''} ${editing ? 'editing-link' : ''}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setEditing(false) }} draggable onClick={(event) => { if (!(event.target as HTMLElement).closest('input, button, select, textarea')) openLink() }} onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <div className="favicon large">{link.title.slice(0, 1)}</div>
    <div className="row-content"><div className="link-text-fields"><div className="link-title-edit">{editing ? <input ref={editRef} className="link-inline-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} onBlur={() => commit('title')} onKeyDown={(event) => { if (event.key === 'Escape') { setDraft({ title: link.title, url: link.url, description: link.description ?? '' }); setEditing(false) } else if (isCommittedEnter(event)) event.currentTarget.blur() }} aria-label="链接名称" /> : <button className="link-inline-title link-title-open" onClick={openLink} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setEditing(true) }} title="点击打开；右键直接编辑名称与链接">{link.title}</button>}</div>{editing ? <input className="link-inline-url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} onBlur={() => commit('url')} onKeyDown={(event) => { if (event.key === 'Escape') { setDraft({ title: link.title, url: link.url, description: link.description ?? '' }); setEditing(false) } else if (isCommittedEnter(event)) event.currentTarget.blur() }} aria-label="链接地址" /> : <button className="link-inline-url link-url-open" onClick={openLink} title={link.url}>{hostname}</button>}<input className="link-inline-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} onBlur={() => commit('description')} placeholder="添加备注…" aria-label="链接备注" /><div className="link-host">{hostname}</div></div><button className="link-open-area" onClick={openLink} aria-label={`打开 ${link.title}`} title="打开链接；左侧文字可直接编辑"><ArrowUpRight size={20} /><span>打开</span></button></div>
    <span className="group-label row-group" title={groupPath}><span className="group-dot" style={{ background: group?.color }} /><select aria-label={`移动 ${link.title} 到分组`} value={link.groupId} onChange={(event) => onUpdate({ groupId: event.target.value })}>{!groupOptions.some((item) => item.group.id === link.groupId) && <option value={link.groupId}>未分组</option>}{groupOptions.map(({ group: option, path }) => <option value={option.id} key={option.id}>{path}</option>)}</select></span>
    <button className="mini-tags row-tags tag-trigger" onClick={(event) => { event.stopPropagation(); onEditTags() }} aria-label={`编辑 ${link.title} 标签`} title="点击管理标签">{link.tags.length ? <>{visibleTags.map((tag) => <span key={tag}>{tag}</span>)}{hiddenTagCount > 0 && <span className="tag-overflow">+{hiddenTagCount}</span>}</> : <span className="tag-empty">+ 标签</span>}</button>
    <div className="row-actions"><button className="icon-button tiny" aria-label={`编辑链接 ${link.title}`} title="编辑名称与链接" onClick={() => setEditing(true)}><Pencil size={16} /></button><button className="icon-button tiny" onClick={() => onCopy(link.url, '链接已复制')} aria-label="复制链接"><Copy size={16} /></button><button className="icon-button tiny danger-hover" onClick={onDelete} aria-label="删除链接"><Trash2 size={16} /></button><button className="sort-drag-handle" draggable data-drag-handle aria-label={`拖动链接 ${link.title}`} title="拖动调整顺序或分组"><GripVertical size={17} /></button></div>
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
  const directory = useDirectorySize('kubeconfig', 320)
  const initialSelectedId = configs[0]?.id ?? ''
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [configTagFilters, setConfigTagFilters] = useState<string[]>([])
  const [templateId, setTemplateId] = useState(defaultCommandId && commands.some((item) => item.id === defaultCommandId) ? defaultCommandId : commands[0]?.id ?? '')
  const [context, setContext] = useState('')
  const [namespace, setNamespace] = useState('')
  const [commandFormat, setCommandFormat] = usePersistentState<CommandFormat>('orbit-copy-format', 'variable')
  const [commandShell, setCommandShell] = usePersistentState<CommandShell>('orbit-command-shell', 'bash')
  const [extraArgs, setExtraArgs] = useState('')
  const [sortMode, setSortMode] = usePersistentState<ConfigSort>('orbit-kube-sort', 'manual')
  const [showAdd, setShowAdd] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [showCommandManager, setShowCommandManager] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [newGroup, setNewGroup] = useState({ name: '', color: kubeGroupPalette[2] })
  const drag = useWorkspaceDrag()
  const [envNameDraft, setEnvNameDraft] = useState('')
  const [envNameError, setEnvNameError] = useState('')
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
    if (sortMode === 'manual') return 0
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
  let generatedCommand = '', variableDefinition = '', commandError = ''
  if (selected && template) {
    try {
      const result = generateKubeCommand({ path: selected.path, envName: displayEnvName(selected), command: template.command, context, namespace, extraArgs, format: commandFormat, shell: commandShell })
      generatedCommand = result.text
      variableDefinition = result.definition
    } catch (error) { commandError = error instanceof Error ? error.message : '生成失败' }
  }

  useEffect(() => {
    if (!filteredConfigs.some((item) => item.id === selectedId)) setSelectedId(filteredConfigs[0]?.id ?? configs[0]?.id ?? '')
  }, [filteredConfigs, selectedId, configs])

  useEffect(() => {
    if (!selected) {
      setContext('')
      return
    }
    setContext('')
    setEnvNameDraft(displayEnvName(selected)); setEnvNameError('')
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

  const canDrop = (target: WorkspaceDropTarget) => {
    if (!drag.item || isSameDragItem(drag.item, target)) return false
    return drag.item.kind === 'kube-group' ? target.kind === 'kube-group' && target.position !== 'inside' : drag.item.kind === 'config' && (target.kind === 'config' || target.kind === 'kube-group')
  }
  const applyDrop = (event: React.DragEvent<HTMLElement>, target: WorkspaceDropTarget) => {
    if (!drag.item) return
    event.preventDefault()
    event.stopPropagation()
    const source = drag.item
    if (!canDrop(target)) { drag.finish(); return }
    try {
      if (source.kind === 'kube-group' && target.position !== 'inside') {
        setGroups(reorderItems(groups, source.id, target.id, target.position))
        notify('环境分组顺序已更新')
      } else if (source.kind === 'config') {
        const groupId = target.kind === 'kube-group' ? target.id : configs.find((item) => item.id === target.id)?.groupId
        if (!groupId || !groups.some((group) => group.id === groupId)) throw new Error('目标分组不存在')
        if (target.kind === 'config' && target.position !== 'inside') {
          const ordered = orderVisibleItems(configs, displayedConfigs.map((item) => item.id))
          setConfigs(placeGroupedItems(ordered, selectedConfigIds.includes(source.id) ? selectedConfigIds : [source.id], target.id, target.position))
          setSortMode('manual')
          notify(sortMode === 'manual' ? '配置顺序已更新' : '配置顺序已更新，已切换为手动排序')
        } else {
          setConfigs((current) => current.map((config) => (selectedConfigIds.includes(source.id) ? selectedConfigIds.includes(config.id) : config.id === source.id) ? { ...config, groupId, updatedAt: new Date().toISOString() } : config))
          setSelectedGroup(groupId)
          setConfigTagFilters([])
          notify('配置已移入目标分组')
        }
        setSelectedId(source.id)
      }
    } catch (error) { notify(error instanceof Error ? error.message : '无法移动') }
    drag.finish()
  }
  const dropTargetName = drag.target?.kind === 'kube-group' ? groups.find((group) => group.id === drag.target?.id)?.name : configs.find((config) => config.id === drag.target?.id)?.name
  const dropHint = drag.target ? `${drag.target.position === 'inside' ? '移入' : drag.target.position === 'before' ? '插入到前面' : '插入到后面'}：${dropTargetName}` : '分组之间可排序；配置可排序或拖到分组归类'

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
  }

  const deleteConfig = () => {
    if (!selected) return
    setSelectedConfigIds([selected.id])
    setConfirmAction({ type: 'configs' })
  }

  const commitEnvName = () => {
    if (!selected) return
    const envName = deriveEnvName(envNameDraft.trim() || selected.name)
    const error = validateEnvName(envName, configs.filter((item) => item.id !== selected.id).map(displayEnvName))
    if (error) { setEnvNameError(error); notify(error); return }
    setEnvNameError('')
    setEnvNameDraft(envName)
    updateConfig(selected.id, (item) => ({ ...item, envName, alias: envName, metaName: envName, updatedAt: '刚刚' }))
  }

  const saveDetails = async (updated: KubeConfig, expectedContent?: string): Promise<boolean> => {
    const previous = configs.find((item) => item.id === updated.id)
    const error = validateEnvName(displayEnvName(updated), configs.filter((item) => item.id !== updated.id).map(displayEnvName))
    if (error) throw new Error(error)
    if (updated.content !== undefined) inspectKubeconfig(updated.content)
    let fileWritten = false
    if (updated.content !== (expectedContent ?? previous?.content) && window.orbitDesktop && updated.path) {
      await window.orbitDesktop.writeKubeconfigFile({ path: updated.path, content: updated.content ?? '', expectedContent: expectedContent ?? previous?.content })
      fileWritten = true
    }
    try { updateConfig(updated.id, () => updated) } catch (error) {
      if (!fileWritten) throw error
      const failure = new Error('源文件已完整写回并保留备份，但本机记录保存失败。草稿已保留，请检查空间后重试') as Error & { writtenContent: string | undefined }
      failure.writtenContent = updated.content
      throw failure
    }
    if (updated.id === selected?.id) setEnvNameDraft(displayEnvName(updated))
    notify('配置详情已保存')
    return true
  }

  return <div className="content-wrap kube-page" onClickCapture={drag.suppressClick}>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot green" />CLUSTER ACCESS</div><h1>Kubeconfig 管理</h1><p>把散落在不同目录的集群入口，整理成一组可复制的命令。</p></div><div className="heading-actions"><button className="ghost-button" onClick={addKubeGroup}><Plus size={16} />新建分组</button><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} />添加配置</button></div></div>
    <div className="kube-summary"><div><div className="summary-icon blue"><Database size={18} /></div><div><strong>{configs.length}</strong><span>个配置文件</span></div></div><div><div className="summary-icon green"><ShieldCheck size={18} /></div><div><strong>{groups.length}</strong><span>个环境分组</span></div></div><div><div className="summary-icon orange"><Command size={18} /></div><div><strong>{commands.length}</strong><span>条常用命令</span></div></div><div className="summary-tip"><Sparkles size={16} /><span>选择配置，按需指定 Context 和命名空间</span></div></div>
    <div className={`kube-grid ${directory.className}`} style={directory.style}>
      <aside className={`kube-groups panel ${drag.item ? 'is-dragging' : ''}`}>{directory.control}<div className="panel-title"><span>环境分组</span><button className="icon-button tiny" onClick={addKubeGroup} aria-label="新建 kubeconfig 分组"><Plus size={15} /></button></div><button className={`kube-group-item ${selectedGroup === 'all' ? 'active' : ''}`} onClick={() => setSelectedGroup('all')}><div className="group-icon"><HardDrive size={15} /></div><span>全部配置</span><b>{configs.length}</b></button>{groups.map((group) => <div className={`kube-group-item drag-sort-row ${selectedGroup === group.id ? 'active' : ''} ${dropClassName(drag.target, { kind: 'kube-group', id: group.id })} ${isSameDragItem(drag.item, { kind: 'kube-group', id: group.id }) ? 'drag-source' : ''}`} data-kube-group-id={group.id} draggable onDragStart={(event) => drag.start(event, { kind: 'kube-group', id: group.id }, `环境分组 · ${group.name}`)} onDragEnd={drag.finish} key={group.id} role="button" tabIndex={0} onClick={() => setSelectedGroup(group.id)} onKeyDown={(event) => { if ((isCommittedEnter(event)) || event.key === ' ') { event.preventDefault(); setSelectedGroup(group.id) } }} onDragOver={(event) => { const target: WorkspaceDropTarget = drag.item?.kind === 'kube-group' ? rowDropTarget(event, { kind: 'kube-group', id: group.id }) : { kind: 'kube-group', id: group.id, position: 'inside' }; drag.over(event, canDrop(target) ? target : null) }} onDragLeave={drag.leave} onDrop={(event) => applyDrop(event, drag.item?.kind === 'kube-group' ? rowDropTarget(event, { kind: 'kube-group', id: group.id }) : { kind: 'kube-group', id: group.id, position: 'inside' })} aria-label={`分组 ${group.name}，拖到此处归类`}><div className="group-icon" style={{ color: group.color, background: `${group.color}18` }}><Folder size={15} /></div><span>{group.name}</span><b>{configs.filter((config) => config.groupId === group.id).length}</b><div className="group-item-actions"><button className="icon-button tiny" onClick={(event) => { event.stopPropagation(); setGroupEditor(group) }} aria-label={`重命名 ${group.name}`} title="重命名分组"><Pencil size={12} /></button><button className="icon-button tiny danger-hover" onClick={(event) => { event.stopPropagation(); setConfirmAction({ type: 'group', groupId: group.id }) }} aria-label={`删除 ${group.name}`} title="删除分组"><Trash2 size={12} /></button></div><button className="sort-drag-handle" draggable data-drag-handle aria-label={`拖动环境分组 ${group.name}`} title="拖动调整分组顺序"><GripVertical size={14} /></button></div>)}<button className="group-drop-hint" onClick={addKubeGroup}><Plus size={14} />新建分组</button>{drag.item && <div className="group-drop-banner drag-status" role="status" aria-live="polite"><GripVertical size={13} />{dropHint}</div>}</aside>
      <section className="config-list panel"><div className="config-list-header"><div className="panel-title"><span>配置文件 <b>{filteredConfigs.length}</b></span><span className="config-list-hint">拖动排序或调整分组</span>{hasActiveConfigFilter && <button className="clear-filter-button" onClick={clearConfigFilters}><X size={12} />清除筛选</button>}</div><div className="config-list-controls"><div className={`config-selection-toolbar ${selectedConfigIds.length ? 'has-selection' : ''}`}><label className="select-all-control"><input type="checkbox" checked={displayedConfigs.length > 0 && displayedConfigs.every((config) => selectedConfigIds.includes(config.id))} onChange={toggleVisibleSelection} aria-label="全选当前配置" />{selectedConfigIds.length ? `已选 ${selectedConfigIds.length}` : '全选'}</label>{selectedConfigIds.length > 0 && <><select aria-label="批量移动配置" value="" onChange={(event) => { if (event.target.value) moveSelectedConfigs(event.target.value) }}><option value="">批量移动</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select><button className="inline-control" onClick={() => setTagEditorConfigIds(selectedConfigIds)}><Bookmark size={13} />标签</button><button className="inline-control danger-control" onClick={deleteSelectedConfigs}><Trash2 size={13} />删除</button></>}</div><details className="config-tag-filter"><summary><ListFilter size={13} />标签{configTagFilters.length ? <b>{configTagFilters.length}</b> : null}<ChevronDown size={12} /></summary><div className="config-tag-menu"><div className="config-tag-menu-head"><span>选择标签</span>{configTagFilters.length > 0 && <button onClick={() => setConfigTagFilters([])}>清除</button>}</div>{availableConfigTags.length ? availableConfigTags.map((tag) => <label key={tag}><input type="checkbox" checked={configTagFilters.includes(tag)} onChange={() => setConfigTagFilters((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} /> <span>{tag}</span></label>) : <span className="config-tag-empty">暂无标签</span>}<p>多个标签同时选择时按全部匹配。</p></div></details><label className="sort-control"><ArrowDownUp size={13} /><span>排序</span><select aria-label="配置排序" value={sortMode} onChange={(event) => setSortMode(event.target.value as ConfigSort)}><option value="manual">手动排序</option><option value="created">创建时间</option><option value="name">名称</option></select></label></div></div>{displayedConfigs.map((config) => <div key={config.id} className={`config-row drag-sort-row ${selected?.id === config.id ? 'active' : ''} ${isSameDragItem(drag.item, { kind: 'config', id: config.id }) ? 'dragging' : ''} ${selectedConfigIds.includes(config.id) ? 'checked' : ''} ${dropClassName(drag.target, { kind: 'config', id: config.id })}`} data-config-id={config.id} onDragOver={(event) => { const target = rowDropTarget(event, { kind: 'config', id: config.id }); drag.over(event, canDrop(target) ? target : null) }} onDragLeave={drag.leave} onDrop={(event) => applyDrop(event, rowDropTarget(event, { kind: 'config', id: config.id }))} role="button" tabIndex={0} onClick={() => setSelectedId(config.id)} onKeyDown={(event) => { if (isCommittedEnter(event)) setSelectedId(config.id) }} draggable onDragStart={(event) => drag.start(event, { kind: 'config', id: config.id }, selectedConfigIds.includes(config.id) && selectedConfigIds.length > 1 ? `选中的 ${selectedConfigIds.length} 个配置` : `配置 · ${config.name}`)} onDragEnd={drag.finish}><input className="config-select-checkbox" type="checkbox" checked={selectedConfigIds.includes(config.id)} onChange={() => toggleConfigSelection(config.id)} onClick={(event) => event.stopPropagation()} aria-label={`选择 ${config.name}`} /><div className="config-file-icon"><KeyRound size={17} /></div><div className="config-row-main"><strong>{config.name}</strong><span title={config.path}>{config.path}</span><div className="config-row-meta"><span className="config-env-pill">环境变量：{displayEnvName(config)}</span><span className="context-pill">{config.context}</span><button className="config-tags-trigger" onClick={(event) => { event.stopPropagation(); setTagEditorConfigIds([config.id]) }} aria-label={`编辑 ${config.name} 标签`} title="点击管理标签">{config.tags.length ? <>{config.tags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}{config.tags.length > 2 && <em className="tag-overflow">+{config.tags.length - 2}</em>}</> : <em className="tag-empty">+ 标签</em>}</button></div></div><button className="config-detail-button" onClick={(event) => { event.stopPropagation(); setDetailsId(config.id) }} aria-label={`查看 ${config.name} 详情`} title="查看配置详情"><Info size={14} /></button><button className="sort-drag-handle" draggable data-drag-handle aria-label={`拖动配置 ${config.name}`} title="拖动调整顺序或分组"><GripVertical size={15} /></button></div>) }{!displayedConfigs.length && <div className="panel-empty"><Search size={22} /><p>没有找到匹配的配置</p></div>}<button className="add-config-row" onClick={() => setShowAdd(true)}><Plus size={15} />添加一个 kubeconfig</button></section>
      <section className="command-panel panel"><div className="command-panel-header"><div><div className="panel-kicker"><Terminal size={14} />COMMAND BUILDER</div><h2>命令生成器</h2><p>点击配置后生成对应命令，可直接复制到终端。</p></div><div className="terminal-badge"><span />shell</div></div>{selected ? <><div className="selected-config"><div className="config-file-icon big"><KeyRound size={18} /></div><div className="selected-config-main"><span>当前配置</span><strong>{selected.name}</strong><small title={selected.path}>{selected.source === 'directory' ? '目录引用' : selected.source === 'clipboard' || selected.source === 'managed' ? '托管文件' : '文件引用'} · {selected.path}</small><label className="selected-env-name"><span>环境变量名称</span><input aria-label="环境变量名称" aria-invalid={!!envNameError} value={envNameDraft} onChange={(event) => setEnvNameDraft(event.target.value)} onBlur={commitEnvName} onKeyDown={(event) => { if (isCommittedEnter(event)) { event.currentTarget.blur() } }} placeholder="例如 PRODUCTION" /></label>{envNameError && <p className="form-error" role="alert">{envNameError}</p>}</div><button className="icon-button tiny" onClick={() => setDetailsId(selected.id)} aria-label="查看配置详情" title="查看配置详情"><Info size={14} /></button><button className="icon-button tiny" onClick={() => onCopy(selected.path, '路径已复制')} aria-label="复制配置路径"><Copy size={14} /></button>{window.orbitDesktop && <button className="icon-button tiny" aria-label="定位配置源文件" onClick={() => { void window.orbitDesktop?.revealKubeconfig(selected.path).catch((error) => notify(error instanceof Error ? error.message : '源文件无法定位')) }}><FolderOpen size={18} /></button>}<button className="icon-button tiny danger-hover" onClick={deleteConfig} aria-label="删除配置"><Trash2 size={14} /></button></div><div className="command-form"><div className="command-label-row"><label htmlFor="command-template">常用命令</label><div><button className="inline-control" onClick={() => setShowCommandManager(true)}><SlidersHorizontal size={13} />管理命令</button><button className="inline-control" onClick={() => onDefaultCommandChange(templateId)}><Star size={13} fill={defaultCommandId === templateId ? 'currentColor' : 'none'} />{defaultCommandId === templateId ? '默认命令' : '设为默认'}</button></div></div><select id="command-template" aria-label="常用命令" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{commands.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.command}</option>)}</select><div className="form-row"><label>Context<select aria-label="Context" value={context} onChange={(event) => changeContext(event.target.value)}><option value="">使用配置默认（{selected.context || "未设置"}）</option>{contextOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label>命名空间<input aria-label="命名空间" value={namespace} onChange={(event) => setNamespace(event.target.value)} placeholder="使用配置默认" /></label></div><label className="extra-args-field">附加参数<input value={extraArgs} onChange={(event) => setExtraArgs(event.target.value)} placeholder="例如 --watch 或 -l app=web" /></label></div><div className="copy-options"><label>复制格式<select aria-label="复制格式" value={commandFormat} onChange={(event) => setCommandFormat(event.target.value as CommandFormat)}><option value="variable">命名变量 + 命令</option><option value="once">仅本次命令</option><option value="session">当前终端会话</option></select></label><label>终端<select aria-label="终端类型" value={commandShell} onChange={(event) => setCommandShell(event.target.value as CommandShell)}><option value="bash">Bash / Zsh</option><option value="powershell">PowerShell</option></select></label></div><div className="command-preview"><div className="preview-header"><span>复制预览</span><button className="inline-control" onClick={() => onCopy(variableDefinition, '变量定义已复制')} disabled={!!commandError}>复制变量</button><button className="copy-command" disabled={!!commandError} onClick={() => onCopy(generatedCommand, '命令已复制')}><Copy size={14} />复制命令</button></div><pre><code>{commandError && <span role="alert">{commandError}</span>}{generatedCommand.split('\n').map((line, index) => <span className="command-line" key={`${line}-${index}`}><b>{line}</b></span>)}</code></pre></div><div className="command-note"><ShieldCheck size={15} /><span>{commandFormat === 'session' ? '粘贴后影响当前终端会话；关闭终端后失效。应用不会执行命令。' : '仅生成文本，不执行命令。切换 Context 不会修改配置文件。'}</span></div></> : <div className="panel-empty"><KeyRound size={22} /><p>选择一个配置开始</p></div>}</section>
    </div>
    {showAdd && <Modal title="导入 kubeconfig" className="modal-wide kube-import-modal" onClose={() => { if (!importBusy) setShowAdd(false) }}><KubeImportPanel onBusyChange={setImportBusy} configs={configs} groups={groups} initialGroupId={selectedGroup} onClose={() => setShowAdd(false)} onImport={(files, options) => {
      const groupId = options.groupId || groups[0]?.id || uid('kube-group')
      const { configs: imported, duplicateCount } = prepareKubeImports(files, configs, { ...options, groupId })
      if (!imported.length) { notify('选中的配置已存在，无需重复导入'); return }
      try {
        const values: Record<string, unknown> = { 'orbit-kube-configs': [...imported, ...configs] }
        if (!groups.length) values['orbit-kube-groups'] = [{ id: groupId, name: '导入配置', color: kubeGroupPalette[0] }]
        commitStorage(values)
        window.dispatchEvent(new window.CustomEvent('orbit:restore'))
      } catch { throw new Error('本地工作区空间不足，请减少本次导入数量。源文件未修改；粘贴内容若已保存，可用单个文件入口再次导入。') }
      setSelectedGroup(groupId)
      setConfigTagFilters([])
      onClearQuery()
      setSelectedId(imported[0].id)
      setShowAdd(false)
      notify(`已导入 ${imported.length} 个配置${duplicateCount ? `，跳过 ${duplicateCount} 个重复文件` : ''}`)
    }} /></Modal>}
    {showGroupAdd && <Modal title="新建环境分组" onClose={() => setShowGroupAdd(false)}><div className="form-stack"><label>分组名称<input autoFocus value={newGroup.name} onChange={(event) => setNewGroup((current) => ({ ...current, name: event.target.value }))} onKeyDown={(event) => { if (isCommittedEnter(event)) saveKubeGroup() }} placeholder="例如：生产集群" /></label><label>分组颜色<ColorPicker value={newGroup.color} onChange={(color) => setNewGroup((current) => current ? { ...current, color } : current)} /></label><div className="modal-actions"><button className="ghost-button" onClick={() => setShowGroupAdd(false)}>取消</button><button className="primary-button" onClick={saveKubeGroup}><Save size={14} />创建分组</button></div></div></Modal>}
    {groupEditor && <Modal title="编辑环境分组" onClose={() => setGroupEditor(null)}><div className="form-stack"><label>分组名称<input autoFocus value={groupEditor.name} onChange={(event) => setGroupEditor((current) => current ? { ...current, name: event.target.value } : current)} onKeyDown={(event) => { if (isCommittedEnter(event)) saveGroupEdit() }} placeholder="例如：生产集群" /></label><label>分组颜色<ColorPicker value={groupEditor.color} onChange={(color) => setGroupEditor((current) => current ? { ...current, color } : current)} /></label><div className="modal-actions"><button className="ghost-button" onClick={() => setGroupEditor(null)}>取消</button><button className="primary-button" onClick={saveGroupEdit}><Save size={14} />保存分组</button></div></div></Modal>}
    {detailsId && configs.find((config) => config.id === detailsId) && <ConfigDetailModal config={configs.find((config) => config.id === detailsId)!} groups={groups} onClose={() => setDetailsId(null)} onSave={saveDetails} onCopy={onCopy} />}
    {showCommandManager && <CommandManagerModal commands={commands} defaultCommandId={defaultCommandId} setCommands={setCommands} onDefaultCommandChange={onDefaultCommandChange} onClose={() => setShowCommandManager(false)} notify={notify} />}
    {tagEditorConfigIds.length > 0 && <TagEditorModal title={tagEditorConfigIds.length > 1 ? `批量管理 ${tagEditorConfigIds.length} 个配置标签` : '管理配置标签'} currentTags={tagEditorConfigIds.length === 1 ? configs.find((config) => config.id === tagEditorConfigIds[0])?.tags ?? [] : []} suggestions={Array.from(new Set(configs.flatMap((config) => config.tags)))} batchCount={tagEditorConfigIds.length > 1 ? tagEditorConfigIds.length : undefined} onClose={() => setTagEditorConfigIds([])} onSave={saveConfigTags} />}
    {confirmAction && <Modal title={confirmAction.type === 'configs' ? '删除 kubeconfig' : '删除环境分组'} onClose={() => setConfirmAction(null)}><div className="confirm-dialog"><p>{confirmAction.type === 'configs' ? `确定删除选中的 ${selectedConfigIds.length} 个 kubeconfig 吗？此操作只会移除 Orbit 中的记录，不会删除磁盘上的源文件。` : '确定删除这个环境分组吗？组内配置会自动移动到其他分组。'}</p><div className="modal-actions"><button className="ghost-button" onClick={() => setConfirmAction(null)}>取消</button><button className="primary-button danger-button" onClick={confirmDeleteAction}><Trash2 size={14} />确认删除</button></div></div></Modal>}
  </div>
}

function ConfigDetailModal({ config, groups, onClose, onSave, onCopy }: { config: KubeConfig; groups: KubeGroup[]; onClose: () => void; onSave: (config: KubeConfig, expectedContent?: string) => Promise<boolean>; onCopy: (value: string, label?: string) => void }) {
  const [draft, setDraft] = useState({ name: config.name, envName: displayEnvName(config), path: config.path, groupId: config.groupId, context: config.context, contexts: (config.contexts ?? [config.context]).join(', '), server: config.server, tags: config.tags.join(', '), content: config.content ?? '' })
  const [editingContent, setEditingContent] = useState(false)
  const source = useRef(config.content)
  const [loadingSource, setLoadingSource] = useState(Boolean(window.orbitDesktop?.readKubeconfig))
  const [sourceError, setSourceError] = useState('')
  useEffect(() => {
    let active = true
    const read = window.orbitDesktop?.readKubeconfig
    if (!read) return
    void read(config.path).then((file) => {
      if (!active) return
      const parsed = inspectKubeconfig(file.content)
      source.current = file.content
      const sourceFields = { content: file.content, context: parsed.context, contexts: parsed.contexts.join(', '), server: parsed.server }
      originalDraft.current = JSON.stringify({ ...JSON.parse(originalDraft.current), ...sourceFields })
      setDraft((current) => ({ ...current, ...sourceFields }))
    }).catch((error) => { if (active) setSourceError(error instanceof Error ? error.message : '源文件无法读取。下方保留工作区缓存，可复制草稿。') }).finally(() => { if (active) setLoadingSource(false) })
    return () => { active = false }
  }, [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const requestClose = () => { if (!saving && (JSON.stringify(draft) === originalDraft.current || window.confirm('有未保存的修改，确定放弃草稿？'))) onClose() }
  const originalDraft = useRef(JSON.stringify(draft))
  const parseList = (value: string) => Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)))
  const save = async () => {
    if (saving || loadingSource) return
    setSaving(true); setSaveError('')
    try {
    const contexts = parseList(draft.contexts)
    const activeContext = inspectKubeconfig(draft.content).context
    const nextName = draft.name.trim() || config.name
    const envName = deriveEnvName(draft.envName.trim() || nextName)
    const parsed = inspectKubeconfig(draft.content)
    const detectedContexts = parsed.contexts
    const saved = await onSave({ ...config, name: nextName, envName, alias: envName, path: draft.path.trim() || config.path, metaName: envName, groupId: draft.groupId, context: activeContext, contexts: detectedContexts, server: parsed.server, tags: parseList(draft.tags), content: draft.content, updatedAt: '刚刚' }, source.current)
    if (saved) onClose()
    } catch (error) { if (error instanceof Error && 'writtenContent' in error && typeof error.writtenContent === 'string') source.current = error.writtenContent; setSaveError(error instanceof Error ? error.message : '保存失败，请检查源文件权限。草稿已保留') }
    finally { setSaving(false) }
  }
  const contextOptions = Array.from(new Set([draft.context, ...parseList(draft.contexts)].filter(Boolean)))
  return <Modal title="kubeconfig 详情" className="modal-wide" onClose={requestClose}><div className="form-stack"><div className="detail-kicker"><Server size={15} /><span>配置文件信息 · {config.source === 'clipboard' || config.source === 'managed' ? 'Orbit 托管' : '源文件'}</span></div><div className="form-row"><label>配置名称<input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>环境变量名称<input value={draft.envName} onChange={(event) => setDraft((current) => ({ ...current, envName: event.target.value }))} placeholder="例如 PRODUCTION" /></label></div><label>源文件路径<input readOnly={!!window.orbitDesktop} value={draft.path} onChange={(event) => setDraft((current) => ({ ...current, path: event.target.value }))} /></label><div className="form-row"><label>文件 current-context<select disabled={!editingContent || loadingSource} value={draft.context} onChange={(event) => { try { const content = setKubeCurrentContext(draft.content, event.target.value); setDraft((current) => ({ ...current, content, context: event.target.value })) } catch (error) { setSaveError(error instanceof Error ? error.message : 'Context 无效') } }}>{contextOptions.map((item) => <option value={item} key={item}>{item}</option>)}{!contextOptions.length && <option value="">未读取 context</option>}</select></label><label>所属分组<select value={draft.groupId} onChange={(event) => setDraft((current) => ({ ...current, groupId: event.target.value }))}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label></div><label>文件中的 Context<input readOnly value={draft.contexts} onChange={(event) => setDraft((current) => ({ ...current, contexts: event.target.value }))} placeholder="context-a, context-b" /></label><div className="form-row"><label>集群地址<input readOnly value={draft.server} onChange={(event) => setDraft((current) => ({ ...current, server: event.target.value }))} placeholder="https://..." /></label><label>标签（逗号分隔）<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="生产, 只读" /></label></div><div className="heading-actions"><button className="ghost-button" onClick={() => setEditingContent(!editingContent)}>{editingContent ? '查看原始内容' : '编辑原始内容'}</button><button className="ghost-button" onClick={() => onCopy(draft.content, '配置正文已复制')}>复制原始正文</button>{window.orbitDesktop && <button className="ghost-button" onClick={() => { void window.orbitDesktop?.revealKubeconfig(config.path).catch((error) => setSourceError(error.message)) }}>定位源文件</button>}</div>{loadingSource && <p role="status">正在读取源文件…</p>}{sourceError && <p className="form-error" role="alert">{sourceError}</p>}<label>原始 kubeconfig 内容<textarea readOnly={!editingContent} disabled={loadingSource} className="yaml-editor" value={draft.content} onChange={(event) => { const content = event.target.value; try { const parsed = inspectKubeconfig(content); setDraft((current) => ({ ...current, content, context: parsed.context, contexts: parsed.contexts.join(', '), server: parsed.server })) } catch { setDraft((current) => ({ ...current, content })) } }} placeholder="粘贴或编辑 kubeconfig YAML 内容" /></label><div className="detail-meta"><span>环境变量</span><strong>{deriveEnvName(draft.envName.trim() || draft.name.trim() || config.name)}</strong><span>创建时间</span><strong>{config.createdAt ? new Date(config.createdAt).toLocaleString('zh-CN') : '未记录'}</strong><span>最近更新</span><strong>{config.updatedAt}</strong><span>保存方式</span><strong>{window.orbitDesktop ? '正文修改后写回此源文件，并在旁边创建备份' : '浏览器模式：仅保存到本地站点数据'}</strong></div>{saveError && <p className="form-error" role="alert">{saveError}</p>}<div className="modal-actions"><button className="ghost-button" disabled={saving || loadingSource} onClick={requestClose}>取消</button><button className="primary-button" disabled={saving || loadingSource} onClick={() => void save()}><Save size={14} />{saving ? "正在保存…" : "保存详情"}</button></div></div></Modal>
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
  return <div className="content-wrap settings-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />WORKSPACE</div><h1>偏好设置</h1><p>调整界面显示并检查工作区状态。</p></div></div><div className="settings-grid"><section className="settings-card theme-settings-card"><div className={`settings-card-icon ${theme === 'light' ? 'orange' : ''}`}>{theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}</div><div><h3>界面主题</h3><p>在暗色和亮色界面之间切换，选择会自动保存到本机。</p></div><div className="theme-switch" role="group" aria-label="界面主题"><button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}><Moon size={13} />暗色</button><button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}><Sun size={13} />亮色</button></div></section><section className="settings-card density-settings-card"><div className="settings-card-icon green"><SlidersHorizontal size={18} /></div><div><h3>信息密度</h3><p>在快速浏览和完整信息之间切换，配置会自动保存到本机。</p></div><div className="density-switch" role="group" aria-label="信息密度"><button className={density === 'comfortable' ? 'active' : ''} onClick={() => onDensityChange('comfortable')}><LayoutGrid size={13} />舒适</button><button className={density === 'compact' ? 'active' : ''} onClick={() => onDensityChange('compact')}><ListFilter size={13} />紧凑</button></div></section><section className="settings-card"><div className="settings-card-icon"><Laptop size={18} /></div><div><h3>本地工作区</h3><p>数据保存在本机。点击顶部存储图标查看真实目录、导出备份或恢复 JSON。</p></div><span className="status-badge"><span />正常</span></section><section className="settings-card"><div className="settings-card-icon green"><Archive size={18} /></div><div><h3>数据概览</h3><p>{boards.length} 个书签看板 · {configs.length} 个 kubeconfig · 自动保存已开启</p></div><span className="status-badge"><span />本机保存</span></section><section className="settings-card"><div className="settings-card-icon orange"><Code2 size={18} /></div><div><h3>跨平台路线</h3><p>桌面端使用 Electron 与 React，复用 macOS / Windows 界面。数据与引用的源文件均保留在本机。</p></div><span className="version-label">0.2.0</span></section></div></div>
}


export default App
