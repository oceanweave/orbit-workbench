import { dropClassName, type WorkspaceDropTarget } from '../hooks/useWorkspaceDrag'
export function DropGap({
  target,
  current,
  enabled,
  onOver,
  onLeave,
  onDrop,
}: {
  target: WorkspaceDropTarget
  current: WorkspaceDropTarget | null
  enabled: boolean
  onOver: (event: React.DragEvent<HTMLElement>, target: WorkspaceDropTarget) => void
  onLeave: (event: React.DragEvent<HTMLElement>) => void
  onDrop: (event: React.DragEvent<HTMLElement>, target: WorkspaceDropTarget) => void
}) {
  return (
    <div
      className={`drop-gap ${enabled ? 'enabled' : ''} ${current?.position === target.position ? dropClassName(current, target) : ''}`}
      onDragOver={(event) => {
        if (enabled) onOver(event, target)
      }}
      onDragLeave={onLeave}
      onDrop={(event) => {
        if (enabled) onDrop(event, target)
      }}
      aria-hidden="true"
    />
  )
}
