import { useEffect, useState } from 'react'
import { Copy, FolderOpen, HardDrive } from 'lucide-react'
import { Modal } from './Modal'

export function StoragePanel({
  onClose,
  onCopy,
  onBackup,
  onRestore,
  onRecovery,
}: {
  onClose: () => void
  onCopy: (value: string) => void
  onBackup: () => void
  onRestore: () => void
  onRecovery: () => void
}) {
  const [directory, setDirectory] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    window.orbitDesktop
      ?.storageInfo?.()
      .then((info) => setDirectory(info.directory))
      .catch(() => setError('无法读取存储目录'))
  }, [])
  return (
    <Modal title="本机存储" onClose={onClose}>
      <div className="form-stack">
        <p>
          <HardDrive size={16} />{' '}
          {window.orbitDesktop
            ? '应用数据保存在以下目录的站点存储中。'
            : '浏览器模式：数据保存在当前站点的本地存储中，不对应一个可直接编辑的 JSON 文件。'}
        </p>
        {directory && (
          <>
            <code className="storage-path">{directory}</code>
            <div className="heading-actions">
              <button className="ghost-button" onClick={() => onCopy(directory)}>
                <Copy size={15} />
                复制目录
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  void window.orbitDesktop?.openStorage().then((message) => {
                    if (message) setError(message)
                  })
                }}
              >
                <FolderOpen size={15} />
                打开目录
              </button>
            </div>
          </>
        )}
        <p className="form-hint">
          引用的 kubeconfig 仍位于原文件路径，不会被移到应用目录。托管配置位于 kubeconfigs 子目录。
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          {localStorage.getItem('orbit-recovery-backup') && (
            <button className="ghost-button" onClick={onRecovery}>
              恢复替换前的本机备份
            </button>
          )}
          <button className="ghost-button" onClick={onRestore}>
            从 JSON 恢复
          </button>
          <button className="primary-button" onClick={onBackup}>
            创建备份
          </button>
        </div>
      </div>
    </Modal>
  )
}
