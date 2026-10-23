export type LinkItem = {
  id: string
  title: string
  url: string
  groupId: string
  tags: string[]
  description?: string
  addedAt: string
}

export type BookmarkGroup = {
  id: string
  name: string
  color: string
}

export type BookmarkBoard = {
  id: string
  name: string
  description: string
  tags: string[]
  groups: BookmarkGroup[]
  links: LinkItem[]
  updatedAt: string
}

export type KubeGroup = {
  id: string
  name: string
  color: string
}

export type KubeConfig = {
  id: string
  name: string
  /** Shell-safe environment variable name used for command generation. */
  envName?: string
  /** @deprecated Kept for migration from pre-0.1.1 data. */
  alias?: string
  path: string
  /** @deprecated Kept for migration from pre-0.1.1 data. */
  metaName?: string
  source?: 'file' | 'directory' | 'clipboard' | 'managed'
  content?: string
  groupId: string
  context: string
  contexts?: string[]
  server: string
  tags: string[]
  createdAt?: string
  updatedAt: string
}

export type CommandTemplate = {
  id: string
  name: string
  command: string
  description: string
  builtin?: boolean
  createdAt?: string
}
