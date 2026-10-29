import type {
  BookmarkBoard,
  BoardCategory,
  CommandTemplate,
  KubeConfig,
  KubeGroup,
} from '../src/types'
import type { CommandLibrary } from '../src/features/commands/types'
export type WorkspaceBackup = {
  version: number
  exportedAt?: string
  scope?: string
  boards?: BookmarkBoard[]
  categories?: BoardCategory[]
  kubeConfigs?: KubeConfig[]
  kubeGroups?: KubeGroup[]
  kubeCommands?: CommandTemplate[]
  commandLibrary?: CommandLibrary
  viewState?: Record<string, unknown>
}
export function validateBackup(input: unknown): WorkspaceBackup
export function selectBookmarks(boards: BookmarkBoard[], selection: string[]): BookmarkBoard[]
export function copyBoards(boards: BookmarkBoard[]): BookmarkBoard[]
export function independentGroup(
  board: BookmarkBoard,
  groupId: string,
  options: { name: string; categoryId?: string; copy?: boolean },
): { board: BookmarkBoard; source: BookmarkBoard }
export function mergeBackup(current: WorkspaceBackup, imported: WorkspaceBackup): WorkspaceBackup
