import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ChevronDown,
  Code2,
  Copy,
  ListTree,
  GripVertical,
  Inbox,
  Layers,
  Pencil,
  Plus,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'

import { Modal } from '../../components/Modal'

import {
  dropClassName,
  rowDropTarget,
  useWorkspaceDrag,
  type WorkspaceDropTarget,
} from '../../hooks/useWorkspaceDrag'

import { placeGroupedItems } from '../../../shared/ordering.mjs'

import {
  filterCommands,
  joinCommands,
  moveCommands,
  placeCommandFolder,
  removeCommandFolder,
} from '../../../shared/commands.mjs'

import { InlineCommandEditor } from './InlineCommandEditor'

import { useDirectorySize } from '../../components/DirectorySizer'

import { useContextMenu } from '../../components/ContextMenu'

import { ColorPicker } from '../../components/ColorPicker'

import { CommandEditor } from './CommandEditor'

import {
  commandLanguages,
  type CommandFolder,
  type CommandLanguage,
  type CommandLibrary,
  type SavedCommand,
} from './types'

import type { SaveCommandLibrary } from './useCommandLibrary'

import './commands.css'

const newId = () => crypto.randomUUID()
const colors = [
  '#527a66',
  '#627e91',
  '#a08b59',
  '#8d7897',
  '#a57474',
  '#668c8b',
]

