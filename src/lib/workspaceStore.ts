import { useCallback, useEffect, useRef, useState } from 'react'

export const workspaceKeys = [
  'orbit-boards',
  'orbit-board-categories',
  'orbit-kube-configs',
  'orbit-kube-groups',
  'orbit-kube-commands',
  'orbit-command-library',
  'orbit-bookmark-collapse',
  'orbit-expanded-boards',
  'orbit-tree-collapse',
] as const
type Snapshot = Record<string, string | null>
const history: Snapshot[] = []
let historyBytes = 0
let gesture: Snapshot | undefined
const snapshot = (): Snapshot =>
  Object.fromEntries(workspaceKeys.map((key) => [key, localStorage.getItem(key)]))
const snapshotBytes = (value: Snapshot) =>
  Object.values(value).reduce((sum, item) => sum + (item?.length ?? 0) * 2, 0)
const changed = () => window.dispatchEvent(new window.CustomEvent('orbit:history'))

export function commitStorage(values: Record<string, unknown>, record = true) {
  const keys = Object.keys(values)
  const affectsLibrary =
    record && keys.some((key) => workspaceKeys.includes(key as (typeof workspaceKeys)[number]))
  const before = affectsLibrary ? snapshot() : {}
  const previous = Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]))
  const serialized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]),
  )
  try {
    for (const [key, value] of Object.entries(serialized)) localStorage.setItem(key, value)
  } catch (error) {
    for (const [key, value] of Object.entries(previous)) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
    throw error
  }
  window.dispatchEvent(new window.CustomEvent('orbit:commit', { detail: keys }))
  if (affectsLibrary && keys.some((key) => previous[key] !== serialized[key])) {
    // Several state writes from one drop/import form one library operation.
    if (!gesture) {
      gesture = before
      queueMicrotask(() => {
        if (gesture) {
          history.push(gesture)
          historyBytes += snapshotBytes(gesture)
        }
        gesture = undefined
        while (history.length > 30 || (history.length > 1 && historyBytes > 16_000_000))
          historyBytes -= snapshotBytes(history.shift()!)
        changed()
      })
    }
  }
}

export const canUndoWorkspace = () => history.length > 0
export function undoWorkspace() {
  const previous = history[history.length - 1]
  if (!previous) return false
  const current = snapshot()
  try {
    for (const [key, value] of Object.entries(previous)) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
  } catch {
    for (const [key, value] of Object.entries(current)) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
    return false
  }
  historyBytes -= snapshotBytes(history.pop()!)
  window.dispatchEvent(new window.CustomEvent('orbit:restore'))
  changed()
  return true
}

export function usePersistentState<T>(key: string, initial: T) {
  const read = () => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? (JSON.parse(stored) as T) : initial
    } catch {
      return initial
    } // Never overwrite unreadable data on mount.
  }
  const [value, setValue] = useState<T>(read)
  const latest = useRef(value)
  useEffect(() => {
    const refresh = (event: Event) => {
      if (event.type === 'orbit:commit' && !(event as CustomEvent<string[]>).detail.includes(key))
        return
      const next = read()
      if (JSON.stringify(next) === JSON.stringify(latest.current)) return
      latest.current = next
      setValue(next)
    }
    window.addEventListener('orbit:restore', refresh)
    window.addEventListener('orbit:commit', refresh)
    return () => {
      window.removeEventListener('orbit:restore', refresh)
      window.removeEventListener('orbit:commit', refresh)
    }
  }, [key])
  const save = useCallback(
    (update: React.SetStateAction<T>) => {
      const next =
        typeof update === 'function' ? (update as (value: T) => T)(latest.current) : update
      if (next === latest.current || JSON.stringify(next) === JSON.stringify(latest.current)) return
      try {
        commitStorage({ [key]: next })
      } catch {
        window.dispatchEvent(
          new window.CustomEvent('orbit:save-error', {
            detail: '本机保存失败，原数据未改变，请检查存储空间或权限',
          }),
        )
        throw new Error('本机保存失败')
      }
      latest.current = next
      setValue(next)
    },
    [key],
  )
  return [value, save] as const
}
