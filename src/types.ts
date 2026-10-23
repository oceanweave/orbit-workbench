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
  path: string
  groupId: string
  context: string
  server: string
  tags: string[]
  updatedAt: string
}

export type CommandTemplate = {
  id: string
  name: string
  command: string
  description: string
}
