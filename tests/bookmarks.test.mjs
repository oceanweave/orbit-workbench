import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bookmarkGroupRows, bookmarkGroupPath, bookmarkDescendantIds, reparentBookmarkGroup, deleteBookmarkGroup, moveBookmarkLinks, placeBookmarkGroup, placeBookmarkLink, createBrowserBookmarksHtml, parseBookmarksHtml, bookmarkSearchBoard } from '../shared/bookmarks.mjs'

const document = (html) => new JSDOM(html).window.document
const fixture = () => ({ id: 'board', name: '多层书签', description: '', tags: [], updatedAt: '2026-10-26',
  groups: [
    { id: 'root', name: '工程', color: '#6f8cff' },
    { id: 'child', name: '后端', parentId: 'root', color: '#44c7a5' },
    { id: 'grandchild', name: 'Kubernetes', parentId: 'child', color: '#f2ab55' },
    { id: 'deep', name: '排障', parentId: 'grandchild', color: '#c486ff' },
    { id: 'sibling', name: '工具', color: '#6f8cff' },
    { id: 'same-name', name: '工具', parentId: 'child', color: '#6f8cff' },
    { id: 'empty', name: '空目录', parentId: 'deep', color: '#6f8cff' },
  ],
  links: ['root', 'child', 'grandchild', 'deep', 'sibling', 'same-name'].map((groupId, index) => ({ id: `link-${index}`, title: `链接 ${index} & <示例>`, url: `https://demo.invalid/${index}?a=1&b=2`, groupId, tags: [], addedAt: '2026-10-26T00:00:00Z' })),
})
const snapshot = (board) => ({ folders: bookmarkGroupRows(board.groups).map((row) => row.path).sort(), links: board.links.map((link) => ({ title: link.title, url: link.url, path: bookmarkGroupPath(board.groups, link.groupId) })).sort((a, b) => a.url.localeCompare(b.url)) })

test('existing flat groups remain roots; arbitrary nesting retains order, full paths and descendants', () => {
  const board = fixture()
  assert.deepEqual(bookmarkGroupRows(board.groups).map((row) => row.depth), [0, 1, 2, 3, 4, 2, 0])
  assert.equal(bookmarkGroupPath(board.groups, 'deep'), '工程 / 后端 / Kubernetes / 排障')
  assert.deepEqual([...bookmarkDescendantIds(board.groups, 'grandchild')], ['grandchild', 'deep', 'empty'])
  assert.ok(bookmarkGroupRows([{ id: 'old', name: '旧分组' }]).every((row) => row.depth === 0))
})

test('Netscape HTML round trip preserves deep folders, same-name branches, empty folders and link ownership', () => {
  const original = fixture()
  const html = createBrowserBookmarksHtml([original])
  const [imported] = parseBookmarksHtml(html, document)
  assert.equal(imported.name, original.name)
  assert.deepEqual(snapshot(imported), snapshot(original))
  assert.equal(imported.groups.length, original.groups.length)
  assert.equal(imported.links.length, original.links.length)
})

test('twenty-four nested folders round trip without a fixed depth limit', () => {
  const board = { ...fixture(), groups: Array.from({ length: 24 }, (_, index) => ({ id: `depth-${index}`, name: `第${index + 1}层`, color: '#6f8cff', ...(index ? { parentId: `depth-${index - 1}` } : {}) })), links: [{ ...fixture().links[0], groupId: 'depth-23' }] }
  const [restored] = parseBookmarksHtml(createBrowserBookmarksHtml([board]), document)
  assert.deepEqual(snapshot(restored), snapshot(board))
  assert.equal(bookmarkGroupRows(restored.groups).at(-1).depth, 23)
})

