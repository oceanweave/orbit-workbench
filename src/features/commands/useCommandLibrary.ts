import { useCallback, useRef, useState } from 'react'
import { initialCommandLibrary } from './data'
import type { CommandLibrary } from './types'

export type SaveCommandLibrary = (update: CommandLibrary | ((current: CommandLibrary) => CommandLibrary)) => boolean
export const commandStorageKey = 'orbit-command-library'

export function useCommandLibrary(notify: (message: string) => void): [CommandLibrary, SaveCommandLibrary] {
  const [library, setLibrary] = useState<CommandLibrary>(() => {
    try {
      const value = localStorage.getItem(commandStorageKey)
      if (!value) return initialCommandLibrary
      const saved = JSON.parse(value)
      if (saved.version === 1 && Array.isArray(saved.groups) && Array.isArray(saved.snippets)) return saved
    } catch { /* Keep unreadable storage intact until a deliberate save. */ }
    return initialCommandLibrary
  })
  const latest = useRef(library)
  const save = useCallback<SaveCommandLibrary>((update) => {
    const next = typeof update === 'function' ? update(latest.current) : update
    try {
      // Commit first: a quota/permission failure must not report a successful save
      // or close an editor containing the user's unsaved command.
      localStorage.setItem(commandStorageKey, JSON.stringify(next))
    } catch {
      notify('本地保存失败，请保留编辑内容并检查存储空间或权限')
      return false
    }
    latest.current = next
    setLibrary(next)
    return true
  }, [notify])
  return [library, save]
}
