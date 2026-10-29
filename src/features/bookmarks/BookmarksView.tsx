import { LinkRow } from './LinkRow'

import { Fragment, useEffect, useMemo, useState } from 'react'

import {
  Archive,
  ChevronDown,
  ChevronRight,
  FileUp,
  Folder,
  GripVertical,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Save,
  Trash2,
  X,
} from 'lucide-react'

import { BookmarkPanels } from '../../components/BookmarkPanels'

import { GroupOrganizer } from '../../components/GroupOrganizer'

import { BoardOrganizer } from '../../components/BoardOrganizer'

import { ColorPicker } from '../../components/ColorPicker'

import { useContextMenu } from '../../components/ContextMenu'

import { DropGap } from '../../components/DropGap'

import { useDirectorySize } from '../../components/DirectorySizer'

import { usePersistentState } from '../../lib/workspaceStore'

import {
  selectBookmarks,
  copyBoards,
  independentGroup,
} from '../../../shared/workspace.mjs'

import { Modal } from '../../components/Modal'

import { BookmarkGroupTree } from '../../components/BookmarkGroupTree'

import {
  useWorkspaceDrag,
  rowDropTarget,
  dropClassName,
  isSameDragItem,
  type WorkspaceDropTarget,
} from '../../hooks/useWorkspaceDrag'

import { reorderItems } from '../../../shared/ordering.mjs'

import {
  bookmarkGroupRows,
  bookmarkGroupPath,
  bookmarkDescendantIds,
  reparentBookmarkGroup,
  deleteBookmarkGroup,
  moveBookmarkLinks,
  placeBookmarkGroup,
  placeBookmarkLink,
} from '../../../shared/bookmarks.mjs'

import type {
  BookmarkBoard,
  BookmarkGroup,
  BoardCategory,
  LinkItem,
} from '../../types'

import { isCommittedEnter, uid } from '../../lib/presentation'