test('standard unclosed Chrome/Firefox DT tags keep parent-direct links out of sibling folders', () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
  <DT><H3>导入看板</H3><DL><p>
    <DT><A HREF="https://demo.invalid/root">直属链接</A>
    <DT><H3>父分组</H3><DL><p>
      <DT><H3>子分组</H3><DL><p><DT><A HREF="https://demo.invalid/deep">深层链接</A></DL><p>
      <DT><A HREF="https://demo.invalid/parent">父层链接</A>
    </DL><p>
    <DT><H3>空分组</H3><DL><p></DL><p>
  </DL><p></DL><p>`
  const [board] = parseBookmarksHtml(html, document)
  const owner = (title) => bookmarkGroupPath(board.groups, board.links.find((link) => link.title === title).groupId)
  assert.equal(owner('深层链接'), '父分组 / 子分组')
  assert.equal(owner('父层链接'), '父分组')
  assert.equal(owner('直属链接'), '未分组')
  assert.ok(board.groups.some((group) => group.name === '空分组'))
})

test('sibling DL exports and top-level loose links are imported without loss', () => {
  const html = '<DL><DT><H3>Board</H3></DT><DL><DT><H3>A</H3></DT><DL><DT><H3>B</H3></DT><DL><DT><A HREF="https://demo.invalid/deep">Deep</A></DT></DL></DL></DL><DT><A HREF="https://demo.invalid/loose">Loose</A></DT></DL>'
  const boards = parseBookmarksHtml(html, document)
  assert.equal(boards.length, 2)
  assert.equal(bookmarkGroupPath(boards[0].groups, boards[0].links[0].groupId), 'A / B')
  assert.equal(boards[1].links[0].title, 'Loose')
})

test('moving a folder retains its whole subtree and rejects self/descendant cycles', () => {
  const original = fixture()
  assert.throws(() => reparentBookmarkGroup(original, 'root', 'deep'), /自己的子分组/)
  assert.throws(() => reparentBookmarkGroup(original, 'child', 'child'), /自己/)
  const moved = reparentBookmarkGroup(original, 'child', 'sibling')
  assert.equal(bookmarkGroupPath(moved.groups, 'deep'), '工具 / 后端 / Kubernetes / 排障')
  assert.deepEqual(moved.links, original.links)
  assert.equal(original.groups.find((group) => group.id === 'child').parentId, 'root')
  const top = reparentBookmarkGroup(moved, 'child', '')
  assert.equal(bookmarkGroupPath(top.groups, 'deep'), '后端 / Kubernetes / 排障')
})

test('deleting a middle folder promotes children, migrates direct links and leaves no dangling references', () => {
  const board = deleteBookmarkGroup(fixture(), 'child')
  assert.equal(bookmarkGroupPath(board.groups, 'deep'), '工程 / Kubernetes / 排障')
  assert.equal(board.links.find((link) => link.id === 'link-1').groupId, 'root')
  assert.equal(board.links.length, fixture().links.length)
  assert.ok(board.groups.every((group) => !group.parentId || board.groups.some((parent) => parent.id === group.parentId)))
  assert.ok(board.links.every((link) => board.groups.some((group) => group.id === link.groupId)))
})

test('root deletion and the last folder deletion preserve all links and descendants', () => {
  const board = deleteBookmarkGroup(fixture(), 'root')
  assert.equal(bookmarkGroupPath(board.groups, 'deep'), '后端 / Kubernetes / 排障')
  assert.equal(board.links.length, fixture().links.length)
  const last = deleteBookmarkGroup({ ...fixture(), groups: [fixture().groups[0]], links: [fixture().links[0]] }, 'root')
  assert.equal(last.groups.length, 1)
  assert.equal(last.links[0].groupId, last.groups[0].id)
})

test('damaged parent references or cycles never hide folders or break export', () => {
  const groups = [{ id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' }, { id: 'c', name: 'C', parentId: 'missing' }]
  assert.equal(bookmarkGroupRows(groups).length, 3)
  assert.equal(new Set(bookmarkGroupRows(groups).map((row) => row.group.id)).size, 3)
  assert.equal(parseBookmarksHtml(createBrowserBookmarksHtml([{ ...fixture(), groups, links: [] }]), document)[0].groups.length, 3)
})

test('copying search results preserves ancestor folders, handles repeated names and never changes original links', () => {
  const board = fixture()
  const before = JSON.stringify(board)
  const copied = bookmarkSearchBoard([board.links[3], board.links[5]].map((link) => ({ board, link })), '搜索副本')
  assert.equal(JSON.stringify(board), before)
  assert.deepEqual(copied.links.map((link) => bookmarkGroupPath(copied.groups, link.groupId)), ['多层书签 / 工程 / 后端 / Kubernetes / 排障', '多层书签 / 工程 / 后端 / 工具'])
  assert.ok(copied.links.every((link) => !board.links.some((source) => source.id === link.id)))
})

test('single and batch link moves target deep folders within and across boards without changing folder trees', () => {
  const source = fixture()
  const target = { ...fixture(), id: 'target', links: [] }
  const within = moveBookmarkLinks([source], source.id, ['link-0'], source.id, 'deep')
  assert.equal(within.boards[0].links.find((link) => link.id === 'link-0').groupId, 'deep')
  assert.equal(within.boards[0].links.length, source.links.length)
  const cross = moveBookmarkLinks([source, target], source.id, ['link-0', 'link-1'], target.id, 'empty')
  assert.equal(cross.boards[0].links.length, source.links.length - 2)
  assert.ok(cross.boards[1].links.every((link) => link.groupId === 'empty'))
  assert.deepEqual(cross.boards[1].groups, target.groups)
  assert.equal(source.links[0].groupId, 'root')
  assert.throws(() => moveBookmarkLinks([source], source.id, ['link-0'], source.id, 'missing'), /分组不存在/)
  const empty = moveBookmarkLinks([source, { ...target, groups: [] }], source.id, ['link-0'], target.id)
  assert.equal(empty.boards[1].groups[0].id, empty.boards[1].links[0].groupId)
})

test('folder edge drops reorder siblings and retain the complete subtree', () => {
  const original = fixture()
  const before = JSON.stringify(original)
  const [first] = placeBookmarkGroup([original], original.id, 'sibling', original.id, 'root', 'before')
  assert.deepEqual(bookmarkGroupRows(first.groups).filter((row) => !row.parentId).map((row) => row.group.id), ['sibling', 'root'])
  const [last] = placeBookmarkGroup([first], first.id, 'sibling', first.id, 'root', 'after')
  assert.equal(bookmarkGroupRows(last.groups).at(-1).group.id, 'sibling')
  const [child] = placeBookmarkGroup([original], original.id, 'same-name', original.id, 'grandchild', 'before')
  assert.equal(child.groups.find((group) => group.id === 'same-name').parentId, 'child')
  assert.deepEqual(bookmarkGroupRows(child.groups).filter((row) => row.parentId === 'child').map((row) => row.group.id), ['same-name', 'grandchild'])
  assert.deepEqual(child.links, original.links)
  assert.equal(JSON.stringify(original), before)
})

test('middle drops nest folders and board drops promote them to the root', () => {
  const original = fixture()
  const [nested] = placeBookmarkGroup([original], original.id, 'sibling', original.id, 'deep')
  assert.equal(bookmarkGroupPath(nested.groups, 'sibling'), '工程 / 后端 / Kubernetes / 排障 / 工具')
  const [top] = placeBookmarkGroup([nested], nested.id, 'grandchild', nested.id)
  assert.equal(bookmarkGroupPath(top.groups, 'deep'), 'Kubernetes / 排障')
  assert.equal(bookmarkGroupPath(top.groups, 'sibling'), 'Kubernetes / 排障 / 工具')
  assert.equal(top.links.length, original.links.length)
  for (const position of ['before', 'after', 'inside']) {
    assert.throws(() => placeBookmarkGroup([original], original.id, 'child', original.id, 'empty', position), /子分组/)
    assert.throws(() => placeBookmarkGroup([original], original.id, 'child', original.id, 'child', position), /自己/)
  }
})

test('cross-board folder drops move all descendants and links, including into an empty board', () => {
  const source = fixture()
  const target = { ...fixture(), id: 'destination', name: '目标', groups: [{ id: 'target-root', name: '收藏' }], links: [] }
  const [remaining, moved] = placeBookmarkGroup([source, target], source.id, 'child', target.id, 'target-root')
  assert.equal(bookmarkGroupPath(moved.groups, 'empty'), '收藏 / 后端 / Kubernetes / 排障 / 空目录')
  const subtree = bookmarkDescendantIds(source.groups, 'child')
  assert.ok(remaining.groups.every((group) => !subtree.has(group.id)))
  assert.ok(remaining.links.every((link) => !subtree.has(link.groupId)))
  assert.equal(remaining.links.length + moved.links.length, source.links.length)
  const result = placeBookmarkGroup([remaining, moved, { ...target, id: 'empty', groups: [] }], moved.id, 'child', 'empty')
  assert.equal(bookmarkGroupPath(result[2].groups, 'deep'), '后端 / Kubernetes / 排障')
  const restored = parseBookmarksHtml(createBrowserBookmarksHtml(result), document)
  assert.deepEqual(snapshot(restored[2]), snapshot(result[2]))
  assert.throws(() => placeBookmarkGroup([source, target], source.id, 'child', target.id, 'missing'), /目标分组不存在/)
})

test('link row drops preserve manual order and adopt the exact target group without changing hidden rows', () => {
  const original = fixture()
  const [before] = placeBookmarkLink([original], original.id, 'link-5', original.id, 'link-2', 'before')
  assert.deepEqual(before.links.map((link) => link.id), ['link-0', 'link-1', 'link-5', 'link-2', 'link-3', 'link-4'])
  assert.equal(before.links.find((link) => link.id === 'link-5').groupId, 'grandchild')
  const [after] = placeBookmarkLink([original], original.id, 'link-0', original.id, 'link-5', 'after')
  assert.equal(after.links.at(-1).id, 'link-0')
  assert.equal(after.links.at(-1).groupId, 'same-name')
  const target = { ...original, id: 'target', links: [{ ...original.links[0], id: 'target-link', groupId: 'deep' }] }
  const [source, destination] = placeBookmarkLink([original, target], original.id, 'link-3', target.id, 'target-link', 'after')
  assert.equal(source.links.length, original.links.length - 1)
  assert.deepEqual(destination.links.map((link) => link.id), ['target-link', 'link-3'])
  assert.equal(destination.links[1].groupId, 'deep')
  assert.throws(() => placeBookmarkLink([original], original.id, 'missing', original.id, 'link-2', 'before'), /源链接不存在/)
  assert.equal(placeBookmarkLink([original], original.id, 'link-2', original.id, 'link-2', 'after')[0], original)
})
