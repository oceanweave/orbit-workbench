export type InsertPosition = 'before' | 'after'
export type DropPosition = InsertPosition | 'inside'
export function reorderItems<T extends { id: string }>(items: T[], sourceId: string, targetId: string, position: InsertPosition): T[]
export function placeGroupedItem<T extends { id: string; groupId: string }>(items: T[], sourceId: string, targetId: string, position: InsertPosition): T[]
export function orderVisibleItems<T extends { id: string }>(items: T[], visibleIds: string[]): T[]
export function dropPosition(fraction: number, nested?: boolean): DropPosition
