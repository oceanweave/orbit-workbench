import { useMemo, useState } from 'react'
import { Check, FileDown, FileUp, Search } from 'lucide-react'
import { Modal } from './Modal'
import { bookmarkGroupRows, createBrowserBookmarksHtml } from '../../shared/bookmarks.mjs'
import { selectBookmarks, type WorkspaceBackup } from '../../shared/workspace.mjs'
import type { BookmarkBoard } from '../types'

export function ExchangePanel({
  current,
  imported,
  onClose,
  onDownload,
  onApply,
}: {
  current: WorkspaceBackup
  imported?: WorkspaceBackup
  onClose: () => void
  onDownload: (name: string, content: string, mime: string) => void
  onApply: (data: WorkspaceBackup, replace: boolean) => void
}) {
  const data = imported ?? current
  const [scope, setScope] = useState<'bookmarks' | 'commands' | 'workspace'>('bookmarks')
  const [format, setFormat] = useState('html')
  const [replace, setReplace] = useState(false)
  const [dedupe, setDedupe] = useState(false)
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState(() => (data.boards ?? []).map((item) => item.id))
  const boards = data.boards ?? []
  const selected = useMemo(() => selectBookmarks(boards, selection), [boards, selection])
  const count = selected.reduce((sum, board) => sum + board.links.length, 0)
  const selectedCount = selected.reduce((sum, board) => sum + board.groups.length, 0)
  const toggle = (ids: string[]) => {
    // Expand selected parent nodes into leaves first. This allows deselecting a
    // deep child without accidentally selecting its unchecked siblings again.
    const all = new Set<string>()
    for (const board of selected) {
      if (!board.groups.length && !board.links.length) all.add(board.id)
      for (const group of board.groups)
        if (
          !board.links.some((link) => link.groupId === group.id) &&
          !board.groups.some((item) => item.parentId === group.id)
        )
          all.add(group.id)
      for (const link of board.links) all.add(link.id)
    }
    const hasAll = ids.every((id) =>
      selected.some(
        (board) =>
          board.groups.some((group) => group.id === id) ||
          board.links.some((link) => link.id === id) ||
          board.id === id,
      ),
    )
    const selectable = new Set(
      boards.flatMap((board) => [
        ...board.links.map((link) => link.id),
        ...board.groups
          .filter(
            (group) =>
              !board.links.some((link) => link.groupId === group.id) &&
              !board.groups.some((item) => item.parentId === group.id),
          )
          .map((group) => group.id),
        ...(board.groups.length || board.links.length ? [] : [board.id]),
      ]),
    )
    for (const id of ids) {
      if (hasAll) all.delete(id)
      else if (selectable.has(id)) all.add(id)
    }
    setSelection([...all])
  }
  const tree = (board: BookmarkBoard) => {
    const rows = bookmarkGroupRows(board.groups)
    const kept = selected.find((item) => item.id === board.id)
    const checkbox = (label: string, ids: string[], depth: number) => {
      const selectedIds = new Set([
        ...(kept && !kept.groups.length && !kept.links.length ? [kept.id] : []),
        ...(kept?.groups.map((item) => item.id) ?? []),
        ...(kept?.links.map((item) => item.id) ?? []),
      ])
      const number = ids.filter((id) => selectedIds.has(id)).length
      return (
        <label className="exchange-node" style={{ paddingLeft: 12 + depth * 20 }}>
          <input
            type="checkbox"
            checked={number > 0 && number === ids.length}
            ref={(element) => {
              if (element) element.indeterminate = number > 0 && number < ids.length
            }}
            onChange={() => toggle(ids)}
          />
          {label}
        </label>
      )
    }
    const allIds = [...board.groups, ...board.links].map((item) => item.id)
    return (
      <div key={board.id} className="exchange-board">
        {checkbox(board.name, allIds.length ? allIds : [board.id], 0)}
        {rows.map(({ group, depth, ancestors }) => {
          const descendants = rows
            .filter((row) => row.group.id === group.id || row.ancestors.includes(group.id))
            .map((row) => row.group.id)
          const links = board.links.filter((link) => descendants.includes(link.groupId))
          const direct = board.links.filter((link) => link.groupId === group.id)
          if (
            search &&
            !`${group.name} ${direct.map((link) => link.title + link.url).join(' ')}`
              .toLowerCase()
              .includes(search.toLowerCase())
          )
            return null
          return (
            <div key={group.id} data-depth={ancestors.length}>
              {checkbox(
                `${group.name} · ${links.length}`,
                [...descendants, ...links.map((link) => link.id)],
                depth + 1,
              )}
              {direct.map((link) => (
                <div key={link.id}>{checkbox(link.title, [link.id], depth + 2)}</div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }
  const payload = () => {
    let skipped = 0
    const seen = new Set<string>(
      imported && dedupe
        ? (current.boards ?? []).flatMap((board) => board.links.map((link) => link.url))
        : [],
    )
    const filtered = selected.map((board) => ({
      ...board,
      links: board.links.filter((link) => {
        if (!dedupe) return true
        if (seen.has(link.url)) {
          skipped++
          return false
        }
        seen.add(link.url)
        return true
      }),
    }))
    const result: WorkspaceBackup = imported
      ? { ...data, boards: data.boards ? filtered : undefined }
      : { version: 2, exportedAt: new Date().toISOString(), scope }
    if (!imported) {
      if (scope !== 'commands') {
        result.boards = filtered
        result.categories = current.categories
        result.viewState = current.viewState
      }
      if (scope !== 'bookmarks') result.commandLibrary = current.commandLibrary
      if (scope === 'workspace') {
        result.kubeConfigs = current.kubeConfigs
        result.kubeGroups = current.kubeGroups
        result.kubeCommands = current.kubeCommands
      }
    }
    return { result, skipped }
  }
  const [error, setError] = useState('')
  const run = () => {
    const { result, skipped } = payload()
    if (result.boards && !result.boards.length && !result.commandLibrary && !result.kubeConfigs) {
      setError('请至少选择一个看板、分组或链接')
      return
    }
    if (imported) {
      if (
        skipped &&
        !window.confirm(
          `在当前库和本次选择中发现 ${skipped} 条重复 URL，将跳过这些链接。继续导入？`,
        )
      )
        return
      if (
        replace &&
        !window.confirm('将替换本次文件包含的数据范围。会先下载现有数据备份，是否继续？')
      )
        return
      onApply(result, replace)
    } else if (scope === 'bookmarks' && format === 'html')
      onDownload(
        'orbit-bookmarks.html',
        createBrowserBookmarksHtml(result.boards ?? []),
        'text/html;charset=utf-8',
      )
    else
      onDownload(`orbit-${scope}.backup.json`, JSON.stringify(result, null, 2), 'application/json')
  }
  return (
    <Modal
      title={imported ? '预览与恢复' : '导出与备份'}
      className="modal-wide exchange-modal"
      onClose={onClose}
    >
      <div className="form-stack">
        {!imported && (
          <div className="form-row">
            <label>
              导出范围
              <select
                aria-label="导出范围"
                value={scope}
                onChange={(event) => setScope(event.target.value as typeof scope)}
              >
                <option value="bookmarks">仅书签（不含集群配置）</option>
                <option value="commands">仅命令库</option>
                <option value="workspace">完整工作区（含 kubeconfig 内容）</option>
              </select>
            </label>
            <label>
              格式
              <select
                aria-label="导出格式"
                value={scope === 'bookmarks' ? format : 'json'}
                onChange={(event) => setFormat(event.target.value)}
              >
                {scope === 'bookmarks' && <option value="html">浏览器书签 HTML</option>}
                <option value="json">Orbit JSON 备份（可恢复）</option>
              </select>
            </label>
          </div>
        )}
        {imported?.kubeConfigs?.length || scope === 'workspace' ? (
          <p className="sensitive-note">
            完整工作区包含 kubeconfig 原始内容，可能包含凭据。请将此备份保存在可信的本机位置。
          </p>
        ) : null}
        {boards.length > 0 && (imported || scope !== 'commands') && (
          <>
            <div className="exchange-tools">
              <label>
                <Search size={15} />
                <input
                  aria-label="搜索导入导出目录"
                  placeholder="查找文件夹或链接…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button
                className="inline-control"
                onClick={() => setSelection(boards.map((item) => item.id))}
              >
                全选
              </button>
              <button className="inline-control" onClick={() => setSelection([])}>
                清空
              </button>
            </div>
            <div className="exchange-tree">{boards.map(tree)}</div>
            <p className="form-hint">
              已选 {selected.length} 个看板、{selectedCount} 个分组、{count}{' '}
              条链接。必要祖先目录自动保留，不带未选兄弟项。
            </p>
            <label className="check-option">
              <input
                type="checkbox"
                checked={dedupe}
                onChange={(event) => setDedupe(event.target.checked)}
              />
              按完整 URL 去重（{imported ? '当前库 + 本次选择' : '仅本次选择'}）
            </label>
          </>
        )}
        {imported && (
          <label>
            恢复方式
            <select
              aria-label="恢复方式"
              value={replace ? 'replace' : 'merge'}
              onChange={(event) => setReplace(event.target.value === 'replace')}
            >
              <option value="merge">合并：保留当前数据，为导入项分配新 ID</option>
              <option value="replace">替换：先备份当前数据，再替换文件包含的范围</option>
            </select>
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" onClick={run}>
            {imported ? (
              <>
                <Check size={15} />
                确认导入 / 恢复
              </>
            ) : (
              <>
                <FileDown size={15} />
                导出选择
              </>
            )}
          </button>
        </div>
        <p className="form-hint">
          <FileUp size={13} />
          HTML 用于浏览器互通；JSON 保留颜色、备注和目录结构，可从导入入口恢复。
        </p>
      </div>
    </Modal>
  )
}
