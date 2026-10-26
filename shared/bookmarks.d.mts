import type { BookmarkBoard, BookmarkGroup, LinkItem } from '../src/types'
export type BookmarkGroupRow = { group: BookmarkGroup; depth: number; path: string; ancestors: string[]; parentId?: string; hasChildren: boolean }
export function bookmarkGroupRows(groups: BookmarkGroup[]): BookmarkGroupRow[]
export function bookmarkGroupPath(groups: BookmarkGroup[], groupId: string): string
export function bookmarkDescendantIds(groups: BookmarkGroup[], groupId: string): Set<string>
export function reparentBookmarkGroup(board: BookmarkBoard, groupId: string, parentId?: string): BookmarkBoard
export function deleteBookmarkGroup(board: BookmarkBoard, groupId: string): BookmarkBoard
export function moveBookmarkLinks(boards: BookmarkBoard[], sourceBoardId: string, linkIds: string[], targetBoardId: string, targetGroupId?: string): { boards: BookmarkBoard[]; groupId: string; count: number }
export function createBrowserBookmarksHtml(boards: BookmarkBoard[]): string
export function parseBookmarksHtml(html: string, createDocument?: (html: string) => Document): BookmarkBoard[]
export function bookmarkSearchBoard(results: { board: BookmarkBoard; link: LinkItem }[], name: string): BookmarkBoard
