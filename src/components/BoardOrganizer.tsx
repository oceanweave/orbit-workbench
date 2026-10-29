import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { Modal } from './Modal'
import { ColorPicker } from './ColorPicker'
import { copyBoards } from '../../shared/workspace.mjs'
import { reorderItems } from '../../shared/ordering.mjs'
import type { BoardCategory, BookmarkBoard } from '../types'

export function BoardOrganizer({
  boards,
  categories,
  setBoards,
  setCategories,
  onClose,
  onExport,
}: {
  boards: BookmarkBoard[]
  categories: BoardCategory[]
  setBoards: React.Dispatch<React.SetStateAction<BookmarkBoard[]>>
  setCategories: React.Dispatch<React.SetStateAction<BoardCategory[]>>
  onClose: () => void
  onExport: (boards: BookmarkBoard[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<BoardCategory | null>(null)
  const [error, setError] = useState('')
  const saveCategory = () => {
    if (!draft?.name.trim()) {
      setError('请填写分类名称')
      return
    }
    setCategories((current) =>
      current.some((item) => item.id === draft.id)
        ? current.map((item) =>
            item.id === draft.id ? { ...draft, name: draft.name.trim() } : item,
          )
        : [...current, { ...draft, name: draft.name.trim() }],
    )
    setDraft(null)
    setError('')
  }
  return (
    <Modal title="整理看板与分类" className="modal-wide" onClose={onClose}>
      <div className="organizer-grid">
        <section>
          <div className="organizer-heading">
            <strong>看板分类</strong>
            <button
              className="inline-control"
              onClick={() => setDraft({ id: crypto.randomUUID(), name: '', color: '#6f8cff' })}
            >
              <Plus size={14} />
              新增分类
            </button>
          </div>
          {categories.map((item, index) => (
            <div className="organizer-category" key={item.id}>
              <button
                onClick={() => setDraft(item)}
                onDoubleClick={() => setDraft(item)}
                style={{ borderLeft: `3px solid ${item.color}` }}
              >
                {item.name}
              </button>
              <button
                className="icon-button"
                aria-label={`上移分类 ${item.name}`}
                disabled={!index}
                onClick={() =>
                  setCategories(
                    reorderItems(categories, item.id, categories[index - 1].id, 'before'),
                  )
                }
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`下移分类 ${item.name}`}
                disabled={index === categories.length - 1}
                onClick={() =>
                  setCategories(
                    reorderItems(categories, item.id, categories[index + 1].id, 'after'),
                  )
                }
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`删除分类 ${item.name}`}
                onClick={() => {
                  if (
                    window.confirm(
                      `删除分类「${item.name}」？其中的 ${boards.filter((board) => board.categoryId === item.id).length} 个看板保留为未分类。`,
                    )
                  ) {
                    setBoards((current) =>
                      current.map((board) =>
                        board.categoryId === item.id ? { ...board, categoryId: undefined } : board,
                      ),
                    )
                    setCategories((current) =>
                      current.filter((category) => category.id !== item.id),
                    )
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!categories.length && (
            <p className="form-hint">原有看板位于“未分类”，ID 与内容保持不变。</p>
          )}
          {draft && (
            <div className="form-stack category-draft">
              <label>
                分类名称
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault()
                      saveCategory()
                    }
                    if (event.key === 'Escape') setDraft(null)
                  }}
                />
              </label>
              <ColorPicker
                value={draft.color}
                onChange={(color) => setDraft({ ...draft, color })}
              />
              <div className="heading-actions">
                <button className="ghost-button" onClick={() => setDraft(null)}>
                  取消编辑
                </button>
                <button className="primary-button" onClick={saveCategory}>
                  保存分类
                </button>
              </div>
            </div>
          )}
        </section>
        <section>
          <div className="organizer-heading">
            <label>
              <input
                type="checkbox"
                checked={selected.length === boards.length}
                onChange={() =>
                  setSelected(
                    selected.length === boards.length ? [] : boards.map((board) => board.id),
                  )
                }
              />{' '}
              全选看板
            </label>
            <span>已选 {selected.length}</span>
          </div>
          <div className="organizer-board-list">
            {boards.map((board) => (
              <label className="organizer-board" key={board.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(board.id)}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(board.id)
                        ? current.filter((id) => id !== board.id)
                        : [...current, board.id],
                    )
                  }
                />
                <span>
                  {board.name}
                  <small>
                    {board.groups.length} 个分组 · {board.links.length} 条链接
                  </small>
                </span>
                <select
                  aria-label={`${board.name} 所属分类`}
                  value={board.categoryId ?? ''}
                  onChange={(event) =>
                    setBoards((current) =>
                      current.map((item) =>
                        item.id === board.id
                          ? { ...item, categoryId: event.target.value || undefined }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">未分类</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="organizer-batch">
            <select
              disabled={!selected.length}
              aria-label="批量移动看板到分类"
              value="__choose__"
              onChange={(event) =>
                setBoards((current) =>
                  current.map((board) =>
                    selected.includes(board.id)
                      ? { ...board, categoryId: event.target.value || undefined }
                      : board,
                  ),
                )
              }
            >
              <option value="__choose__" disabled>
                移动到分类…
              </option>
              <option value="">未分类</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              className="ghost-button"
              disabled={!selected.length}
              onClick={() => {
                setBoards((current) => [
                  ...current,
                  ...copyBoards(current.filter((board) => selected.includes(board.id))).map(
                    (board) => ({ ...board, name: board.name + ' · 副本' }),
                  ),
                ])
                setSelected([])
              }}
            >
              <Copy size={14} />
              复制
            </button>
            <button
              className="ghost-button"
              disabled={!selected.length}
              onClick={() => onExport(boards.filter((board) => selected.includes(board.id)))}
            >
              导出选择
            </button>
            <button
              className="ghost-button danger-action"
              disabled={!selected.length || selected.length >= boards.length}
              onClick={() => {
                const items = boards.filter((board) => selected.includes(board.id))
                if (
                  window.confirm(
                    `删除 ${items.length} 个看板及其中 ${items.reduce((sum, board) => sum + board.groups.length, 0)} 个分组、${items.reduce((sum, board) => sum + board.links.length, 0)} 条链接？可撤销此库操作。`,
                  )
                ) {
                  setBoards((current) => current.filter((board) => !selected.includes(board.id)))
                  setSelected([])
                }
              }}
            >
              <Trash2 size={14} />
              删除
            </button>
          </div>
        </section>
      </div>
      {error && <p role="alert">{error}</p>}
    </Modal>
  )
}