export function BookmarksView({
  boards,
  categories,
  setCategories,
  setBoards,
  query,
  addBoard,
  onImport,
  onExport,
  onExportSelection,
  onExportAll,
  onExportBackup,
  onCopy,
  notify,
  onClearQuery,
}: {
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
  const [groupColorDraft, setGroupColorDraft] = useState('#527a66')
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('')
  const [boardDescriptionDraft, setBoardDescriptionDraft] = useState('')
  const [boardCategoryDraft, setBoardCategoryDraft] = useState('')
  const [promoting, setPromoting] = useState<{
    board: BookmarkBoard
    groupId: string
    name: string
    categoryId: string
    copy: boolean
  } | null>(null)
  const [activeGroupId, setActiveGroupId] = useState('all')
  const drag = useWorkspaceDrag()
  const [hoverExpandedBoard, setHoverExpandedBoard] = useState<string | null>(
    null,
  )
  const [expandedBoards, setExpandedBoards] = usePersistentState<
    Record<string, boolean>
  >(
    'orbit-expanded-boards',
    Object.fromEntries(boards.map((board) => [board.id, true])),
  )
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [showBoardAdd, setShowBoardAdd] = useState(false)
  const [newLink, setNewLink] = useState({
    title: '',
    url: '',
    description: '',
    groupId: '',
  })
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#527a66')
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
  const [editingGroupBoardId, setEditingGroupBoardId] = useState<string | null>(
    null,
  )
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [deletingGroupBoardId, setDeletingGroupBoardId] = useState<
    string | null
  >(null)

  useEffect(() => {
    if (!boards.some((board) => board.id === activeBoardId)) {
      setActiveBoardId(boards[0]?.id ?? '')
      setActiveGroupId('all')
    }
  }, [boards, activeBoardId])

  useEffect(() => {
    const current = boards.find((item) => item.id === activeBoardId)
    if (
      current &&
      activeGroupId !== 'all' &&
      !current.groups.some((group) => group.id === activeGroupId)
    )
      setActiveGroupId('all')
  }, [boards, activeBoardId, activeGroupId])

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
  const groupRows = useMemo(
    () => bookmarkGroupRows(board?.groups ?? []),
    [board?.groups],
  )
  const activeGroupIds = useMemo(
    () => bookmarkDescendantIds(board?.groups ?? [], activeGroupId),
    [board?.groups, activeGroupId],
  )
  const activeGroupRow = groupRows.find((row) => row.group.id === activeGroupId)
  const draggedSubtree = useMemo(
    () =>
      drag.item?.kind === 'group'
        ? bookmarkDescendantIds(
            boards.find((item) => item.id === drag.item?.boardId)?.groups ?? [],
            drag.item.id,
          )
        : new Set<string>(),
    [boards, drag.item],
  )
  const canDrop = (target: WorkspaceDropTarget) => {
    const source = drag.item
    if (!source || isSameDragItem(source, target)) return false
    if (source.kind === 'category')
      return (
        !!target.id &&
        target.kind === 'category' &&
        target.position !== 'inside'
      )
    if (source.kind === 'board')
      return (
        target.kind === 'category' ||
        (target.kind === 'board' && target.position !== 'inside')
      )
    if (source.kind === 'group')
      return (
        (target.kind === 'board' && target.position === 'inside') ||
        (target.kind === 'group' &&
          !(source.boardId === target.boardId && draggedSubtree.has(target.id)))
      )
    if (
      source.kind === 'link' &&
      target.kind === 'link' &&
      source.boardId === target.boardId &&
      selectedLinkIds.includes(source.id) &&
      selectedLinkIds.includes(target.id)
    )
      return false
    return (
      source.kind === 'link' &&
      (target.kind === 'group' ||
        target.kind === 'link' ||
        target.kind === 'board')
    )
  }
  const targetBoard = boards.find(
    (item) =>
      item.id === drag.target?.boardId ||
      (drag.target?.kind === 'board' && item.id === drag.target.id),
  )
  const targetName =
    drag.target?.kind === 'board'
      ? `${targetBoard?.name}${drag.item?.kind === 'link' ? ' / 未分组' : ''}`
      : drag.target?.kind === 'group'
        ? `${targetBoard?.name} / ${bookmarkGroupPath(targetBoard?.groups ?? [], drag.target.id)}`
        : targetBoard?.links.find((link) => link.id === drag.target?.id)?.title
  const dropHint = drag.target
    ? `${drag.target.position === 'inside' ? '移入' : drag.target.position === 'before' ? '插入到前面' : '插入到后面'}：${targetName}`
    : '边缘显示插入线；分组中央高亮表示移入'
  useEffect(() => {
    if (
      !drag.item ||
      drag.target?.kind !== 'board' ||
      drag.target.position !== 'inside'
    )
      return
    const id = drag.target.id
    const timer = window.setTimeout(() => setHoverExpandedBoard(id), 500)
    return () => window.clearTimeout(timer)
  }, [drag.item, drag.target])
  useEffect(() => {
    if (!drag.item) setHoverExpandedBoard(null)
  }, [drag.item])
  const visibleLinks = useMemo(() => {
    if (!board) return []
    const normalized = query.toLowerCase().trim()
    return board.links.filter((link) => {
      const matchesGroup =
        activeGroupId === 'all' || activeGroupIds.has(link.groupId)
      const matchesSearch =
        !normalized ||
        `${link.title} ${link.url} ${link.description ?? ''} ${bookmarkGroupPath(board.groups, link.groupId)}`
          .toLowerCase()
          .includes(normalized)
      return matchesGroup && matchesSearch
    })
  }, [board, activeGroupId, activeGroupIds, query])

  useEffect(() => {
    setSelectedLinkIds((current) =>
      current.filter((id) => board?.links.some((link) => link.id === id)),
    )
  }, [board])

  useEffect(() => {
    setSelectedLinkIds([])
  }, [activeBoardId, activeGroupId, query])

  const updateBoard = (updater: (current: BookmarkBoard) => BookmarkBoard) => {
    if (!board) return
    setBoards((current) =>
      current.map((item) => (item.id === board.id ? updater(item) : item)),
    )
  }

  const addLink = () => {
    if (!board || !newLink.title.trim() || !newLink.url.trim()) return
    const groupId = newLink.groupId || board.groups[0]?.id || uid('group')
    updateBoard((current) => ({
      ...current,
      groups: current.groups.length
        ? current.groups
        : [{ id: groupId, name: '未分组', color: '#527a66' }],
      updatedAt: new Date().toISOString(),
      links: [
        {
          id: uid('link'),
          title: newLink.title.trim(),
          url: newLink.url.trim(),
          groupId,
          tags: [],
          description: newLink.description.trim(),
          addedAt: new Date().toISOString(),
        },
        ...current.links,
      ],
    }))
    setNewLink({ title: '', url: '', description: '', groupId: '' })
    setShowQuickAdd(false)
    notify('链接已添加')
  }

  const openGroupAdd = (
    target = board,
    parentId = activeGroupId === 'all' ? '' : activeGroupId,
  ) => {
    if (!target) return
    setNewGroupName('')
    setNewGroupColor('#527a66')
    setNewGroupBoardId(target.id)
    setNewGroupParentId(parentId)
    setShowGroupAdd(true)
  }

  const addGroup = () => {
    const target = boards.find((item) => item.id === newGroupBoardId)
    if (!target || !newGroupName.trim()) {
      notify('请输入分组名称')
      return
    }
    if (
      newGroupParentId &&
      !target.groups.some((group) => group.id === newGroupParentId)
    ) {
      notify('上级分组不存在，请重新选择')
      return
    }
    const groupId = uid('group')
    setBoards((current) =>
      current.map((item) =>
        item.id === target.id
          ? {
              ...item,
              updatedAt: new Date().toISOString(),
              groups: [
                ...item.groups,
                {
                  id: groupId,
                  name: newGroupName.trim(),
                  parentId: newGroupParentId || undefined,
                  color: newGroupColor,
                },
              ],
            }
          : item,
      ),
    )
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
    setBoards((current) =>
      current.map((item) =>
        item.id === editingBoardId
          ? {
              ...item,
              name,
              description: boardDescriptionDraft,
              categoryId: boardCategoryDraft || undefined,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
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
    if (newBoardCategory)
      setBoards((current) =>
        current.map((item) =>
          item.id === id ? { ...item, categoryId: newBoardCategory } : item,
        ),
      )
    setActiveBoardId(id)
    setActiveGroupId('all')
    setExpandedBoards((current) => ({ ...current, [id]: true }))
    setNewBoardName('')
    setShowBoardAdd(false)
  }

  const applyDrop = (
    event: React.DragEvent<HTMLElement>,
    target: WorkspaceDropTarget,
  ) => {
    if (!drag.item) return
    event.preventDefault()
    event.stopPropagation()
    const source = drag.item
    if (!canDrop(target)) {
      drag.finish()
      return
    }
    try {
      if (source.kind === 'category') {
        setCategories(
          reorderItems(
            categories,
            source.id,
            target.id,
            target.position === 'before' ? 'before' : 'after',
          ),
        )
        drag.finish()
        return
      }
      if (source.kind === 'board' && target.kind === 'category') {
        setBoards((current) =>
          current.map((item) =>
            item.id === source.id
              ? { ...item, categoryId: target.id || undefined }
              : item,
          ),
        )
        drag.finish()
        return
      }
      const targetBoardId =
        target.kind === 'board' ? target.id : target.boardId!
      let next = boards
      let selectedGroupId = activeGroupId
      if (source.kind === 'board' && target.position !== 'inside')
        next = reorderItems(boards, source.id, target.id, target.position)
      else if (source.kind === 'group') {
        next = placeBookmarkGroup(
          boards,
          source.boardId!,
          source.id,
          targetBoardId,
          target.kind === 'group' ? target.id : undefined,
          target.position,
        )
        selectedGroupId = source.id
      } else if (source.kind === 'link') {
        if (target.kind === 'link' && target.position !== 'inside') {
          next = placeBookmarkLink(
            boards,
            source.boardId!,
            selectedLinkIds.includes(source.id) ? selectedLinkIds : source.id,
            targetBoardId,
            target.id,
            target.position,
          )
          selectedGroupId =
            targetBoardId === activeBoardId ? activeGroupId : 'all'
        } else {
          // A board header means its root, never an arbitrary first folder.
          let destination = target.kind === 'group' ? target.id : ''
          let prepared = boards
          if (target.kind === 'board') {
            const ungrouped = boards
              .find((item) => item.id === targetBoardId)
              ?.groups.find(
                (group) => !group.parentId && group.name === '未分组',
              )
            destination = ungrouped?.id || uid('group')
            if (!ungrouped)
              prepared = boards.map((item) =>
                item.id === targetBoardId
                  ? {
                      ...item,
                      groups: [
                        ...item.groups,
                        { id: destination, name: '未分组', color: '#527a66' },
                      ],
                    }
                  : item,
              )
          }
          const moved = moveBookmarkLinks(
            prepared,
            source.boardId!,
            selectedLinkIds.includes(source.id) ? selectedLinkIds : [source.id],
            targetBoardId,
            destination,
          )
          next = moved.boards
          selectedGroupId = moved.groupId
        }
      }
      setBoards(next)
      if (source.kind !== 'board') {
        setActiveBoardId(targetBoardId)
        setActiveGroupId(selectedGroupId)
        setExpandedBoards((current) => ({ ...current, [targetBoardId]: true }))
      }
      notify(
        target.position === 'inside'
          ? '已移动，子分组和条目均已保留'
          : '顺序与分组已更新',
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法移动')
    }
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

  const openGroupRename = (
    group: BookmarkBoard['groups'][number],
    boardId = board?.id,
  ) => {
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
    try {
      reparentBookmarkGroup(target, editingGroupId, groupParentDraft)
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法移动分组')
      return
    }
    setBoards((current) =>
      current.map((item) => {
        if (item.id !== editingGroupBoardId) return item
        const moved = reparentBookmarkGroup(
          item,
          editingGroupId,
          groupParentDraft,
        )
        return {
          ...moved,
          groups: moved.groups.map((group) =>
            group.id === editingGroupId
              ? {
                  ...group,
                  name,
                  color: groupColorDraft,
                  description: groupDescriptionDraft,
                }
              : group,
          ),
        }
      }),
    )
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
    setBoards((current) =>
      current.map((item) =>
        item.id === target.id
          ? deleteBookmarkGroup(item, deletingGroupId)
          : item,
      ),
    )
    if (activeBoardId === target.id && activeGroupId === deletingGroupId)
      setActiveGroupId('all')
    setDeletingGroupId(null)
    setDeletingGroupBoardId(null)
    setEditingGroupId(null)
    setEditingGroupBoardId(null)
    notify('分组已删除，子分组与链接已保留')
  }

  const toggleLinkSelection = (linkId: string) => {
    setSelectedLinkIds((current) =>
      current.includes(linkId)
        ? current.filter((id) => id !== linkId)
        : [...current, linkId],
    )
  }

  const toggleSelectVisible = () => {
    const visibleIds = visibleLinks.map((link) => link.id)
    setSelectedLinkIds((current) =>
      visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    )
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

  const batchTargetBoard =
    boards.find((item) => item.id === batchTargetBoardId) ?? board

  const batchMove = () => {
    if (!board || !selectedLinkIds.length || !batchTargetBoard) return
    const moved = moveBookmarkLinks(
      boards,
      board.id,
      selectedLinkIds,
      batchTargetBoard.id,
      batchTargetGroupId,
    )
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
    updateBoard((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      links: current.links.filter((link) => !selectedIds.has(link.id)),
    }))
    setSelectedLinkIds([])
    setSelectionMode(false)
    notify(`已删除 ${count} 条链接`)
  }

  const hasActiveFilters = Boolean(query.trim()) || activeGroupId !== 'all'
  const clearFilters = () => {
    setActiveGroupId('all')
    onClearQuery()
  }

  const promote = (target: BookmarkBoard, groupId: string) =>
    setPromoting({
      board: target,
      groupId,
      name: target.groups.find((item) => item.id === groupId)?.name ?? '新看板',
      categoryId: target.categoryId ?? '',
      copy: false,
    })
  const groupMenu = (
    event: React.MouseEvent,
    target: BookmarkBoard,
    group: BookmarkGroup,
  ) =>
    menu.open(event, [
      {
        label: '编辑名称、颜色与备注',
        run: () => openGroupRename(group, target.id),
      },
      { label: '新建子分组', run: () => openGroupAdd(target, group.id) },
      { label: '独立为新看板…', run: () => promote(target, group.id) },
      {
        label: '导出此分组',
        run: () => {
          const selected = selectBookmarks([target], [group.id])[0]
          if (selected) onExport(selected)
        },
      },
      {
        label: '移到同级顶部',
        run: () => {
          const first = target.groups.find(
            (item) => item.parentId === group.parentId,
          )
          if (first && first.id !== group.id)
            setBoards(
              placeBookmarkGroup(
                boards,
                target.id,
                group.id,
                target.id,
                first.id,
                'before',
              ),
            )
        },
      },
      {
        label: '移到同级末尾',
        run: () => {
          const siblings = target.groups.filter(
            (item) => item.parentId === group.parentId,
          )
          const last = siblings[siblings.length - 1]
          if (last && last.id !== group.id)
            setBoards(
              placeBookmarkGroup(
                boards,
                target.id,
                group.id,
                target.id,
                last.id,
                'after',
              ),
            )
        },
      },
      {
        label: '删除分组（保留内容）',
        run: () => requestDeleteGroup(group, target.id),
        danger: true,
      },
    ])
  const renderBoard = (item: BookmarkBoard) => (
    <Fragment key={item.id}>
      <DropGap
        target={{ kind: 'board', id: item.id, position: 'before' }}
        current={drag.target}
        enabled={
          drag.item?.kind === 'board' &&
          canDrop({ kind: 'board', id: item.id, position: 'before' })
        }
        onOver={drag.over}
        onLeave={drag.leave}
        onDrop={applyDrop}
      />
      <div className="tree-item-wrap">
        <div
          className={`tree-item drag-sort-row ${item.id === board.id ? 'selected' : ''} ${dropClassName(drag.target, { kind: 'board', id: item.id })} ${isSameDragItem(drag.item, { kind: 'board', id: item.id }) ? 'drag-source' : ''}`}
          data-board-id={item.id}
          onContextMenu={(event) =>
            menu.open(event, [
              { label: '编辑看板', run: () => openBoardRename(item) },
              { label: '新建分组', run: () => openGroupAdd(item, '') },
              {
                label: '创建副本',
                run: () =>
                  setBoards((current) => [
                    ...current,
                    ...copyBoards([item]).map((copy) => ({
                      ...copy,
                      name: copy.name + ' · 副本',
                    })),
                  ]),
              },
              { label: '分类与批量管理…', run: () => setOrganizing(true) },
              { label: '导出看板', run: () => onExport(item) },
              {
                label: '删除看板',
                run: () => setDeletingBoardId(item.id),
                disabled: boards.length <= 1,
                danger: true,
              },
            ])
          }
          draggable
          onDragStart={(event) =>
            drag.start(
              event,
              { kind: 'board', id: item.id },
              `看板 · ${item.name}`,
            )
          }
          onDragEnd={drag.finish}
          onDragOver={(event) => {
            const target: WorkspaceDropTarget =
              drag.item?.kind === 'board'
                ? rowDropTarget(event, { kind: 'board', id: item.id })
                : { kind: 'board', id: item.id, position: 'inside' }
            drag.over(event, canDrop(target) ? target : null)
          }}
          onDragLeave={drag.leave}
          onDrop={(event) =>
            applyDrop(
              event,
              drag.item?.kind === 'board'
                ? rowDropTarget(event, { kind: 'board', id: item.id })
                : { kind: 'board', id: item.id, position: 'inside' },
            )
          }
          onClick={() => {
            setActiveBoardId(item.id)
            setActiveGroupId('all')
          }}
        >
          <button
            className="disclosure"
            onClick={(event) => {
              event.stopPropagation()
              setExpandedBoards((current) => ({
                ...current,
                [item.id]: !current[item.id],
              }))
            }}
          >
            {expandedBoards[item.id] || hoverExpandedBoard === item.id ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
          <LayoutGrid size={16} className="tree-board-icon" />{' '}
          <span
            onDoubleClick={(event) => {
              event.stopPropagation()
              openBoardRename(item)
            }}
          >
            {item.name}
          </span>
          <b>{item.links.length}</b>
          <button
            className="sort-drag-handle"
            draggable
            data-drag-handle
            aria-label={`拖动看板 ${item.name}`}
            title="拖动调整看板顺序"
          >
            <GripVertical size={14} />
          </button>
        </div>
        {(expandedBoards[item.id] || hoverExpandedBoard === item.id) && (
          <BookmarkGroupTree
            board={item}
            activeGroupId={item.id === board.id ? activeGroupId : ''}
            dragItem={drag.item}
            dropTarget={drag.target}
            canDrop={canDrop}
            onTarget={drag.over}
            onLeave={drag.leave}
            onDragStart={(event, group) =>
              drag.start(
                event,
                { kind: 'group', boardId: item.id, id: group.id },
                `分组 · ${group.name}`,
              )
            }
            onDragEnd={drag.finish}
            onSelect={(groupId) => {
              setActiveBoardId(item.id)
              setActiveGroupId(groupId)
            }}
            onEdit={(group) => openGroupRename(group, item.id)}
            onContext={(event, group) => groupMenu(event, item, group)}
            onDrop={applyDrop}
          />
        )}
      </div>
      <DropGap
        target={{ kind: 'board', id: item.id, position: 'after' }}
        current={drag.target}
        enabled={
          drag.item?.kind === 'board' &&
          canDrop({ kind: 'board', id: item.id, position: 'after' })
        }
        onOver={drag.over}
        onLeave={drag.leave}
        onDrop={applyDrop}
      />
    </Fragment>
  )

  if (!board)
    return (
      <div className="empty-state">
        <Archive size={30} />
        <h2>还没有看板</h2>
        <p>导入浏览器书签或创建一个新的工作看板。</p>
        <button className="primary-button" onClick={() => addBoard()}>
          <Plus size={16} />
          创建看板
        </button>
      </div>
    )

  const openAddLink = (
    groupId = activeGroupId === 'all'
      ? (board.groups[0]?.id ?? '')
      : activeGroupId,
  ) => {
    setNewLink({ title: '', url: '', description: '', groupId })
    setShowQuickAdd(true)
  }
  const renderLink = (link: LinkItem) => (
    <Fragment key={link.id}>
      <DropGap
        target={{
          kind: 'link',
          boardId: board.id,
          id: link.id,
          position: 'before',
        }}
        current={drag.target}
        enabled={
          !!drag.item &&
          canDrop({
            kind: 'link',
            boardId: board.id,
            id: link.id,
            position: 'before',
          })
        }
        onOver={drag.over}
        onLeave={drag.leave}
        onDrop={applyDrop}
      />
      <div
        className={`link-select-row drag-sort-row ${selectedLinkIds.includes(link.id) ? 'selected' : ''} ${dropClassName(drag.target, { kind: 'link', boardId: board.id, id: link.id })}`}
        data-link-id={link.id}
        onDragOver={(event) => {
          const target = rowDropTarget(event, {
            kind: 'link',
            boardId: board.id,
            id: link.id,
          })
          drag.over(event, canDrop(target) ? target : null)
        }}
        onDragLeave={drag.leave}
        onDrop={(event) =>
          applyDrop(
            event,
            rowDropTarget(event, {
              kind: 'link',
              boardId: board.id,
              id: link.id,
            }),
          )
        }
      >
        {selectionMode && (
          <input
            type="checkbox"
            className="link-select-checkbox"
            checked={selectedLinkIds.includes(link.id)}
            onChange={() => toggleLinkSelection(link.id)}
            aria-label={`选择 ${link.title}`}
          />
        )}
        <LinkRow
          link={link}
          groupOptions={groupRows}
          isDragging={isSameDragItem(drag.item, {
            kind: 'link',
            id: link.id,
            boardId: board.id,
          })}
          onUpdate={(patch) =>
            updateBoard((current) => ({
              ...current,
              updatedAt: new Date().toISOString(),
              links: current.links.map((item) =>
                item.id === link.id ? { ...item, ...patch } : item,
              ),
            }))
          }
          onCopy={onCopy}
          onDelete={() => {
            updateBoard((current) => ({
              ...current,
              links: current.links.filter((item) => item.id !== link.id),
            }))
            setSelectedLinkIds((current) =>
              current.filter((id) => id !== link.id),
            )
            notify('链接已删除，可撤销')
          }}
          onMove={() => {
            setSelectedLinkIds(
              selectedLinkIds.includes(link.id) ? selectedLinkIds : [link.id],
            )
            setBatchTargetBoardId(board.id)
            setBatchTargetGroupId(link.groupId)
            setShowBatchMove(true)
          }}
          onDragStart={(event) =>
            drag.start(
              event,
              { kind: 'link', boardId: board.id, id: link.id },
              selectedLinkIds.includes(link.id) && selectedLinkIds.length > 1
                ? `选中的 ${selectedLinkIds.length} 条链接`
                : link.title,
            )
          }
          onDragEnd={drag.finish}
        />
      </div>
      <DropGap
        target={{
          kind: 'link',
          boardId: board.id,
          id: link.id,
          position: 'after',
        }}
        current={drag.target}
        enabled={
          !!drag.item &&
          canDrop({
            kind: 'link',
            boardId: board.id,
            id: link.id,
            position: 'after',
          })
        }
        onOver={drag.over}
        onLeave={drag.leave}
        onDrop={applyDrop}
      />
    </Fragment>
  )
  return (
    <div
      className="content-wrap bookmarks-page simple-workspace"
      onClickCapture={drag.suppressClick}
    >
      <div
        className={`workspace-grid ${directory.className}`}
        style={directory.style}
      >
        <aside
          className={`collection-sidebar ${drag.item ? 'is-dragging' : ''}`}
        >
          {directory.control}
          <div className="side-section-header">
            <span>
              <LayoutGrid size={17} />
              链接看板 <b>{boards.length}</b>
            </span>
            <button
              className="icon-button"
              onClick={openBoardAdd}
              aria-label="新建看板"
              title="新建看板"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="board-tree">
            {[
              ...categories,
              { id: '', name: '未分类', color: '#738a81', collapsed: false },
            ].map((category) => (
              <section
                key={category.id}
                className={`board-category ${!categories.length ? 'root-category' : ''}`}
              >
                {category.id || categories.length > 0 ? (
                  <div
                    className={`category-heading drag-sort-row ${dropClassName(drag.target, { kind: 'category', id: category.id })}`}
                    data-category-id={category.id}
                    onDragOver={(event) => {
                      const target: WorkspaceDropTarget =
                        drag.item?.kind === 'category'
                          ? rowDropTarget(event, {
                              kind: 'category',
                              id: category.id,
                            })
                          : {
                              kind: 'category',
                              id: category.id,
                              position: 'inside',
                            }
                      drag.over(event, canDrop(target) ? target : null)
                    }}
                    onDragLeave={drag.leave}
                    onDrop={(event) =>
                      applyDrop(
                        event,
                        drag.item?.kind === 'category'
                          ? rowDropTarget(event, {
                              kind: 'category',
                              id: category.id,
                            })
                          : {
                              kind: 'category',
                              id: category.id,
                              position: 'inside',
                            },
                      )
                    }
                  >
                    <button
                      onClick={() =>
                        category.id &&
                        setCategories((current) =>
                          current.map((item) =>
                            item.id === category.id
                              ? { ...item, collapsed: !item.collapsed }
                              : item,
                          ),
                        )
                      }
                      aria-expanded={!category.collapsed}
                    >
                      <ChevronDown size={13} />
                      {category.name}
                      <small>
                        {
                          boards.filter(
                            (item) => (item.categoryId ?? '') === category.id,
                          ).length
                        }
                      </small>
                    </button>
                    {category.id && (
                      <button
                        className="sort-drag-handle"
                        draggable
                        data-drag-handle
                        aria-label={`拖动分类 ${category.name}`}
                        onDragStart={(event) =>
                          drag.start(
                            event,
                            { kind: 'category', id: category.id },
                            category.name,
                          )
                        }
                        onDragEnd={drag.finish}
                      >
                        <GripVertical size={13} />
                      </button>
                    )}
                  </div>
                ) : null}
                {!category.collapsed &&
                  boards
                    .filter((item) => (item.categoryId ?? '') === category.id)
                    .map(renderBoard)}
              </section>
            ))}
          </div>
          <div className="directory-footer">
            <button className="toolbar-button" onClick={onImport}>
              <FileUp size={15} />
              导入书签
            </button>
            <button
              className="icon-button"
              aria-label="看板管理选项"
              onClick={(event) =>
                menu.open(event, [
                  { label: '新建看板', run: openBoardAdd },
                  { label: '整理看板与分类…', run: () => setOrganizing(true) },
                  { label: '导出全部书签 HTML', run: onExportAll },
                  { label: '备份与恢复…', run: onExportBackup },
                ])
              }
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
          {drag.item && (
            <div
              className="side-helper drag-status"
              role="status"
              aria-live="polite"
            >
              {dropHint}
            </div>
          )}
        </aside>
        <section className="board-stage">
          {menu.node}
          <header className="simple-stage-header">
            <div className="simple-stage-title">
              <LayoutGrid size={19} />
              <h1 onDoubleClick={() => openBoardRename()}>{board.name}</h1>
              <span>{board.links.length} 条链接</span>
            </div>
            <div className="simple-stage-actions">
              <button className="toolbar-button" onClick={() => openAddLink()}>
                <Plus size={16} />
                添加链接
              </button>
              <button
                className="icon-button"
                aria-label="看板选项"
                onClick={(event) =>
                  menu.open(event, [
                    { label: '编辑看板…', run: () => openBoardRename() },
                    { label: '添加分组', run: () => openGroupAdd() },
                    {
                      label: '管理分组…',
                      run: () => setOrganizingGroups(true),
                    },
                    {
                      label: '选择多个链接',
                      run: () => setSelectionMode(true),
                    },
                    { label: '导出当前看板 HTML', run: () => onExport(board) },
                    {
                      label: '删除看板',
                      run: requestDeleteBoard,
                      danger: true,
                      disabled: boards.length <= 1,
                    },
                  ])
                }
              >
                <MoreHorizontal size={20} />
              </button>
            </div>
          </header>
          {board.description && (
            <p className="simple-stage-description">{board.description}</p>
          )}
          {activeGroupRow && (
            <nav className="simple-breadcrumb" aria-label="当前分组路径">
              <button onClick={() => setActiveGroupId('all')}>全部链接</button>
              {[...activeGroupRow.ancestors, activeGroupRow.group.id].map(
                (id) => (
                  <span key={id}>
                    <ChevronRight size={12} />
                    <button
                      aria-current={
                        id === activeGroupId ? 'location' : undefined
                      }
                      onClick={() => setActiveGroupId(id)}
                    >
                      {board.groups.find((group) => group.id === id)?.name}
                    </button>
                  </span>
                ),
              )}
            </nav>
          )}
          {query && (
            <div className="simple-query-result">
              当前看板匹配 {visibleLinks.length} 条链接
              <button className="inline-control" onClick={clearFilters}>
                清除搜索
              </button>
            </div>
          )}
          {selectionMode && (
            <div
              className="simple-bulk-bar"
              role="toolbar"
              aria-label="批量管理链接"
            >
              <button
                className="selection-toggle"
                onClick={toggleSelectVisible}
              >
                {visibleLinks.length &&
                visibleLinks.every((link) => selectedLinkIds.includes(link.id))
                  ? '取消全选'
                  : '选择当前'}
                <span>已选 {selectedLinkIds.length}</span>
              </button>
              <button
                className="toolbar-button"
                disabled={!selectedLinkIds.length}
                onClick={openBatchMove}
              >
                移动…
              </button>
              <button
                className="toolbar-button"
                disabled={!selectedLinkIds.length}
                onClick={() =>
                  onExportSelection(selectBookmarks([board], selectedLinkIds))
                }
              >
                导出
              </button>
              <button
                className="toolbar-button danger-action"
                disabled={!selectedLinkIds.length}
                onClick={batchDelete}
              >
                删除
              </button>
              <button
                className="icon-button"
                aria-label="退出选择"
                onClick={() => {
                  setSelectionMode(false)
                  setSelectedLinkIds([])
                }}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {visibleLinks.length || !hasActiveFilters ? (
            <BookmarkPanels
              board={board}
              links={visibleLinks}
              groups={board.groups.filter(
                (group) =>
                  activeGroupId === 'all' || activeGroupIds.has(group.id),
              )}
              search={query}
              renderLink={renderLink}
              onEdit={(group) => openGroupRename(group)}
              onContext={(event, group) => groupMenu(event, board, group)}
              onAdd={openAddLink}
              dragItem={drag.item}
              dropTarget={drag.target}
              canDrop={canDrop}
              onTarget={drag.over}
              onLeave={drag.leave}
              onDrop={applyDrop}
              onDragStart={(event, group) =>
                drag.start(
                  event,
                  { kind: 'group', boardId: board.id, id: group.id },
                  group.name,
                )
              }
              onDragEnd={drag.finish}
            />
          ) : (
            <div className="empty-board">
              <Search size={24} />
              <h3>没有匹配的链接</h3>
              <button className="ghost-button" onClick={clearFilters}>
                清除筛选
              </button>
            </div>
          )}
          <button className="add-group-inline" onClick={() => openGroupAdd()}>
            <Plus size={16} />
            添加分组
          </button>
          {drag.item && (
            <p className="folder-drop-path" role="status">
              {dropHint}
            </p>
          )}
        </section>
      </div>
      {showQuickAdd && (
        <Modal title="添加链接" onClose={() => setShowQuickAdd(false)}>
          <div className="form-stack">
            <label>
              链接名称
              <input
                value={newLink.title}
                onChange={(event) =>
                  setNewLink((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) addLink()
                }}
                placeholder="例如：Kubernetes 文档"
                autoFocus
              />
            </label>
            <label>
              网址
              <input
                value={newLink.url}
                onChange={(event) =>
                  setNewLink((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
                placeholder="https://"
              />
            </label>
            <label>
              备注
              <textarea
                value={newLink.description}
                onChange={(event) =>
                  setNewLink((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                placeholder="可选"
              />
            </label>
            <label>
              所属分组
              <select
                value={newLink.groupId || board.groups[0]?.id}
                onChange={(event) =>
                  setNewLink((current) => ({
                    ...current,
                    groupId: event.target.value,
                  }))
                }
              >
                {groupRows.map(({ group, path }) => (
                  <option value={group.id} key={group.id}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setShowQuickAdd(false)}
              >
                取消
              </button>
              <button className="primary-button" onClick={addLink}>
                保存链接
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showGroupAdd && (
        <Modal title="添加分组" onClose={() => setShowGroupAdd(false)}>
          <div className="form-stack">
            <label>
              分组名称
              <input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) addGroup()
                }}
                placeholder="例如：集群排障"
                autoFocus
              />
            </label>
            <label>
              分组颜色
              <ColorPicker value={newGroupColor} onChange={setNewGroupColor} />
            </label>
            <label>
              上级分组
              <select
                value={newGroupParentId}
                onChange={(event) => setNewGroupParentId(event.target.value)}
              >
                <option value="">看板根目录</option>
                {bookmarkGroupRows(
                  boards.find((item) => item.id === newGroupBoardId)?.groups ??
                    [],
                ).map(({ group, path }) => (
                  <option value={group.id} key={group.id}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-hint">
              选择上级分组即可新建子分组，目录可以继续嵌套。
            </p>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setShowGroupAdd(false)}
              >
                取消
              </button>
              <button className="primary-button" onClick={addGroup}>
                保存分组
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showBoardAdd && (
        <Modal title="新建书签看板" onClose={() => setShowBoardAdd(false)}>
          <div className="form-stack">
            <label>
              看板名称
              <input
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
                placeholder="例如：前端开发"
                autoFocus
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) createBoard()
                }}
              />
            </label>
            <p className="form-hint">
              创建后会自动打开新看板，并附带一个“未分组”分组。
            </p>
            <label>
              所属分类
              <select
                value={newBoardCategory}
                onChange={(event) => setNewBoardCategory(event.target.value)}
              >
                <option value="">未分类</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setShowBoardAdd(false)}
              >
                取消
              </button>
              <button className="primary-button" onClick={createBoard}>
                <Save size={14} />
                创建看板
              </button>
            </div>
          </div>
        </Modal>
      )}
      {organizingGroups && (
        <GroupOrganizer
          board={board}
          boards={boards}
          setBoards={setBoards}
          onClose={() => setOrganizingGroups(false)}
          onExport={onExport}
        />
      )}
      {organizing && (
        <BoardOrganizer
          boards={boards}
          categories={categories}
          setBoards={setBoards}
          setCategories={setCategories}
          onClose={() => setOrganizing(false)}
          onExport={onExportSelection}
        />
      )}
      {promoting && (
        <Modal title="分组独立为看板" onClose={() => setPromoting(null)}>
          <div className="form-stack">
            <label>
              看板名称
              <input
                autoFocus
                value={promoting.name}
                onChange={(event) =>
                  setPromoting({ ...promoting, name: event.target.value })
                }
              />
            </label>
            <label>
              所属分类
              <select
                value={promoting.categoryId}
                onChange={(event) =>
                  setPromoting({ ...promoting, categoryId: event.target.value })
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
            <label>
              操作
              <select
                value={promoting.copy ? 'copy' : 'move'}
                onChange={(event) =>
                  setPromoting({
                    ...promoting,
                    copy: event.target.value === 'copy',
                  })
                }
              >
                <option value="move">移动：从原看板移出，保留原 ID</option>
                <option value="copy">复制：原看板不变，副本使用新 ID</option>
              </select>
            </label>
            <p className="form-hint">
              包含全部子目录、链接、备注、颜色和顺序。
            </p>
            <button
              className="primary-button"
              disabled={!promoting.name.trim()}
              onClick={() => {
                const result = independentGroup(
                  promoting.board,
                  promoting.groupId,
                  { ...promoting, name: promoting.name.trim() },
                )
                setBoards((current) => [
                  ...current.map((item) =>
                    item.id === result.source.id ? result.source : item,
                  ),
                  result.board,
                ])
                setActiveBoardId(result.board.id)
                setActiveGroupId('all')
                setPromoting(null)
              }}
            >
              确认创建
            </button>
          </div>
        </Modal>
      )}
      {editingBoardId && boards.find((item) => item.id === editingBoardId) && (
        <Modal title="重命名书签看板" onClose={() => setEditingBoardId(null)}>
          <div className="form-stack">
            <label>
              看板名称
              <input
                autoFocus
                value={boardNameDraft}
                onChange={(event) => setBoardNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) renameBoard()
                }}
                placeholder="例如：产品资料"
              />
            </label>
            <label>
              看板备注
              <input
                value={boardDescriptionDraft}
                onChange={(event) =>
                  setBoardDescriptionDraft(event.target.value)
                }
              />
            </label>
            <label>
              所属分类
              <select
                value={boardCategoryDraft}
                onChange={(event) => setBoardCategoryDraft(event.target.value)}
              >
                <option value="">未分类</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setEditingBoardId(null)}
              >
                取消
              </button>
              <button className="primary-button" onClick={renameBoard}>
                <Save size={14} />
                保存名称
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editingGroupId && editingGroupBoardId && (
        <Modal
          title="编辑分组"
          onClose={() => {
            setEditingGroupId(null)
            setEditingGroupBoardId(null)
          }}
        >
          <div className="form-stack">
            <label>
              分组名称
              <input
                autoFocus
                value={groupNameDraft}
                onChange={(event) => setGroupNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (isCommittedEnter(event)) renameGroup()
                }}
              />
            </label>
            <label>
              备注
              <input
                value={groupDescriptionDraft}
                onChange={(event) =>
                  setGroupDescriptionDraft(event.target.value)
                }
              />
            </label>
            <label>
              分组颜色
              <ColorPicker
                value={groupColorDraft}
                onChange={setGroupColorDraft}
              />
            </label>
            <label>
              上级分组
              <select
                value={groupParentDraft}
                onChange={(event) => setGroupParentDraft(event.target.value)}
              >
                <option value="">看板根目录</option>
                {bookmarkGroupRows(
                  boards.find((item) => item.id === editingGroupBoardId)
                    ?.groups ?? [],
                )
                  .filter(
                    (row) =>
                      row.group.id !== editingGroupId &&
                      !row.ancestors.includes(editingGroupId),
                  )
                  .map(({ group, path }) => (
                    <option value={group.id} key={group.id}>
                      {path}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="ghost-button"
              onClick={() => {
                const target = boards.find(
                  (item) => item.id === editingGroupBoardId,
                )
                if (target && editingGroupId) {
                  promote(target, editingGroupId)
                  setEditingGroupId(null)
                }
              }}
            >
              独立为新看板…
            </button>
            <p className="form-hint">
              调整上级分组时，所有子分组及链接会一起保留。
            </p>
            <div className="folder-editor-extra">
              <button
                className="toolbar-button"
                onClick={() => {
                  const target = boards.find(
                    (item) => item.id === editingGroupBoardId,
                  )
                  setEditingGroupId(null)
                  setEditingGroupBoardId(null)
                  openGroupAdd(target, editingGroupId)
                }}
              >
                <Plus size={14} />
                新建子分组
              </button>
              <button
                className="toolbar-button danger-action"
                onClick={() => {
                  const group = boards
                    .find((item) => item.id === editingGroupBoardId)
                    ?.groups.find((item) => item.id === editingGroupId)
                  if (group) {
                    requestDeleteGroup(group, editingGroupBoardId)
                    setEditingGroupId(null)
                    setEditingGroupBoardId(null)
                  }
                }}
              >
                <Trash2 size={14} />
                删除分组
              </button>
            </div>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  setEditingGroupId(null)
                  setEditingGroupBoardId(null)
                }}
              >
                取消
              </button>
              <button className="primary-button" onClick={renameGroup}>
                <Save size={14} />
                保存分组
              </button>
            </div>
          </div>
        </Modal>
      )}
      {deletingBoardId &&
        boards.find((item) => item.id === deletingBoardId) && (
          <Modal title="删除书签看板" onClose={() => setDeletingBoardId(null)}>
            <div className="confirm-content">
              <div className="confirm-icon danger">
                <Trash2 size={18} />
              </div>
              <p>
                确定删除“
                {boards.find((item) => item.id === deletingBoardId)?.name}
                ”吗？该看板中的链接也会一起移除。
              </p>
              <div className="modal-actions">
                <button
                  className="ghost-button"
                  onClick={() => setDeletingBoardId(null)}
                >
                  取消
                </button>
                <button
                  className="primary-button danger-button"
                  onClick={deleteBoard}
                >
                  <Trash2 size={14} />
                  确认删除
                </button>
              </div>
            </div>
          </Modal>
        )}
      {deletingGroupId &&
        deletingGroupBoardId &&
        boards.find((item) => item.id === deletingGroupBoardId) && (
          <Modal
            title="删除书签分组"
            onClose={() => {
              setDeletingGroupId(null)
              setDeletingGroupBoardId(null)
            }}
          >
            <div className="confirm-content">
              <div className="confirm-icon danger">
                <Trash2 size={18} />
              </div>
              <p>
                确定删除“
                {
                  boards
                    .find((item) => item.id === deletingGroupBoardId)
                    ?.groups.find((group) => group.id === deletingGroupId)?.name
                }
                ”吗？直属链接会移到上级或其他分组；子分组提升一级，内部链接和目录均保留。
              </p>
              <div className="modal-actions">
                <button
                  className="ghost-button"
                  onClick={() => {
                    setDeletingGroupId(null)
                    setDeletingGroupBoardId(null)
                  }}
                >
                  取消
                </button>
                <button
                  className="primary-button danger-button"
                  onClick={deleteGroup}
                >
                  <Trash2 size={14} />
                  确认删除
                </button>
              </div>
            </div>
          </Modal>
        )}
      {showBatchMove && batchTargetBoard && (
        <Modal
          title={`批量移动 ${selectedLinkIds.length} 条链接`}
          onClose={() => setShowBatchMove(false)}
        >
          <div className="form-stack">
            <label>
              目标看板
              <select
                value={batchTargetBoardId}
                onChange={(event) => {
                  const nextBoard = boards.find(
                    (item) => item.id === event.target.value,
                  )
                  setBatchTargetBoardId(event.target.value)
                  setBatchTargetGroupId(nextBoard?.groups[0]?.id ?? '')
                }}
              >
                {boards.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              目标分组
              <select
                value={batchTargetGroupId}
                onChange={(event) => setBatchTargetGroupId(event.target.value)}
              >
                {batchTargetBoard.groups.length ? (
                  bookmarkGroupRows(batchTargetBoard.groups).map(
                    ({ group, path }) => (
                      <option value={group.id} key={group.id}>
                        {path}
                      </option>
                    ),
                  )
                ) : (
                  <option value="">自动创建“未分组”</option>
                )}
              </select>
            </label>
            <p className="form-hint">链接会保留名称、地址和备注。</p>
            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => setShowBatchMove(false)}
              >
                取消
              </button>
              <button className="primary-button" onClick={batchMove}>
                <Folder size={14} />
                确认移动
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
