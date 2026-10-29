import {
  isCommittedEnter,
  uid,
  displayEnvName,
  deriveEnvName,
  filenameStem,
  safeDownloadName,
} from './lib/presentation'

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'

import {
  Archive,
  ArrowUpRight,
  Blocks,
  Bookmark,
  Box,
  Check,
  Copy,
  HardDrive,
  KeyRound,
  Laptop,
  LayoutGrid,
  ListFilter,
  MoreHorizontal,
  Search,
  Save,
  Sun,
  SlidersHorizontal,
  Terminal,
  Undo2,
  X,
  Moon,
} from 'lucide-react'

import { BookmarksView } from './features/bookmarks/BookmarksView'

import { KubeconfigView } from './features/kube/KubeconfigView'

import {
  commandTemplates,
  initialBoards,
  initialKubeConfigs,
  initialKubeGroups,
} from './data'

import { useContextMenu } from './components/ContextMenu'

import { StoragePanel } from './components/StoragePanel'

import { ExchangePanel } from './components/ExchangePanel'

import {
  usePersistentState,
  commitStorage,
  canUndoWorkspace,
  undoWorkspace,
} from './lib/workspaceStore'

import {
  validateBackup,
  mergeBackup,
  type WorkspaceBackup,
} from '../shared/workspace.mjs'

import { Modal } from './components/Modal'

import { useCommandLibrary } from './features/commands/useCommandLibrary'

import {
  bookmarkGroupPath,
  createBrowserBookmarksHtml,
  parseBookmarksHtml,
  bookmarkSearchBoard,
} from '../shared/bookmarks.mjs'

import type {
  BookmarkBoard,
  BookmarkGroup,
  BoardCategory,
  CommandTemplate,
  KubeConfig,
  KubeGroup,
  LinkItem,
} from './types'

const CommandLibraryView = lazy(() =>
  import('./features/commands/CommandLibraryView').then((module) => ({
    default: module.CommandLibraryView,
  })),
)

type Section = 'bookmarks' | 'kubeconfig' | 'commands' | 'settings'
type Theme = 'dark' | 'light'
type Density = 'comfortable' | 'compact'
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

