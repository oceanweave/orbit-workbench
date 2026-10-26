import type { CommandLanguage, CommandLibrary, SavedCommand } from '../src/features/commands/types'
export function commandLines(content: string): string[]
export function joinCommands(snippets: SavedCommand[]): string
export function filterCommands(library: CommandLibrary, options?: { groupId?: string; query?: string; language?: CommandLanguage | 'all' }): SavedCommand[]
export function moveCommands(library: CommandLibrary, ids: string[], groupId: string): CommandLibrary
export function removeCommandFolder(library: CommandLibrary, groupId: string): CommandLibrary
export function placeCommand(library: CommandLibrary, sourceId: string, targetId: string, position: 'before' | 'after'): CommandLibrary
export function placeCommandFolder(library: CommandLibrary, sourceId: string, targetId: string, position: 'before' | 'after'): CommandLibrary
