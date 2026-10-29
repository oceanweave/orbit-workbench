import { bookmarkDescendantIds } from './bookmarks.mjs'
import { uniqueEnvName, kubePathKey } from './kubeconfig.mjs'

const array = (value) => Array.isArray(value)
const text = (value) => typeof value === 'string'
const object = (value) => value && typeof value === 'object' && !array(value)
const assert = (value, message) => {
  if (!value) throw new Error(message)
}
const strings = (value) => array(value) && value.every(text)
function ids(items, label) {
  assert(
    array(items) && items.every((item) => object(item) && text(item.id) && item.id.length > 0),
    `${label}结构不正确`,
  )
  assert(new Set(items.map((item) => item.id)).size === items.length, `${label}存在重复 ID`)
  return new Set(items.map((item) => item.id))
}

export function validateBackup(input) {
  assert(object(input) && [1, 2].includes(input.version), '不支持的备份版本（支持 1 / 2）')
  // Reject dangerous keys before any merge into application state.
  const visit = (value, depth = 0) => {
    assert(depth < 100, '备份嵌套过深（最多 99 层）')
    if (object(value) || array(value))
      for (const [key, child] of Object.entries(value)) {
        assert(!['__proto__', 'prototype', 'constructor'].includes(key), '备份包含不安全字段')
        visit(child, depth + 1)
      }
  }
  visit(input)
  assert(input.boards || input.commandLibrary || input.kubeConfigs, '备份中没有可恢复的数据')
  const categoryIds = input.categories ? ids(input.categories, '看板分类') : new Set()
  if (input.categories)
    assert(
      input.categories.every((item) => text(item.name)),
      '分类名称无效',
    )
  if (input.boards) {
    ids(input.boards, '看板')
    for (const board of input.boards) {
      assert(
        text(board.name) && text(board.description) && strings(board.tags) && text(board.updatedAt),
        '看板字段不完整',
      )
      if (board.categoryId) assert(categoryIds.has(board.categoryId), '看板引用了不存在的分类')
      const groupIds = ids(board.groups, '分组')
      ids(board.links, '链接')
      for (const group of board.groups) {
        assert(text(group.name) && text(group.color), '分组字段不完整')
        const visited = new Set([group.id])
        let parent = group.parentId
        while (parent) {
          assert(groupIds.has(parent) && !visited.has(parent), '分组引用无效或存在循环')
          visited.add(parent)
          parent = board.groups.find((item) => item.id === parent)?.parentId
          assert(visited.size <= 100, '分组层级超过 100 层')
        }
      }
      for (const link of board.links)
        assert(
          text(link.title) &&
            text(link.url) &&
            strings(link.tags) &&
            text(link.addedAt) &&
            groupIds.has(link.groupId),
          '链接字段不完整或引用了不存在的分组',
        )
    }
  }
  if (input.kubeGroups) {
    ids(input.kubeGroups, '环境分组')
    assert(
      input.kubeGroups.every((item) => text(item.name) && text(item.color)),
      '环境分组字段不完整',
    )
  }
  if (input.kubeConfigs) {
    ids(input.kubeConfigs, '配置')
    const groups = new Set((input.kubeGroups ?? []).map((item) => item.id))
    for (const item of input.kubeConfigs)
      assert(
        text(item.name) &&
          text(item.path) &&
          text(item.context) &&
          strings(item.tags) &&
          groups.has(item.groupId) &&
          (item.content === undefined || text(item.content)),
        '配置字段或分组引用无效',
      )
  }
  if (input.commandLibrary) {
    const library = input.commandLibrary
    assert(library.version === 1, '不支持的命令库版本')
    const groups = ids(library.groups, '命令分组')
    ids(library.snippets, '命令')
    assert(
      library.groups.every((item) => text(item.name) && text(item.color)),
      '命令分组字段不完整',
    )
    for (const item of library.snippets)
      assert(
        text(item.name) &&
          text(item.content) &&
          text(item.description) &&
          ['bash', 'powershell', 'sql', 'python', 'javascript', 'yaml', 'json', 'text'].includes(
            item.language,
          ) &&
          (!item.groupId || groups.has(item.groupId)),
        '命令字段或分组引用无效',
      )
  }
  if (input.kubeCommands) {
    ids(input.kubeCommands, '命令模板')
    assert(
      input.kubeCommands.every(
        (item) => text(item.name) && text(item.command) && text(item.description),
      ),
      '命令模板字段无效',
    )
  }
  return input
}