export function CommandLibraryView({
  library,
  saveLibrary,
  onCopy,
  notify,
  query,
  clearQuery,
  onExport,
}: {
  library: CommandLibrary
  saveLibrary: SaveCommandLibrary
  onCopy: (text: string, message?: string) => void
  notify: (message: string) => void
  query: string
  clearQuery: () => void
  onExport: (commands: SavedCommand[]) => void
}) {
  const directory = useDirectorySize('commands', 260)
  const menu = useContextMenu()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const [groupId, setGroupId] = useState('all')
  const [language, setLanguage] = useState<CommandLanguage | 'all'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [limit, setLimit] = useState(20)
  const [editor, setEditor] = useState<SavedCommand | null>(null)
  const [folderDraft, setFolderDraft] = useState<CommandFolder | null>(null)
  const [folderError, setFolderError] = useState('')
  const [remove, setRemove] = useState<{
    group?: CommandFolder
    ids?: string[]
  } | null>(null)
  const composing = useRef(false)
  const drag = useWorkspaceDrag()
  const searchTerm = query.trim()
  // A topbar query is workspace-wide, irrespective of the selected folder.
  const visible = useMemo(
    () =>
      filterCommands(library, {
        groupId: query.trim() ? 'all' : groupId,
        query: searchTerm,
        language,
      }),
    [library, groupId, searchTerm, language, query],
  )
  const selectedItems = visible.filter((item) => selected.includes(item.id))
  const allSelected =
    visible.length > 0 && visible.every((item) => selected.includes(item.id))
  const title = query.trim()
    ? '搜索结果'
    : groupId === 'all'
      ? '全部命令'
      : (library.groups.find((item) => item.id === groupId)?.name ?? '未分组')
  const groupName = (id: string) =>
    library.groups.find((item) => item.id === id)?.name ?? '未分组'

  useEffect(() => {
    setSelected([])
    setLimit(20)
  }, [groupId, searchTerm, language])
  useEffect(() => {
    if (
      groupId !== 'all' &&
      groupId !== '' &&
      !library.groups.some((group) => group.id === groupId)
    )
      setGroupId('all')
  }, [library.groups, groupId])
  useEffect(() => {
    const protect = (event: Event) => {
      if (editor || Object.keys(draftsRef.current).length) {
        event.preventDefault()
        notify('请先保存或导出命令草稿，再恢复命令库')
      }
    }
    window.addEventListener('orbit:before-replace', protect)
    return () => window.removeEventListener('orbit:before-replace', protect)
  }, [editor, notify])
  useEffect(() => {
    composing.current = false
  }, [folderDraft?.id])
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(
        '.command-menu[open]',
      )) {
        if (!menu.contains(event.target as Node)) menu.open = false
      }
    }
    document.addEventListener('pointerdown', closeMenus)
    return () => document.removeEventListener('pointerdown', closeMenus)
  }, [])

  const createCommand = () => {
    const now = new Date().toISOString()
    setEditor({
      id: newId(),
      name: '',
      description: '',
      content: '',
      language: 'bash',
      groupId: groupId === 'all' ? '' : groupId,
      createdAt: now,
      updatedAt: now,
    })
  }
  const saveCommand = (command: SavedCommand) => {
    const exists = library.snippets.some((item) => item.id === command.id)
    const saved = saveLibrary((current) => ({
      ...current,
      snippets: exists
        ? current.snippets.map((item) =>
            item.id === command.id ? command : item,
          )
        : [...current.snippets, command],
    }))
    if (saved) notify(exists ? '命令已更新' : '命令已创建')
    return saved
  }
  useEffect(() => {
    const flush = (event: Event) => {
      if (editor) {
        event.preventDefault()
        notify('请先保存或关闭命令编辑表单，再创建备份')
        return
      }
      if (document.querySelector('.cm-editor[data-composing=true]')) {
        event.preventDefault()
        notify('请先完成输入法选词，再创建备份')
        return
      }
      const pending = draftsRef.current
      if (!Object.keys(pending).length) return
      const saved = saveLibrary((current) => ({
        ...current,
        snippets: current.snippets.map((item) =>
          pending[item.id] !== undefined
            ? {
                ...item,
                content: pending[item.id],
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      }))
      if (!saved) event.preventDefault()
      else {
        setDrafts({})
        draftsRef.current = {}
      }
    }
    window.addEventListener('orbit:before-export', flush)
    return () => window.removeEventListener('orbit:before-export', flush)
  }, [saveLibrary, editor])
  const withDrafts = (items: SavedCommand[]) =>
    items.map((item) => ({ ...item, content: drafts[item.id] ?? item.content }))
  const saveInline = (id: string, content: string) => {
    const saved = saveLibrary((current) => ({
      ...current,
      snippets: current.snippets.map((item) =>
        item.id === id
          ? { ...item, content, updatedAt: new Date().toISOString() }
          : item,
      ),
    }))
    if (saved)
      setDrafts((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    return saved
  }
  const saveFolder = () => {
    if (!folderDraft) return
    const name = folderDraft.name.trim()
    if (!name) {
      setFolderError('请填写分组名称')
      return
    }
    if (
      library.groups.some(
        (item) => item.id !== folderDraft.id && item.name === name,
      )
    ) {
      setFolderError('已有同名分组，请使用其他名称')
      return
    }
    const folder = { ...folderDraft, name }
    if (
      saveLibrary((current) => ({
        ...current,
        groups: current.groups.some((item) => item.id === folder.id)
          ? current.groups.map((item) =>
              item.id === folder.id ? folder : item,
            )
          : [...current.groups, folder],
      }))
    ) {
      setFolderDraft(null)
      notify('分组已保存')
    }
  }
  const move = (ids: string[], target: string) => {
    if (saveLibrary((current) => moveCommands(current, ids, target))) {
      setSelected([])
      notify(`已移动到「${groupName(target)}」`)
    }
  }
  const validTarget = (target: WorkspaceDropTarget) => {
    if (!drag.item || drag.item.id === target.id) return null
    if (
      drag.item.kind === 'command' &&
      target.kind === 'command-group' &&
      target.position === 'inside'
    )
      return target
    if (drag.item.kind === 'command' && target.kind === 'command') return target
    if (
      drag.item.kind === 'command-group' &&
      target.kind === 'command-group' &&
      target.id !== '' &&
      target.position !== 'inside'
    )
      return target
    return null
  }
  const drop = (event: React.DragEvent, target: WorkspaceDropTarget) => {
    event.preventDefault()
    event.stopPropagation()
    if (validTarget(target) && drag.item) {
      if (target.position === 'inside')
        move(
          selected.includes(drag.item.id) ? selected : [drag.item.id],
          target.id,
        )
      else {
        const source = drag.item
        const position = target.position
        if (
          saveLibrary((current) =>
            source.kind === 'command'
              ? {
                  ...current,
                  snippets: placeGroupedItems(
                    current.snippets,
                    selected.includes(source.id) ? selected : [source.id],
                    target.id,
                    position,
                  ),
                }
              : placeCommandFolder(current, source.id, target.id, position),
          )
        )
          notify('顺序已更新')
      }
    }
    drag.finish()
  }
  const chooseGroup = (id: string) => {
    clearQuery()
    setGroupId(id)
  }
  const folderRow = (folder: CommandFolder) => {
    const item = { kind: 'command-group' as const, id: folder.id }
    const target = (event: React.DragEvent<HTMLElement>) =>
      drag.item?.kind === 'command'
        ? { ...item, position: 'inside' as const }
        : rowDropTarget(event, item)
    const count = library.snippets.filter(
      (command) => command.groupId === folder.id,
    ).length
    return (
      <div
        key={folder.id}
        data-command-group-id={folder.id}
        onContextMenu={(event) =>
          folder.id &&
          menu.open(event, [
            { label: '编辑分组', run: () => setFolderDraft(folder) },
            {
              label: '删除分组（保留命令）',
              run: () => setRemove({ group: folder }),
              danger: true,
            },
          ])
        }
        className={`command-folder drag-sort-row ${groupId === folder.id ? 'active' : ''} ${drag.item?.id === folder.id ? 'drag-source' : ''} ${dropClassName(drag.target, item)}`}
        onClickCapture={drag.suppressClick}
        onDragOver={(event) => drag.over(event, validTarget(target(event)))}
        onDragLeave={drag.leave}
        onDrop={(event) => drop(event, target(event))}
      >
        <button
          className="command-folder-select"
          title={folder.name}
          onDoubleClick={() => {
            if (folder.id) setFolderDraft(folder)
          }}
          onClick={() => chooseGroup(folder.id)}
          aria-label={`命令分组 ${folder.name}`}
        >
          <ListTree size={17} style={{ color: folder.color }} />
          <span>{folder.name}</span>
          <small>{count}</small>
        </button>
        {folder.id && (
          <>
            <button
              className="command-folder-action"
              aria-label={`编辑命令分组 ${folder.name}`}
              title="编辑分组"
              onClick={() => {
                setFolderError('')
                setFolderDraft(folder)
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              className="sort-drag-handle"
              data-drag-handle
              draggable
              aria-label={`拖动命令分组 ${folder.name}`}
              onDragStart={(event) => drag.start(event, item, folder.name)}
              onDragEnd={drag.finish}
            >
              <GripVertical size={15} />
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="content-wrap command-library-page">
      <div
        className={`command-workspace ${directory.className}`}
        style={directory.style}
      >
        {menu.node}
        <aside className="command-sidebar" aria-label="命令分组">
          {directory.control}
          <div className="command-sidebar-heading">
            <span>我的命令库</span>
            <small>{library.snippets.length}</small>
            <button
              className="icon-button"
              aria-label="新建分组"
              title="新建分组"
              onClick={() => {
                setFolderError('')
                setFolderDraft({ id: newId(), name: '', color: colors[0] })
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          <button
            className={`command-folder command-folder-all ${groupId === 'all' ? 'active' : ''}`}
            onClick={() => chooseGroup('all')}
          >
            <Layers size={17} />
            <span>全部命令</span>
            <small>{library.snippets.length}</small>
          </button>
          <div className="command-folder-label">
            分组 <span>拖动手柄可排序</span>
          </div>
          <div
            className={`command-folders ${drag.item?.kind === 'command' ? 'receiving' : ''}`}
          >
            {library.groups.map(folderRow)}
            {folderRow({ id: '', name: '未分组', color: 'var(--muted)' })}
          </div>
          <div className="command-sidebar-note">
            <Terminal size={17} />
            <p>
              只记录，不执行。
              <br />
              拖动命令到分组即可归类。
            </p>
          </div>
        </aside>
        <section className="command-main" aria-label="命令记录">
          <div className="command-list-heading">
            <div>
              <h2>
                <Terminal size={18} />
                {title}
              </h2>
              <span>{visible.length} 条记录</span>
            </div>
            <div className="simple-stage-actions">
              <button
                className="ghost-button"
                disabled={!visible.length}
                onClick={() =>
                  onCopy(
                    joinCommands(withDrafts(visible)),
                    `已复制 ${visible.length} 条命令记录`,
                  )
                }
              >
                <Copy size={15} />
                复制当前列表
              </button>
              <button className="primary-button" onClick={createCommand}>
                <Plus size={16} />
                新建命令
              </button>
            </div>
          </div>
          <div className="command-browser-tools">
            <div
              className={`command-selection-bar ${selectedItems.length ? 'has-selection' : ''}`}
            >
              <label>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(element) => {
                    if (element)
                      element.indeterminate =
                        selectedItems.length > 0 && !allSelected
                  }}
                  disabled={!visible.length}
                  onChange={() =>
                    setSelected(
                      allSelected ? [] : visible.map((item) => item.id),
                    )
                  }
                />
                {selectedItems.length
                  ? `已选 ${selectedItems.length} 条`
                  : '全选'}
              </label>
              {selectedItems.length ? (
                <div className="command-batch-actions">
                  <button
                    onClick={() =>
                      onCopy(
                        joinCommands(withDrafts(selectedItems)),
                        `已复制 ${selectedItems.length} 条命令记录`,
                      )
                    }
                  >
                    <Copy size={15} />
                    复制
                  </button>
                  <button onClick={() => onExport(withDrafts(selectedItems))}>
                    导出
                  </button>
                  <select
                    aria-label="批量移动命令"
                    value="__choose__"
                    onChange={(event) =>
                      move(
                        selectedItems.map((item) => item.id),
                        event.target.value,
                      )
                    }
                  >
                    <option value="__choose__" disabled>
                      移动到…
                    </option>
                    <option value="">未分组</option>
                    {library.groups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="command-danger"
                    onClick={() =>
                      setRemove({ ids: selectedItems.map((item) => item.id) })
                    }
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                  <button
                    aria-label="取消命令选择"
                    onClick={() => setSelected([])}
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <span>悬停代码行可逐行复制</span>
              )}
            </div>
            <div className="command-list-tools">
              <label className="command-language-filter">
                语言
                <select
                  aria-label="筛选命令语言"
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as typeof language)
                  }
                >
                  <option value="all">全部语言</option>
                  {commandLanguages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {query && (
                <button
                  className="inline-control"
                  aria-label="清空命令搜索"
                  onClick={clearQuery}
                >
                  清除搜索
                </button>
              )}
            </div>
          </div>
          <div className="command-cards" onClickCapture={drag.suppressClick}>
            {visible.slice(0, limit).map((command) => {
              const item = { kind: 'command' as const, id: command.id }
              return (
                <article
                  key={command.id}
                  data-command-id={command.id}
                  onContextMenu={(event) =>
                    menu.open(event, [
                      {
                        label: '编辑名称与备注',
                        run: () =>
                          setEditor({
                            ...command,
                            content: drafts[command.id] ?? command.content,
                          }),
                      },
                      {
                        label: '复制整段',
                        run: () =>
                          onCopy(drafts[command.id] ?? command.content),
                      },
                      {
                        label: '导出记录（含草稿）',
                        run: () =>
                          onExport(
                            withDrafts(
                              selected.includes(command.id)
                                ? selectedItems
                                : [command],
                            ),
                          ),
                      },
                      {
                        label: `删除${selected.includes(command.id) ? selected.length : 1}条记录`,
                        run: () =>
                          setRemove({
                            ids: selected.includes(command.id)
                              ? selected
                              : [command.id],
                          }),
                        danger: true,
                      },
                    ])
                  }
                  className={`command-card drag-sort-row ${selected.includes(command.id) ? 'selected' : ''} ${drag.item?.id === command.id ? 'drag-source' : ''} ${dropClassName(drag.target, item)}`}
                  onDragOver={(event) =>
                    drag.over(event, validTarget(rowDropTarget(event, item)))
                  }
                  onDragLeave={drag.leave}
                  onDrop={(event) => drop(event, rowDropTarget(event, item))}
                >
                  <div className="command-card-heading">
                    <input
                      type="checkbox"
                      aria-label={`选择命令 ${command.name}`}
                      checked={selected.includes(command.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(command.id)
                            ? current.filter((id) => id !== command.id)
                            : [...current, command.id],
                        )
                      }
                    />
                    <div className="command-card-title">
                      <h3 onDoubleClick={() => setEditor(command)}>
                        {command.name}
                      </h3>
                      {command.description && <p>{command.description}</p>}
                    </div>
                    <div className="command-card-actions">
                      <button
                        title="复制整段"
                        aria-label={`复制整段 ${command.name}`}
                        onClick={() =>
                          onCopy(
                            drafts[command.id] ?? command.content,
                            '整段命令已复制',
                          )
                        }
                      >
                        <Copy size={17} />
                      </button>
                      <button
                        title="编辑命令"
                        aria-label={`编辑命令 ${command.name}`}
                        onClick={() => setEditor(command)}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="sort-drag-handle"
                        data-drag-handle
                        draggable
                        title="拖动排序或移动到分组"
                        aria-label={`拖动命令 ${command.name}`}
                        onDragStart={(event) =>
                          drag.start(event, item, command.name)
                        }
                        onDragEnd={drag.finish}
                      >
                        <GripVertical size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="command-card-meta">
                    <span className="command-language">
                      <Code2 size={12} />
                      {commandLanguages.find(
                        (item) => item.id === command.language,
                      )?.name ?? '纯文本'}
                    </span>
                    <label className="command-card-group">
                      <ListTree size={12} />
                      <select
                        aria-label={`移动命令 ${command.name} 到分组`}
                        value={command.groupId}
                        onChange={(event) =>
                          move([command.id], event.target.value)
                        }
                      >
                        <option value="">未分组</option>
                        {library.groups.map((group) => (
                          <option value={group.id} key={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <details className="command-menu">
                      <summary aria-label={`${command.name} 更多操作`}>
                        更多
                        <ChevronDown size={12} />
                      </summary>
                      <div>
                        <button
                          onClick={(event) => {
                            event.currentTarget
                              .closest('details')
                              ?.removeAttribute('open')
                            const now = new Date().toISOString()
                            if (
                              saveLibrary((current) => ({
                                ...current,
                                snippets: [
                                  ...current.snippets,
                                  {
                                    ...command,
                                    id: newId(),
                                    name: `${command.name} · 副本`,
                                    createdAt: now,
                                    updatedAt: now,
                                  },
                                ],
                              }))
                            )
                              notify('已创建命令副本')
                          }}
                        >
                          <Copy size={14} />
                          创建副本
                        </button>
                        <button
                          className="command-danger"
                          onClick={(event) => {
                            event.currentTarget
                              .closest('details')
                              ?.removeAttribute('open')
                            setRemove({ ids: [command.id] })
                          }}
                        >
                          <Trash2 size={14} />
                          删除记录
                        </button>
                      </div>
                    </details>
                  </div>
                  <InlineCommandEditor
                    content={drafts[command.id] ?? command.content}
                    language={command.language}
                    name={command.name}
                    onCopy={onCopy}
                    onChange={(content) =>
                      setDrafts((current) => ({
                        ...current,
                        [command.id]: content,
                      }))
                    }
                    onSave={(content) => saveInline(command.id, content)}
                  />
                </article>
              )
            })}
            {!visible.length && (
              <div className="command-empty">
                <Inbox size={34} />
                <h3>
                  {searchTerm || language !== 'all'
                    ? '没有找到匹配命令'
                    : '在这里整理常用命令'}
                </h3>
                <p>
                  {searchTerm || language !== 'all'
                    ? '试试其他关键词，或清除筛选。'
                    : '支持多行命令、注释和不同语言的代码片段。'}
                </p>
                <button
                  className="ghost-button"
                  onClick={
                    searchTerm || language !== 'all'
                      ? () => {
                          clearQuery()
                          setLanguage('all')
                        }
                      : createCommand
                  }
                >
                  {searchTerm || language !== 'all'
                    ? '清除筛选'
                    : '新建第一条命令'}
                </button>
              </div>
            )}
            {visible.length > limit && (
              <button
                className="command-show-more"
                onClick={() => setLimit((current) => current + 20)}
              >
                显示更多（还有 {visible.length - limit} 条）
              </button>
            )}
          </div>
        </section>
      </div>
      {editor && (
        <CommandEditor
          command={editor}
          groups={library.groups}
          onClose={() => setEditor(null)}
          onSave={saveCommand}
        />
      )}
      {folderDraft && (
        <Modal
          title={
            library.groups.some((group) => group.id === folderDraft.id)
              ? '编辑命令分组'
              : '新建命令分组'
          }
          onClose={() => setFolderDraft(null)}
        >
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault()
              if (!composing.current) saveFolder()
            }}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (composing.current ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229)
              )
                event.preventDefault()
            }}
          >
            <label>
              分组名称
              <input
                autoFocus
                required
                maxLength={60}
                value={folderDraft.name}
                placeholder="例如：数据库维护"
                onChange={(event) => {
                  setFolderDraft({ ...folderDraft, name: event.target.value })
                  setFolderError('')
                }}
              />
            </label>
            <label>
              分组颜色
              <ColorPicker
                value={folderDraft.color}
                onChange={(color) => setFolderDraft({ ...folderDraft, color })}
              />
            </label>
            {folderError && (
              <p className="field-error" role="alert">
                {folderError}
              </p>
            )}
            <div className="modal-actions">
              {library.groups.some((group) => group.id === folderDraft.id) && (
                <button
                  type="button"
                  className="ghost-button command-danger"
                  onClick={() => {
                    setRemove({ group: folderDraft })
                    setFolderDraft(null)
                  }}
                >
                  <Trash2 size={14} />
                  删除分组
                </button>
              )}
              <button
                type="button"
                className="ghost-button"
                onClick={() => setFolderDraft(null)}
              >
                取消
              </button>
              <button type="submit" className="primary-button">
                保存分组
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title={remove.group ? '删除命令分组' : '删除命令记录'}
          onClose={() => setRemove(null)}
        >
          <div className="form-stack">
            <p className="command-delete-note">
              {remove.group
                ? `删除「${remove.group.name}」后，组内命令会保留在「未分组」中。`
                : `确定删除这 ${remove.ids?.length} 条命令记录吗？可使用顶部“撤销库操作”恢复。`}
            </p>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setRemove(null)}>
                取消
              </button>
              <button
                className="primary-button danger-button"
                onClick={() => {
                  const target = remove
                  if (
                    saveLibrary((current) =>
                      target.group
                        ? removeCommandFolder(current, target.group.id)
                        : {
                            ...current,
                            snippets: current.snippets.filter(
                              (item) => !target.ids?.includes(item.id),
                            ),
                          },
                    )
                  ) {
                    if (target.group?.id === groupId) setGroupId('')
                    setSelected([])
                    setRemove(null)
                    notify(
                      target.group
                        ? '分组已删除，命令已保留'
                        : '命令记录已删除',
                    )
                  }
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
