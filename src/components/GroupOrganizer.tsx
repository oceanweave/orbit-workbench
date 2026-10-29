import { useState } from 'react'
import {
  bookmarkGroupRows,
  deleteBookmarkGroup,
  placeBookmarkGroup,
} from '../../shared/bookmarks.mjs'
import { selectBookmarks } from '../../shared/workspace.mjs'
import { Modal } from './Modal'
import type { BookmarkBoard } from '../types'

export function GroupOrganizer({
  board,
  boards,
  setBoards,
  onClose,
  onExport,
}: {
  board: BookmarkBoard
  boards: BookmarkBoard[]
  setBoards: React.Dispatch<React.SetStateAction<BookmarkBoard[]>>
  onClose: () => void
  onExport: (board: BookmarkBoard) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [targetBoardId, setTargetBoardId] = useState(board.id)
  const [targetGroupId, setTargetGroupId] = useState('')
  const [error, setError] = useState('')
  const rows = bookmarkGroupRows(board.groups)
  const roots = rows.filter(
    (row) => selected.includes(row.group.id) && !row.ancestors.some((id) => selected.includes(id)),
  )
  const destination = boards.find((item) => item.id === targetBoardId)
  const move = () => {
    try {
      let next = boards
      for (const row of roots)
        next = placeBookmarkGroup(
          next,
          board.id,
          row.group.id,
          targetBoardId,
          targetGroupId || undefined,
          'inside',
        )
      setBoards(next)
      setSelected([])
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : '移动失败')
    }
  }
  return (
    <Modal title={`管理分组 · ${board.name}`} className="modal-wide" onClose={onClose}>
      <div className="form-stack">
        <div className="organizer-heading">
          <label>
            <input
              type="checkbox"
              checked={!!rows.length && selected.length === rows.length}
              onChange={() =>
                setSelected(selected.length === rows.length ? [] : rows.map((row) => row.group.id))
              }
            />{' '}
            全选当前看板分组
          </label>
          <span>已选 {selected.length}</span>
        </div>
        <div className="exchange-tree">
          {rows.map(({ group, depth, path }) => (
            <label
              className="exchange-node"
              key={group.id}
              style={{ paddingLeft: depth * 20 + 10 }}
              title={path}
            >
              <input
                type="checkbox"
                checked={selected.includes(group.id)}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(group.id)
                      ? current.filter((id) => id !== group.id)
                      : [...current, group.id],
                  )
                }
              />
              <span style={{ color: group.color }}>●</span>
              {group.name}
              <small>
                {board.links.filter((link) => link.groupId === group.id).length} 条直属链接
              </small>
            </label>
          ))}
        </div>
        <div className="form-row">
          <label>
            移动到看板
            <select
              value={targetBoardId}
              onChange={(event) => {
                setTargetBoardId(event.target.value)
                setTargetGroupId('')
              }}
            >
              {boards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            目标目录
            <select
              value={targetGroupId}
              onChange={(event) => setTargetGroupId(event.target.value)}
            >
              <option value="">看板根目录</option>
              {bookmarkGroupRows(destination?.groups ?? [])
                .filter(
                  (row) =>
                    targetBoardId !== board.id ||
                    (!selected.includes(row.group.id) &&
                      !row.ancestors.some((id) => selected.includes(id))),
                )
                .map(({ group, path }) => (
                  <option key={group.id} value={group.id}>
                    {path}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="form-hint">
          移动包含所选分组的全部子目录与链接。父子同时选中时只移动一次。删除分组会保留链接并提升子目录。
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button
            className="ghost-button danger-action"
            disabled={!selected.length}
            onClick={() => {
              if (
                window.confirm(
                  `删除所选 ${selected.length} 个分组？其中链接会迁移，未选子分组会提升；不会删除链接。`,
                )
              ) {
                setBoards((current) =>
                  current.map((item) =>
                    item.id === board.id
                      ? selected.reduce((next, id) => deleteBookmarkGroup(next, id), item)
                      : item,
                  ),
                )
                setSelected([])
              }
            }}
          >
            删除分组（保留内容）
          </button>
          <button
            className="ghost-button"
            disabled={!selected.length}
            onClick={() => {
              const result = selectBookmarks([board], selected)[0]
              if (result) onExport(result)
            }}
          >
            导出选择
          </button>
          <button className="primary-button" disabled={!selected.length} onClick={move}>
            移动所选分组
          </button>
        </div>
      </div>
    </Modal>
  )
}