export function selectBookmarks(boards, selection) {
  const selected = new Set(selection)
  return boards.flatMap((board) => {
    if (selected.has(board.id)) return [structuredClone(board)]
    const groups = new Set()
    for (const group of board.groups)
      if (selected.has(group.id))
        for (const id of bookmarkDescendantIds(board.groups, group.id)) groups.add(id)
    const links = board.links.filter((link) => selected.has(link.id) || groups.has(link.groupId))
    for (const link of links) groups.add(link.groupId)
    for (const id of [...groups]) {
      let group = board.groups.find((item) => item.id === id)
      while (group?.parentId) {
        groups.add(group.parentId)
        group = board.groups.find((item) => item.id === group.parentId)
      }
    }
    return links.length || groups.size
      ? [
          {
            ...structuredClone(board),
            groups: board.groups.filter((group) => groups.has(group.id)),
            links: structuredClone(links),
          },
        ]
      : []
  })
}

export function copyBoards(boards) {
  return boards.map((board) => {
    const groups = new Map(board.groups.map((group) => [group.id, crypto.randomUUID()]))
    return {
      ...structuredClone(board),
      id: crypto.randomUUID(),
      groups: board.groups.map((group) => ({
        ...group,
        id: groups.get(group.id),
        parentId: groups.get(group.parentId),
      })),
      links: board.links.map((link) => ({
        ...link,
        id: crypto.randomUUID(),
        tags: [...link.tags],
        groupId: groups.get(link.groupId),
      })),
    }
  })
}

export function independentGroup(board, groupId, { name, categoryId, copy = false }) {
  const selected = selectBookmarks([board], [groupId])[0]
  assert(selected, '分组不存在')
  const subtree = bookmarkDescendantIds(board.groups, groupId)
  // Ancestors are useful in selection export; a promoted group starts at root.
  let promoted = {
    ...selected,
    id: crypto.randomUUID(),
    name,
    categoryId,
    groups: selected.groups
      .filter((item) => subtree.has(item.id))
      .map((item) => ({ ...item, parentId: item.id === groupId ? undefined : item.parentId })),
    updatedAt: new Date().toISOString(),
  }
  if (copy) promoted = copyBoards([promoted])[0]
  return {
    board: promoted,
    source: copy
      ? board
      : {
          ...board,
          groups: board.groups.filter((item) => !subtree.has(item.id)),
          links: board.links.filter((item) => !subtree.has(item.groupId)),
        },
  }
}

export function mergeBackup(current, imported) {
  validateBackup(imported)
  const next = { ...current }
  if (imported.boards) {
    const categories = new Map(
      (imported.categories ?? []).map((item) => [item.id, crypto.randomUUID()]),
    )
    next.categories = [
      ...(current.categories ?? []),
      ...(imported.categories ?? []).map((item) => ({ ...item, id: categories.get(item.id) })),
    ]
    next.boards = [
      ...(current.boards ?? []),
      ...copyBoards(imported.boards).map((item) => ({
        ...item,
        categoryId: categories.get(item.categoryId),
      })),
    ]
  }
  if (imported.commandLibrary) {
    const groups = new Map(
      imported.commandLibrary.groups.map((item) => [item.id, crypto.randomUUID()]),
    )
    next.commandLibrary = {
      version: 1,
      groups: [
        ...(current.commandLibrary?.groups ?? []),
        ...imported.commandLibrary.groups.map((item) => ({ ...item, id: groups.get(item.id) })),
      ],
      snippets: [
        ...(current.commandLibrary?.snippets ?? []),
        ...imported.commandLibrary.snippets.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          groupId: groups.get(item.groupId) ?? '',
        })),
      ],
    }
  }
  if (imported.kubeConfigs) {
    const groups = new Map(
      (imported.kubeGroups ?? []).map((item) => [item.id, crypto.randomUUID()]),
    )
    next.kubeGroups = [
      ...(current.kubeGroups ?? []),
      ...(imported.kubeGroups ?? []).map((item) => ({ ...item, id: groups.get(item.id) })),
    ]
    const paths = new Set((current.kubeConfigs ?? []).map((item) => kubePathKey(item.path)))
    const names = new Set(
      (current.kubeConfigs ?? []).map((item) => item.envName || item.name.toUpperCase()),
    )
    next.kubeConfigs = [
      ...(current.kubeConfigs ?? []),
      ...imported.kubeConfigs
        .filter((item) => {
          const key = kubePathKey(item.path)
          if (paths.has(key)) return false
          paths.add(key)
          return true
        })
        .map((item) => ({
          ...item,
          envName: uniqueEnvName(item.envName || item.name, names),
          id: crypto.randomUUID(),
          groupId: groups.get(item.groupId),
        })),
    ]
  }
  if (imported.kubeCommands)
    next.kubeCommands = [
      ...(current.kubeCommands ?? []),
      ...imported.kubeCommands.map((item) => ({ ...item, id: crypto.randomUUID() })),
    ]
  return next
}