function App() {
  const appMenu = useContextMenu()
  const [section, setSection] = useState<Section>('bookmarks')
  const [boards, setBoards] = usePersistentState<BookmarkBoard[]>(
    'orbit-boards',
    initialBoards,
  )
  const [kubeConfigs, setKubeConfigs] = usePersistentState<KubeConfig[]>(
    'orbit-kube-configs',
    initialKubeConfigs,
  )
  const [kubeGroups, setKubeGroups] = usePersistentState<KubeGroup[]>(
    'orbit-kube-groups',
    initialKubeGroups,
  )
  const [kubeCommands, setKubeCommands] = usePersistentState<CommandTemplate[]>(
    'orbit-kube-commands',
    commandTemplates,
  )
  const [defaultCommandId, setDefaultCommandId] = usePersistentState(
    'orbit-default-kube-command',
    commandTemplates[0]?.id ?? '',
  )
  const [theme, setTheme] = usePersistentState<Theme>('orbit-theme', 'light')
  const [density, setDensity] = usePersistentState<Density>(
    'orbit-density',
    'compact',
  )
  const [categories, setCategories] = usePersistentState<BoardCategory[]>(
    'orbit-board-categories',
    [],
  )
  const [showStorage, setShowStorage] = useState(false)
  const [exchange, setExchange] = useState<{
    imported?: WorkspaceBackup
  } | null>(null)
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
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    return () =>
      window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [])

  useEffect(() => {
    localStorage.removeItem('orbit-default-kube-config')
  }, [])

  useEffect(() => {
    const seedById = new Map(
      initialKubeConfigs.map((config) => [config.id, config]),
    )
    setKubeConfigs((current) => {
      let changed = false
      const next = current.map((config) => {
        const seed = seedById.get(config.id)
        const contexts = config.contexts?.length
          ? config.contexts
          : seed?.contexts?.length
            ? seed.contexts
            : config.context
              ? [config.context]
              : []
        const createdAt = config.createdAt ?? seed?.createdAt
        const envName = deriveEnvName(
          config.envName ||
            config.alias ||
            config.metaName?.replace(/^META_/i, '') ||
            seed?.envName ||
            seed?.alias ||
            config.name ||
            filenameStem(config.path),
        )
        const alias = envName
        const metaName = envName
        const content = config.content ?? seed?.content
        const source = config.source ?? seed?.source ?? 'file'
        if (
          contexts.length !== (config.contexts?.length ?? 0) ||
          createdAt !== config.createdAt ||
          envName !== config.envName ||
          alias !== config.alias ||
          metaName !== config.metaName ||
          content !== config.content ||
          source !== config.source
        )
          changed = true
        return changed
          ? {
              ...config,
              contexts,
              createdAt,
              envName,
              alias,
              metaName,
              content,
              source,
            }
          : config
      })
      return changed ? next : current
    })
  }, [])

  const notify = (message: string) => {
    const point = lastPointerRef.current
    const x = Math.min(
      Math.max(point.x, 120),
      Math.max(120, window.innerWidth - 120),
    )
    const y = Math.min(
      Math.max(point.y, 70),
      Math.max(70, window.innerHeight - 18),
    )
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
    exportFile(
      `${safeDownloadName(board.name)}.html`,
      createBrowserBookmarksHtml([board]),
      'text/html;charset=utf-8',
    )
  }

  const exportWorkspace = () => {
    exportFile(
      'orbit-bookmarks.html',
      createBrowserBookmarksHtml(boards),
      'text/html;charset=utf-8',
    )
  }

  const viewState = Object.fromEntries(
    [
      'orbit-bookmark-collapse',
      'orbit-tree-collapse',
      'orbit-expanded-boards',
      'orbit-bookmark-view',
    ].map((key) => {
      try {
        return [key, JSON.parse(localStorage.getItem(key) || 'null')]
      } catch {
        return [key, null]
      }
    }),
  )
  const workspace: WorkspaceBackup = {
    viewState,
    version: 2,
    exportedAt: new Date().toISOString(),
    boards,
    categories,
    kubeGroups,
    kubeConfigs,
    kubeCommands,
    commandLibrary,
  }
  const exportWorkspaceBackup = () => {
    const event = new window.CustomEvent('orbit:before-export', {
      cancelable: true,
    })
    window.dispatchEvent(event)
    if (!event.defaultPrevented) setExchange({})
    else notify('命令草稿未保存，备份已取消，请先保留草稿')
  }
  const applyExchange = (imported: WorkspaceBackup, replace: boolean) => {
    try {
      validateBackup(imported)
      if (imported.commandLibrary) {
        const event = new window.CustomEvent('orbit:before-replace', {
          cancelable: true,
        })
        window.dispatchEvent(event)
        if (event.defaultPrevented) return
      }
      if (replace) {
        const previous: WorkspaceBackup = {
          version: 2,
          scope: 'before-restore',
          exportedAt: new Date().toISOString(),
        }
        if (imported.boards) {
          previous.boards = boards
          previous.categories = categories
          previous.viewState = viewState
        }
        if (imported.commandLibrary) previous.commandLibrary = commandLibrary
        if (imported.kubeConfigs) {
          previous.kubeConfigs = kubeConfigs
          previous.kubeGroups = kubeGroups
        }
        if (imported.kubeCommands) previous.kubeCommands = kubeCommands
        commitStorage({ 'orbit-recovery-backup': previous }, false)
        exportFile(
          'orbit-before-restore.backup.json',
          JSON.stringify(previous, null, 2),
          'application/json',
        )
      }
      const next = replace ? imported : mergeBackup(workspace, imported)
      const values: Record<string, unknown> = {}
      const keys = {
        boards: 'orbit-boards',
        categories: 'orbit-board-categories',
        kubeGroups: 'orbit-kube-groups',
        kubeConfigs: 'orbit-kube-configs',
        kubeCommands: 'orbit-kube-commands',
        commandLibrary: 'orbit-command-library',
      } as const
      for (const [field, key] of Object.entries(keys))
        if (next[field as keyof typeof keys] !== undefined)
          values[key] = next[field as keyof typeof keys]
      if (replace && imported.viewState)
        for (const [key, value] of Object.entries(imported.viewState))
          if (
            [
              'orbit-bookmark-collapse',
              'orbit-tree-collapse',
              'orbit-expanded-boards',
              'orbit-bookmark-view',
            ].includes(key) &&
            value !== null
          )
            values[key] = value
      commitStorage(values)
      window.dispatchEvent(new window.CustomEvent('orbit:restore'))
      setExchange(null)
      notify('导入完成，可使用顶部撤销恢复本机记录')
    } catch (error) {
      notify(error instanceof Error ? error.message : '恢复失败，原库已保留')
    }
  }

  const handleBookmarkImport = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error('文件超过 20 MB，请拆分后导入；当前库未改变')
      const content = await file.text()
      if (file.name.toLowerCase().endsWith('.json'))
        setExchange({ imported: validateBackup(JSON.parse(content)) })
      else {
        const imported = parseBookmarksHtml(content)
        if (!imported.length) throw new Error('没有发现可导入的书签文件夹')
        setExchange({ imported: { version: 2, boards: imported } })
      }
    } catch (error) {
      notify(
        error instanceof Error ? error.message : '导入文件无效，当前库未改变',
      )
    }
  }

  const addBoard = (requestedName = '新看板') => {
    const name = requestedName.trim() || '新看板'
    const id = uid('board')
    const board: BookmarkBoard = {
      id,
      name,
      description: '整理一组重要链接',
      tags: [],
      updatedAt: new Date().toISOString(),
      groups: [{ id: uid('group'), name: '未分组', color: '#527a66' }],
      links: [],
    }
    setBoards((current) => [board, ...current])
    notify('看板已创建')
    return id
  }

  useEffect(() => {
    const refresh = () => setUndoReady(canUndoWorkspace())
    const failed = (event: Event) =>
      notify((event as CustomEvent<string>).detail)
    window.addEventListener('orbit:history', refresh)
    window.addEventListener('orbit:save-error', failed)
    return () => {
      window.removeEventListener('orbit:history', refresh)
      window.removeEventListener('orbit:save-error', failed)
    }
  }, [])

  return (
    <div className="app-shell" data-theme={theme} data-density={density}>
      {appMenu.node}
      <main className="main-area">
        <header className="topbar">
          <div className="brand-mark" aria-label="Orbit Workbench">
            <Blocks size={21} />
            <strong>Orbit Workbench</strong>
          </div>
          <nav className="primary-nav" aria-label="主导航">
            <NavItem
              icon={<Bookmark size={17} />}
              label="书签看板"
              active={section === 'bookmarks'}
              onClick={() => {
                setGlobalSearchOpen(false)
                setQuery('')
                setSection('bookmarks')
              }}
            />
            <NavItem
              icon={<Box size={17} />}
              label="Kubeconfig"
              active={section === 'kubeconfig'}
              onClick={() => {
                setGlobalSearchOpen(false)
                setQuery('')
                setSection('kubeconfig')
              }}
            />
            <NavItem
              icon={<Terminal size={17} />}
              label="命令管理"
              active={section === 'commands'}
              onClick={() => {
                setGlobalSearchOpen(false)
                setQuery('')
                setCommandsVisited(true)
                setSection('commands')
              }}
            />
          </nav>

          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (isCommittedEnter(event) && query.trim()) {
                    event.preventDefault()
                    if (section !== 'commands') setGlobalSearchOpen(true)
                  }
                  if (event.key === 'Escape') {
                    setGlobalSearchOpen(false)
                    setQuery('')
                  }
                }}
                placeholder={
                  section === 'commands'
                    ? '搜索所有命令、分组、备注…'
                    : '搜索所有看板、配置、备注…'
                }
                aria-label={
                  section === 'commands'
                    ? '搜索所有命令、分组、备注'
                    : '搜索所有看板、配置、备注'
                }
              />
              {query && (
                <button
                  className="icon-button tiny"
                  onClick={() => {
                    setQuery('')
                    setGlobalSearchOpen(false)
                  }}
                  aria-label="清空搜索"
                >
                  <X size={13} />
                </button>
              )}
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button"
              disabled={!undoReady}
              aria-label="撤销库操作"
              title="撤销最近的移动、删除或导入"
              onClick={() =>
                notify(
                  undoWorkspace()
                    ? '已撤销库操作；磁盘源文件不变'
                    : '撤销失败，请检查存储权限',
                )
              }
            >
              <Undo2 size={18} />
            </button>
            <button
              className="storage-shortcut"
              aria-label="本机存储"
              onClick={() => setShowStorage(true)}
            >
              <HardDrive size={16} />
              <span>本机存储</span>
            </button>
            <button
              className="icon-button"
              aria-label="应用选项"
              title="主题、设置与帮助"
              onClick={(event) =>
                appMenu.open(event, [
                  {
                    label: theme === 'dark' ? '切换到柔和亮色' : '切换到暗色',
                    run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
                  },
                  {
                    label: '偏好设置',
                    run: () => {
                      setGlobalSearchOpen(false)
                      setSection('settings')
                    },
                  },
                  { label: '使用帮助', run: () => setShowHelp(true) },
                ])
              }
            >
              <MoreHorizontal size={21} />
            </button>
          </div>
        </header>

        {globalSearchOpen && (
          <GlobalSearchView
            query={query}
            boards={boards}
            configs={kubeConfigs}
            kubeGroups={kubeGroups}
            setBoards={setBoards}
            setConfigs={setKubeConfigs}
            setKubeGroups={setKubeGroups}
            onCopy={copyText}
            notify={notify}
            onClose={() => {
              setGlobalSearchOpen(false)
              setQuery('')
            }}
          />
        )}
        <>
          <div
            className="module-page"
            hidden={section !== 'bookmarks' || globalSearchOpen}
          >
            <BookmarksView
              boards={boards}
              categories={categories}
              setCategories={setCategories}
              setBoards={setBoards}
              query={query}
              addBoard={addBoard}
              onImport={() => importRef.current?.click()}
              onExport={(board) => exportBoard(board)}
              onExportSelection={(selection) =>
                exportFile(
                  'orbit-selected-bookmarks.html',
                  createBrowserBookmarksHtml(selection),
                  'text/html;charset=utf-8',
                )
              }
              onExportAll={exportWorkspace}
              onExportBackup={exportWorkspaceBackup}
              onCopy={copyText}
              notify={notify}
              onClearQuery={() => setQuery('')}
            />
          </div>
          <div
            className="module-page"
            hidden={section !== 'kubeconfig' || globalSearchOpen}
          >
            <KubeconfigView
              configs={kubeConfigs}
              setConfigs={setKubeConfigs}
              groups={kubeGroups}
              setGroups={setKubeGroups}
              commands={kubeCommands}
              setCommands={setKubeCommands}
              defaultCommandId={defaultCommandId}
              onDefaultCommandChange={setDefaultCommandId}
              query={query}
              onClearQuery={() => setQuery('')}
              onCopy={copyText}
              notify={notify}
            />
          </div>
          {commandsVisited && (
            <div
              className="module-page"
              hidden={section !== 'commands' || globalSearchOpen}
            >
              <Suspense
                fallback={
                  <div className="content-wrap" role="status">
                    正在打开命令库…
                  </div>
                }
              >
                <CommandLibraryView
                  library={commandLibrary}
                  saveLibrary={saveCommandLibrary}
                  onCopy={copyText}
                  notify={notify}
                  query={query}
                  clearQuery={() => setQuery('')}
                  onExport={(snippets) =>
                    exportFile(
                      'orbit-commands.backup.json',
                      JSON.stringify(
                        {
                          version: 2,
                          scope: 'commands',
                          exportedAt: new Date().toISOString(),
                          commandLibrary: {
                            version: 1,
                            snippets,
                            groups: commandLibrary.groups.filter((group) =>
                              snippets.some(
                                (item) => item.groupId === group.id,
                              ),
                            ),
                          },
                        },
                        null,
                        2,
                      ),
                      'application/json',
                    )
                  }
                />
              </Suspense>
            </div>
          )}
          {section === 'settings' && (
            <SettingsView
              boards={boards}
              configs={kubeConfigs}
              theme={theme}
              onThemeChange={setTheme}
              density={density}
              onDensityChange={setDensity}
            />
          )}
        </>
      </main>

      <input
        ref={importRef}
        type="file"
        accept=".html,.htm,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleBookmarkImport(file)
          event.target.value = ''
        }}
      />
      {showStorage && (
        <StoragePanel
          onClose={() => setShowStorage(false)}
          onCopy={copyText}
          onBackup={() => {
            setShowStorage(false)
            setExchange({})
          }}
          onRestore={() => {
            setShowStorage(false)
            importRef.current?.click()
          }}
          onRecovery={() => {
            try {
              const imported = validateBackup(
                JSON.parse(
                  localStorage.getItem('orbit-recovery-backup') || 'null',
                ),
              )
              setShowStorage(false)
              setExchange({ imported })
            } catch {
              notify('没有可用的替换前备份，当前库未改变')
            }
          }}
        />
      )}
      {exchange && (
        <ExchangePanel
          current={workspace}
          imported={exchange.imported}
          onClose={() => setExchange(null)}
          onDownload={exportFile}
          onApply={applyExchange}
        />
      )}
      {showHelp && (
        <Modal title="使用帮助" onClose={() => setShowHelp(false)}>
          <div className="help-content">
            <p>
              Orbit Workbench 的数据默认只保存在本机浏览器中，并会自动保存。
            </p>
            <div className="help-shortcuts">
              <div>
                <kbd>⌘ / Ctrl</kbd>
                <strong>+ K</strong>
                <span>聚焦顶部搜索框</span>
              </div>
              <div>
                <kbd>Esc</kbd>
                <span>关闭当前弹窗</span>
              </div>
              <div>
                <kbd>拖拽</kbd>
                <span>把书签、kubeconfig 或命令记录拖到左侧高亮分组</span>
              </div>
            </div>
            <p className="muted-copy">
              书签链接会在默认浏览器中打开；kubeconfig
              命令只生成文本，不会自动执行。
            </p>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className="toast"
          style={{ left: toastPosition.x, top: toastPosition.y }}
          role="status"
          aria-live="polite"
        >
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}

function GlobalSearchView({
  query,
  boards,
  configs,
  kubeGroups,
  setBoards,
  setConfigs,
  setKubeGroups,
  onCopy,
  notify,
  onClose,
}: {
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
  const [createMode, setCreateMode] = useState<
    'copy-board' | 'move-board' | 'copy-group' | 'move-group' | null
  >(null)
  const [targetName, setTargetName] = useState('')

  useEffect(() => {
    setSelectedBookmarkIds([])
    setSelectedConfigIds([])
  }, [normalized])

  const bookmarkResults = useMemo<GlobalBookmarkResult[]>(
    () =>
      boards.flatMap((board) =>
        board.links
          .filter((link) => {
            const group = board.groups.find((item) => item.id === link.groupId)
            const searchable = [
              board.name,
              board.description,
              group ? bookmarkGroupPath(board.groups, group.id) : '',
              link.title,
              link.url,
              link.description ?? '',
            ]
              .join(' ')
              .toLocaleLowerCase()
            return !normalized || searchable.includes(normalized)
          })
          .map((link) => ({
            board,
            link,
            group: board.groups.find((item) => item.id === link.groupId),
          })),
      ),
    [boards, normalized],
  )

  const kubeResults = useMemo<GlobalKubeResult[]>(
    () =>
      configs
        .filter((config) => {
          const group = kubeGroups.find((item) => item.id === config.groupId)
          const searchable = [
            config.name,
            config.path,
            config.context,
            config.contexts?.join(' ') ?? '',
            config.server,
            group?.name ?? '',
            displayEnvName(config),
          ]
            .join(' ')
            .toLocaleLowerCase()
          return !normalized || searchable.includes(normalized)
        })
        .map((config) => ({
          config,
          group: kubeGroups.find((item) => item.id === config.groupId),
        })),
    [configs, kubeGroups, normalized],
  )

  const visibleBookmarkResults = tab === 'kubeconfig' ? [] : bookmarkResults
  const visibleKubeResults = tab === 'bookmarks' ? [] : kubeResults
  const totalResults = bookmarkResults.length + kubeResults.length
  const visibleResultCount =
    visibleBookmarkResults.length + visibleKubeResults.length
  const selectedBookmarkCount = selectedBookmarkIds.length
  const selectedConfigCount = selectedConfigIds.length
  const bookmarkSelectionId = (item: GlobalBookmarkResult) =>
    `${item.board.id}:${item.link.id}`

  const toggleBookmark = (id: string) =>
    setSelectedBookmarkIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  const toggleConfig = (id: string) =>
    setSelectedConfigIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  const selectAllVisible = () => {
    const bookmarkIds = visibleBookmarkResults.map(bookmarkSelectionId)
    const configIds = visibleKubeResults.map((item) => item.config.id)
    const allBookmarksSelected =
      bookmarkIds.length > 0 &&
      bookmarkIds.every((id) => selectedBookmarkIds.includes(id))
    const allConfigsSelected =
      configIds.length > 0 &&
      configIds.every((id) => selectedConfigIds.includes(id))
    setSelectedBookmarkIds((current) =>
      allBookmarksSelected
        ? current.filter((id) => !bookmarkIds.includes(id))
        : Array.from(new Set([...current, ...bookmarkIds])),
    )
    setSelectedConfigIds((current) =>
      allConfigsSelected
        ? current.filter((id) => !configIds.includes(id))
        : Array.from(new Set([...current, ...configIds])),
    )
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
    setTargetName(
      mode.endsWith('board')
        ? `搜索结果 · ${query.trim()}`
        : `搜索分组 · ${query.trim()}`,
    )
    setCreateMode(mode)
  }

  const confirmCreate = () => {
    const name =
      targetName.trim() ||
      (createMode?.endsWith('board') ? '搜索结果' : '搜索分组')
    if (!createMode) return
    if (createMode.endsWith('board')) {
      const selected = bookmarkResults.filter((item) =>
        selectedBookmarkIds.includes(bookmarkSelectionId(item)),
      )
      if (!selected.length) return
      const newBoard = bookmarkSearchBoard(selected, name)
      const links = newBoard.links
      if (createMode === 'copy-board')
        setBoards((current) => [newBoard, ...current])
      else {
        const selectedIds = new Set(selected.map(bookmarkSelectionId))
        setBoards((current) => [
          newBoard,
          ...current.map((board) => ({
            ...board,
            links: board.links.filter(
              (link) => !selectedIds.has(`${board.id}:${link.id}`),
            ),
            updatedAt: selected.some((item) => item.board.id === board.id)
              ? new Date().toISOString()
              : board.updatedAt,
          })),
        ])
      }
      notify(
        createMode === 'copy-board'
          ? `已复制 ${links.length} 条链接到新看板`
          : `已移动 ${links.length} 条链接到新看板`,
      )
    } else {
      const selected = kubeResults.filter((item) =>
        selectedConfigIds.includes(item.config.id),
      )
      if (!selected.length) return
      const group: KubeGroup = { id: uid('kube-group'), name, color: '#5d73e6' }
      setKubeGroups((current) => [...current, group])
      if (createMode === 'copy-group')
        setConfigs((current) => [
          ...current,
          ...selected.map(({ config }) => ({
            ...config,
            id: uid('config'),
            groupId: group.id,
            name: `${config.name}（副本）`,
            createdAt: new Date().toISOString(),
            updatedAt: '刚刚',
          })),
        ])
      else {
        const selectedIds = new Set(selected.map((item) => item.config.id))
        setConfigs((current) =>
          current.map((config) =>
            selectedIds.has(config.id)
              ? { ...config, groupId: group.id, updatedAt: '刚刚' }
              : config,
          ),
        )
      }
      notify(
        createMode === 'copy-group'
          ? `已复制 ${selected.length} 个 kubeconfig 到新分组`
          : `已移动 ${selected.length} 个 kubeconfig 到新分组`,
      )
    }
    setCreateMode(null)
    setTargetName('')
    setSelectedBookmarkIds([])
    setSelectedConfigIds([])
  }

  return (
    <div className="content-wrap global-search-view">
      <div className="page-heading search-result-header">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            GLOBAL SEARCH
          </div>
          <h1>搜索结果</h1>
          <p>
            在所有书签看板和 kubeconfig 中查找“<strong>{query}</strong>
            ”，结果不会受当前页面限制。
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="ghost-button"
            onClick={() => beginCreate('copy-board', true)}
            disabled={!bookmarkResults.length}
          >
            <Save size={15} />
            保存为新看板
          </button>
          <button
            className="ghost-button"
            onClick={() => beginCreate('copy-group', true)}
            disabled={!kubeResults.length}
          >
            <Save size={15} />
            保存为新分组
          </button>
          <button className="ghost-button" onClick={onClose}>
            <X size={15} />
            返回当前页面
          </button>
        </div>
      </div>
      <div className="search-result-summary">
        <div>
          <strong>{totalResults}</strong>
          <span>条结果</span>
        </div>
        <div className="search-result-scope">
          <span className="search-scope-badge bookmark">
            书签 {bookmarkResults.length}
          </span>
          <span className="search-scope-badge kube">
            Kubeconfig {kubeResults.length}
          </span>
        </div>
      </div>
      <div
        className="search-result-tabs"
        role="tablist"
        aria-label="搜索结果类型"
      >
        <button
          className={tab === 'all' ? 'active' : ''}
          onClick={() => setTab('all')}
        >
          全部
        </button>
        <button
          className={tab === 'bookmarks' ? 'active' : ''}
          onClick={() => setTab('bookmarks')}
        >
          书签链接 <b>{bookmarkResults.length}</b>
        </button>
        <button
          className={tab === 'kubeconfig' ? 'active' : ''}
          onClick={() => setTab('kubeconfig')}
        >
          Kubeconfig <b>{kubeResults.length}</b>
        </button>
        <button
          className="search-select-button"
          onClick={selectAllVisible}
          disabled={!visibleResultCount}
        >
          <Check size={14} />
          选择当前结果
        </button>
      </div>
      {(selectedBookmarkCount > 0 || selectedConfigCount > 0) && (
        <div className="search-result-actions">
          <span>已选择 {selectedBookmarkCount + selectedConfigCount} 项</span>
          {selectedBookmarkCount > 0 && (
            <>
              <button
                className="toolbar-button"
                onClick={() => beginCreate('copy-board')}
              >
                复制新建看板
              </button>
              <button
                className="toolbar-button"
                onClick={() => beginCreate('move-board')}
              >
                移动新建看板
              </button>
            </>
          )}
          {selectedConfigCount > 0 && (
            <>
              <button
                className="toolbar-button"
                onClick={() => beginCreate('copy-group')}
              >
                复制新建分组
              </button>
              <button
                className="toolbar-button"
                onClick={() => beginCreate('move-group')}
              >
                移动新建分组
              </button>
            </>
          )}
        </div>
      )}
      {visibleResultCount === 0 ? (
        <div className="search-result-empty">
          <Search size={28} />
          <h2>
            {totalResults === 0 ? '没有找到匹配结果' : '当前分类没有匹配结果'}
          </h2>
          <p>试试名称、链接、路径、Context 或分组。</p>
        </div>
      ) : (
        <div className="search-result-grid">
          {visibleBookmarkResults.map((item) => {
            const { board, group, link } = item
            const selectionId = bookmarkSelectionId(item)
            return (
              <article
                className="search-result-card"
                key={`link:${selectionId}`}
              >
                <label className="search-result-check">
                  <input
                    type="checkbox"
                    checked={selectedBookmarkIds.includes(selectionId)}
                    onChange={() => toggleBookmark(selectionId)}
                    aria-label={`选择 ${link.title}`}
                  />
                  <span />
                </label>
                <button
                  className="search-result-card-main"
                  onClick={() =>
                    window.open(link.url, '_blank', 'noopener,noreferrer')
                  }
                >
                  <div className="search-result-icon bookmark">
                    {link.title.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="search-result-card-content">
                    <strong>{link.title}</strong>
                    <span>{link.url}</span>
                    <small>{link.description || '无备注'}</small>
                    <div className="search-result-meta">
                      <em>{board.name}</em>
                      {group && (
                        <em>{bookmarkGroupPath(board.groups, group.id)}</em>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight size={16} />
                </button>
                <div className="search-result-card-tools">
                  <button
                    className="icon-button tiny"
                    onClick={() => onCopy(link.url, '链接已复制')}
                    aria-label="复制链接"
                    title="复制链接"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </article>
            )
          })}
          {visibleKubeResults.map(({ config, group }) => (
            <article
              className="search-result-card search-result-card--kube"
              key={`config:${config.id}`}
            >
              <label className="search-result-check">
                <input
                  type="checkbox"
                  checked={selectedConfigIds.includes(config.id)}
                  onChange={() => toggleConfig(config.id)}
                  aria-label={`选择 ${config.name}`}
                />
                <span />
              </label>
              <div className="search-result-card-main">
                <div className="search-result-icon kube">
                  <KeyRound size={17} />
                </div>
                <div className="search-result-card-content">
                  <strong>{config.name}</strong>
                  <span title={config.path}>{config.path}</span>
                  <small>
                    Context：{config.context || '未设置'} · 环境变量：
                    {displayEnvName(config)}
                  </small>
                  <div className="search-result-meta">
                    {group && <em>{group.name}</em>}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {createMode && (
        <Modal
          title={
            createMode.endsWith('board')
              ? createMode === 'copy-board'
                ? '复制新建看板'
                : '移动新建看板'
              : createMode === 'copy-group'
                ? '复制新建 kubeconfig 分组'
                : '移动新建 kubeconfig 分组'
          }
          onClose={() => setCreateMode(null)}
        >
          <div className="form-stack">
            <label>
              {createMode.endsWith('board') ? '看板名称' : '分组名称'}
              <input
                autoFocus
                value={targetName}
                onChange={(event) => setTargetName(event.target.value)}
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) confirmCreate()
                }}
              />
            </label>
            <p className="form-hint">
              {createMode.startsWith('copy')
                ? '复制会保留原项目，并建立一份新的结果集合。'
                : '移动会从原分组中移除选中项目。'}
            </p>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setCreateMode(null)}
              >
                取消
              </button>
              <button className="primary-button" onClick={confirmCreate}>
                <Save size={14} />
                确认创建
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  soon,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  soon?: boolean
}) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {soon && <em>Soon</em>}
    </button>
  )
}

function SettingsView({
  boards,
  configs,
  theme,
  onThemeChange,
  density,
  onDensityChange,
}: {
  boards: BookmarkBoard[]
  configs: KubeConfig[]
  theme: Theme
  onThemeChange: React.Dispatch<React.SetStateAction<Theme>>
  density: Density
  onDensityChange: React.Dispatch<React.SetStateAction<Density>>
}) {
  return (
    <div className="content-wrap settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            WORKSPACE
          </div>
          <h1>偏好设置</h1>
          <p>调整界面显示并检查工作区状态。</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card theme-settings-card">
          <div
            className={`settings-card-icon ${theme === 'light' ? 'orange' : ''}`}
          >
            {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
          </div>
          <div>
            <h3>界面主题</h3>
            <p>在暗色和亮色界面之间切换，选择会自动保存到本机。</p>
          </div>
          <div className="theme-switch" role="group" aria-label="界面主题">
            <button
              className={theme === 'dark' ? 'active' : ''}
              onClick={() => onThemeChange('dark')}
            >
              <Moon size={13} />
              暗色
            </button>
            <button
              className={theme === 'light' ? 'active' : ''}
              onClick={() => onThemeChange('light')}
            >
              <Sun size={13} />
              亮色
            </button>
          </div>
        </section>
        <section className="settings-card density-settings-card">
          <div className="settings-card-icon green">
            <SlidersHorizontal size={18} />
          </div>
          <div>
            <h3>信息密度</h3>
            <p>在快速浏览和完整信息之间切换，配置会自动保存到本机。</p>
          </div>
          <div className="density-switch" role="group" aria-label="信息密度">
            <button
              className={density === 'comfortable' ? 'active' : ''}
              onClick={() => onDensityChange('comfortable')}
            >
              <LayoutGrid size={13} />
              舒适
            </button>
            <button
              className={density === 'compact' ? 'active' : ''}
              onClick={() => onDensityChange('compact')}
            >
              <ListFilter size={13} />
              紧凑
            </button>
          </div>
        </section>
        <section className="settings-card">
          <div className="settings-card-icon">
            <Laptop size={18} />
          </div>
          <div>
            <h3>本地工作区</h3>
            <p>
              数据保存在本机。点击顶部存储图标查看真实目录、导出备份或恢复
              JSON。
            </p>
          </div>
          <span className="status-badge">
            <span />
            正常
          </span>
        </section>
        <section className="settings-card">
          <div className="settings-card-icon green">
            <Archive size={18} />
          </div>
          <div>
            <h3>数据概览</h3>
            <p>
              {boards.length} 个书签看板 · {configs.length} 个 kubeconfig ·
              自动保存已开启
            </p>
          </div>
          <span className="status-badge">
            <span />
            本机保存
          </span>
        </section>
      </div>
    </div>
  )
}

export default App
