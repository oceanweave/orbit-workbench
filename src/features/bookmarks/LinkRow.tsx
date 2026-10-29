import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Copy,
  GripVertical,
  Link2,
  MoreHorizontal,
  Save,
} from 'lucide-react'
import { Modal } from '../../components/Modal'
import { useContextMenu } from '../../components/ContextMenu'
import { isCommittedEnter } from '../../lib/presentation'
import { bookmarkGroupRows } from '../../../shared/bookmarks.mjs'
import type { LinkItem } from '../../types'

export function LinkRow({
  link,
  groupOptions,
  isDragging,
  onUpdate,
  onCopy,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  link: LinkItem
  groupOptions: ReturnType<typeof bookmarkGroupRows>
  isDragging?: boolean
  onUpdate: (patch: Partial<LinkItem>) => void
  onCopy: (value: string, label?: string) => void
  onDelete: () => void
  onMove: () => void
  onDragStart: (event: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    url: '',
    description: '',
    groupId: '',
  })
  const [error, setError] = useState('')
  const pendingOpen = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menu = useContextMenu()
  const cancelOpen = () => {
    if (pendingOpen.current) clearTimeout(pendingOpen.current)
    pendingOpen.current = null
  }
  useEffect(() => cancelOpen, [])
  const edit = () => {
    cancelOpen()
    setDraft({
      title: link.title,
      url: link.url,
      description: link.description ?? '',
      groupId: link.groupId,
    })
    setError('')
    setEditing(true)
  }
  const actions = () => [
    { label: '编辑链接…', run: edit },
    {
      label: '在浏览器中打开',
      run: () => window.open(link.url, '_blank', 'noopener,noreferrer'),
    },
    { label: '复制链接', run: () => onCopy(link.url, '链接已复制') },
    { label: '移动到其他看板或分组…', run: onMove },
    { label: '删除链接', run: onDelete, danger: true },
  ]
  const open = (event: React.MouseEvent) => {
    cancelOpen()
    // Keyboard activation has no double-click ambiguity; mouse activation waits
    // briefly so opening an edit dialog never also launches the browser.
    if (!event.detail) {
      window.open(link.url, '_blank', 'noopener,noreferrer')
      return
    }
    if (event.detail === 1)
      pendingOpen.current = setTimeout(() => {
        window.open(link.url, '_blank', 'noopener,noreferrer')
        pendingOpen.current = null
      }, 280)
  }
  const save = () => {
    if (!draft.title.trim() || !draft.url.trim()) {
      setError('请填写名称和链接地址')
      return
    }
    try {
      const url = new URL(draft.url.trim())
      if (!['http:', 'https:', 'chrome-extension:'].includes(url.protocol))
        throw new Error()
    } catch {
      setError('请输入完整的 http://、https:// 或浏览器扩展地址')
      return
    }
    onUpdate({
      title: draft.title.trim(),
      url: draft.url.trim(),
      description: draft.description.trim(),
      groupId: draft.groupId,
    })
    setEditing(false)
  }
  const hostname = link.url.replace(/^[a-z-]+:\/\//i, '').split('/')[0]
  return (
    <>
      <article
        className={`simple-link-row ${isDragging ? 'is-dragging' : ''}`}
        draggable
        onDragStart={(event) => {
          cancelOpen()
          onDragStart(event)
        }}
        onDragEnd={onDragEnd}
        onContextMenu={(event) => menu.open(event, actions())}
      >
        <div className="simple-link-line">
          <button
            className="sort-drag-handle"
            draggable
            data-drag-handle
            aria-label={`拖动链接 ${link.title}`}
            title="拖动排序或移入分组"
          >
            <GripVertical size={15} />
          </button>
          <Link2 className="link-symbol" size={15} aria-hidden="true" />
          <button
            className="simple-link-main"
            data-drag-source
            onClick={open}
            onDoubleClick={edit}
            aria-label={`打开 ${link.title}`}
            title={`${link.url}\n${link.description ?? ''}\n双击编辑`}
          >
            <strong className="link-inline-title">{link.title}</strong>
            <span className="simple-link-domain">{hostname}</span>
          </button>
          <div className="simple-row-actions">
            <button
              className="icon-button"
              onClick={() => onCopy(link.url, '链接已复制')}
              aria-label={`复制链接 ${link.title}`}
              title="复制链接"
            >
              <Copy size={17} />
            </button>
            <button
              className="icon-button"
              onClick={() => setExpanded(!expanded)}
              aria-label={`${expanded ? '收起' : '展开'} ${link.title} 信息`}
              aria-expanded={expanded}
              title="查看完整地址与备注"
            >
              <ChevronDown size={16} className={expanded ? 'rotated' : ''} />
            </button>
            <button
              className="icon-button"
              onClick={(event) => menu.open(event, actions())}
              aria-label={`更多链接操作 ${link.title}`}
              title="更多操作"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
        {expanded && (
          <div className="simple-link-detail">
            <a href={link.url} target="_blank" rel="noreferrer">
              {link.url}
            </a>
            <p>{link.description || '暂无备注'}</p>
            <button className="inline-control" onClick={edit}>
              编辑链接与备注…
            </button>
          </div>
        )}
      </article>
      {menu.node}
      {editing && (
        <Modal title="编辑链接" onClose={() => setEditing(false)}>
          <div
            className="form-stack"
            onKeyDown={(event) => {
              if (isCommittedEnter(event) && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                save()
              }
            }}
          >
            <label>
              链接名称
              <input
                autoFocus
                aria-label="链接名称"
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label>
              链接地址
              <input
                aria-label="链接地址"
                value={draft.url}
                onChange={(event) =>
                  setDraft({ ...draft, url: event.target.value })
                }
                placeholder="https://"
              />
            </label>
            <label>
              所属分组
              <select
                aria-label="链接所属分组"
                value={draft.groupId}
                onChange={(event) =>
                  setDraft({ ...draft, groupId: event.target.value })
                }
              >
                {groupOptions.map(({ group, path }) => (
                  <option key={group.id} value={group.id}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            <label>
              备注
              <textarea
                aria-label="链接备注"
                rows={3}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                placeholder="可选，记录链接用途"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
              <button className="primary-button" onClick={save}>
                <Save size={15} />
                保存修改
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
