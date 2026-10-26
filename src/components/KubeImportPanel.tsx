import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clipboard, FileUp, FolderOpen, LoaderCircle, ShieldCheck } from 'lucide-react'
import { inspectKubeconfig, kubeEnvName, kubeFileStem, kubePathKey, MAX_KUBECONFIG_BYTES } from '../../shared/kubeconfig.mjs'
import type { KubeConfig, KubeGroup } from '../types'

type Source = 'file' | 'directory' | 'clipboard'
type Candidate = OrbitKubeFile & { relativePath?: string; contexts?: string[] }
type Options = { source: Source; groupId: string; tags: string[] }
type Props = {
  configs: KubeConfig[]
  groups: KubeGroup[]
  initialGroupId: string
  onClose: () => void
  onBusyChange: (busy: boolean) => void
  onImport: (files: (Candidate & { name?: string; envName?: string })[], options: Options) => void
}

const absolutePath = (value: string) => /^(\/|~\/|[A-Za-z]:[\\/]|\\\\)/.test(value)
const errorMessage = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method .*?: Error: /, '') : '操作失败，请重试'

export function KubeImportPanel({ configs, groups, initialGroupId, onClose, onBusyChange, onImport }: Props) {
  const [source, setSource] = useState<Source>('file')
  const [files, setFiles] = useState<Candidate[]>([])
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [root, setRoot] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [skipped, setSkipped] = useState<{ path: string; reason: string }[]>([])
  const [truncated, setTruncated] = useState(false)
  const [scanFinished, setScanFinished] = useState(false)
  const [visibleCount, setVisibleCount] = useState(100)
  const [groupId, setGroupId] = useState(initialGroupId === 'all' ? groups[0]?.id || '' : initialGroupId)
  const [tags, setTags] = useState('')
  const [name, setName] = useState('')
  const [envName, setEnvName] = useState('')
  const [fileName, setFileName] = useState('')
  const [directoryPath, setDirectoryPath] = useState('')
  const [content, setContent] = useState('')
  const [browserPath, setBrowserPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const directoryInput = useRef<HTMLInputElement>(null)
  const desktop = window.orbitDesktop
  const effectiveFileName = fileName.trim() || `${name.trim() || 'config'}.yaml`
  const effectiveEnvName = kubeEnvName(envName.trim() || kubeFileStem(source === 'clipboard' ? effectiveFileName : files[0]?.path || 'config'))
  const pathKeys = new Set(configs.map((config) => kubePathKey(config.path)))
  const duplicate = (file: Candidate) => pathKeys.has(kubePathKey(file.path))
  const selectedFiles = files.filter((file) => selectedPaths.includes(file.path) && !duplicate(file))
  const clipboardInfo = useMemo(() => {
    if (!content.trim()) return { metadata: null, error: '' }
    try { return { metadata: inspectKubeconfig(content), error: '' } }
    catch (issue) { return { metadata: null, error: errorMessage(issue) } }
  }, [content])

  useEffect(() => { directoryInput.current?.setAttribute('webkitdirectory', '') }, [])
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  useEffect(() => {
    let active = true
    void desktop?.kubeconfigDirectory().then((value) => { if (active) setDirectoryPath(value) }).catch(() => {})
    return () => { active = false }
  }, [desktop])

  const changeSource = (value: Source) => {
    if (busy || value === source) return
    setSource(value); setError(''); setFiles([]); setSelectedPaths([]); setSkipped([])
    setRoot(''); setScanFinished(false); setBrowserPath(''); setEnvName(''); setName('')
  }

  const acceptFiles = (candidates: Candidate[]) => {
    setVisibleCount(100)
    setFiles(candidates.map((file) => ({ ...file, contexts: inspectKubeconfig(file.content).contexts })))
    setSelectedPaths(candidates.filter((file) => !pathKeys.has(kubePathKey(file.path))).map((file) => file.path))
    setError('')
  }

  const pickFile = async () => {
    if (!desktop) { fileInput.current?.click(); return }
    setBusy(true); setError('')
    try {
      const file = await desktop.pickKubeconfigFile()
      if (file) { acceptFiles([file]); setName(kubeFileStem(file.path)); setEnvName('') }
    } catch (issue) { setError(errorMessage(issue)) }
    finally { setBusy(false) }
  }

  const pickDirectory = async () => {
    if (!desktop) { directoryInput.current?.click(); return }
    setBusy(true); setError('')
    try {
      const result = await desktop.importKubeconfigDirectory({ recursive })
      if (result) {
        acceptFiles(result.files); setRoot(result.root); setSkipped(result.skipped)
        setTruncated(result.truncated); setScanFinished(true)
      }
    } catch (issue) { setError(errorMessage(issue)) }
    finally { setBusy(false) }
  }

  const readBrowserFiles = async (inputFiles: FileList | null, isDirectory: boolean) => {
    if (!inputFiles?.length) return
    setBusy(true); setError('')
    const accepted: Candidate[] = [], rejected: { path: string; reason: string }[] = []
    const candidates = Array.from(inputFiles)
    let bytes = 0, limited = candidates.length > 5000
    try {
      for (let index = 0; index < Math.min(candidates.length, 5000); index++) {
        const file = candidates[index]
        const filePath = file.webkitRelativePath || file.name
        if (isDirectory && !recursive && filePath.split('/').length > 2) continue
        try {
          if (file.size > MAX_KUBECONFIG_BYTES) throw new Error('文件超过 2 MB')
          const text = await file.text()
          inspectKubeconfig(text)
          if (bytes + file.size > 32 * 1024 * 1024) { limited = true; break }
          bytes += file.size
          accepted.push({ path: filePath, content: text, relativePath: filePath })
        } catch (issue) { rejected.push({ path: filePath, reason: errorMessage(issue) }) }
        if (index % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
      }
      acceptFiles(accepted); setSkipped(rejected); setTruncated(limited); setScanFinished(isDirectory)
      if (!isDirectory && accepted[0]) { setName(kubeFileStem(accepted[0].path)); setEnvName('') }
      if (isDirectory) setRoot(candidates[0].webkitRelativePath.split('/')[0] || '')
      if (!accepted.length && !isDirectory) setError(rejected[0]?.reason || '未识别到有效配置')
    } finally { setBusy(false) }
  }

  const readClipboard = async () => {
    setBusy(true); setError('')
    try {
      const value = desktop ? await desktop.readClipboard() : await navigator.clipboard.readText()
      if (!value.trim()) throw new Error('剪贴板为空，请复制 kubeconfig 内容后重试')
      setContent(value)
    } catch { setError('无法读取剪贴板或剪贴板为空，请直接粘贴到内容框') }
    finally { setBusy(false) }
  }

  const importSelected = async () => {
    setError('')
    if (source !== 'directory' && !name.trim()) { setError('请输入配置名称'); return }
    if (source !== 'directory' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName.trim() || effectiveEnvName)) { setError('环境变量名称只能使用英文字母、数字和下划线，且不能以数字开头'); return }
    setBusy(true)
    try {
      const options = { source, groupId, tags: [...new Set(tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))] }
      if (source === 'clipboard') {
        inspectKubeconfig(content)
        if (!desktop) throw new Error('剪贴板导入需要桌面版将内容保存到本机文件，请在 Orbit Workbench 应用中导入')
        const file = await desktop.saveKubeconfigFile({ directoryPath, fileName: effectiveFileName, content })
        onImport([{ ...file, name: name.trim(), envName: envName.trim() || effectiveEnvName }], options)
      } else {
        if (!selectedFiles.length) throw new Error('请至少选择一个尚未导入的配置')
        if (!desktop && !absolutePath(browserPath.trim())) throw new Error(source === 'file' ? '请填写本机完整文件路径，以便正确生成命令' : '请填写所选目录的本机完整路径，以便正确生成命令')
        const items = selectedFiles.map((file) => ({
          ...file,
          path: desktop ? file.path : source === 'file' ? browserPath.trim() : `${browserPath.trim().replace(/[/\\]+$/, '')}/${(file.relativePath || file.path).split('/').slice(1).join('/')}`,
          ...(source === 'file' ? { name: name.trim(), envName: envName.trim() || effectiveEnvName } : {}),
        }))
        onImport(items, options)
      }
    } catch (issue) { setError(errorMessage(issue)) }
    finally { setBusy(false) }
  }

  return <div className="kube-import-panel">
    <div className="import-source-tabs" role="tablist" aria-label="导入方式">
      {([{ id: 'file', title: '单个文件', hint: '选择后直接导入', icon: FileUp }, { id: 'directory', title: '目录导入', hint: '自动查找子目录', icon: FolderOpen }, { id: 'clipboard', title: '剪贴板导入', hint: '粘贴并保存到本机', icon: Clipboard }] as const).map(({ id, title, hint, icon: Icon }) => <button key={id} role="tab" aria-selected={source === id} disabled={busy} onClick={() => changeSource(id)}><Icon size={21} /><strong>{title}</strong><small>{hint}</small></button>)}
    </div>

    {source === 'file' && <div className="import-file-area">
      <button className="import-picker" disabled={busy} onClick={() => void pickFile()}><FileUp size={26} /><strong>{files.length ? '重新选择文件' : '选择 kubeconfig 文件'}</strong><span>不限制后缀，支持无后缀、.txt、YAML 和 JSON</span></button>
      {files[0] && <div className="import-detected-file"><Check size={17} /><div><strong>{files[0].path.split(/[\\/]/).pop()}</strong><small>{files[0].path}</small></div><span>{files[0].contexts?.length} 个 Context</span></div>}
      {files.some(duplicate) && <p className="import-notice">此文件已在配置列表中，无需重复导入。</p>}
    </div>}

    {source === 'directory' && <div className="import-directory-area">
      <div className="import-directory-actions"><button className="toolbar-button" disabled={busy} onClick={() => void pickDirectory()}><FolderOpen size={17} />{root ? '重新选择目录' : '选择目录'}</button><label><input type="checkbox" checked={recursive} disabled={busy} onChange={(event) => { setRecursive(event.target.checked); setFiles([]); setSelectedPaths([]); setScanFinished(false); setSkipped([]) }} />包含所有子目录</label></div>
      <p className="import-description">按文件内容识别配置，自动跳过普通文件、无效配置和符号链接。只读取，不修改原文件。</p>
      {root && <div className="import-root-path" title={root}>{root}</div>}
      {scanFinished && <><div className="import-results-heading"><strong>识别到 {files.length} 个配置</strong><span>跳过 {skipped.length} 项 · 已存在 {files.filter(duplicate).length} 项</span></div>
        {files.length > 0 && <><label className="import-select-all"><input type="checkbox" checked={files.some((file) => !duplicate(file)) && files.filter((file) => !duplicate(file)).every((file) => selectedPaths.includes(file.path))} onChange={(event) => setSelectedPaths(event.target.checked ? files.filter((file) => !duplicate(file)).map((file) => file.path) : [])} />全选可导入配置 <span>已选 {selectedFiles.length}</span></label><div className="import-candidate-list">{files.slice(0, visibleCount).map((file) => <label key={file.path} className={duplicate(file) ? 'is-duplicate' : ''}><input type="checkbox" disabled={duplicate(file)} checked={!duplicate(file) && selectedPaths.includes(file.path)} onChange={() => setSelectedPaths((current) => current.includes(file.path) ? current.filter((item) => item !== file.path) : [...current, file.path])} /><div><strong>{file.relativePath || file.path}</strong><small>{file.contexts?.join(' · ')}</small></div><span>{duplicate(file) ? '已导入' : '可导入'}</span></label>)}</div>{files.length > visibleCount && <button className="toolbar-button import-load-more" onClick={() => setVisibleCount((count) => count + 100)}>显示更多（已显示 {visibleCount} / {files.length}）</button>}</>}
        {!files.length && <p className="import-notice">没有识别到 kubeconfig。可开启子目录遍历后重新选择目录，或尝试单个文件导入。</p>}
        {skipped.length > 0 && <details className="import-skipped"><summary>查看跳过的文件与原因（{skipped.length}）</summary><ul>{skipped.slice(0, 100).map((item, index) => <li key={index}><span>{item.path}</span><small>{item.reason}</small></li>)}</ul>{skipped.length > 100 && <p>仅展示前 100 项。</p>}</details>}
      </>}
      {truncated && <p className="import-notice">已达到单次扫描上限（5,000 个文件 / 32 MB 有效内容），请分批选择较小目录继续导入。</p>}
    </div>}

    {source === 'clipboard' && <div className="form-stack import-clipboard-area">
      <div className="import-content-label"><strong>kubeconfig 内容</strong><button className="toolbar-button" disabled={busy} onClick={() => void readClipboard()}><Clipboard size={15} />读取剪贴板</button></div>
      <textarea autoFocus aria-label="粘贴 kubeconfig 内容" className="yaml-editor" spellCheck={false} value={content} onChange={(event) => setContent(event.target.value)} placeholder="在此粘贴完整 kubeconfig YAML 或 JSON…" />
      {clipboardInfo.metadata && <p className="import-valid"><Check size={15} />已识别 {clipboardInfo.metadata.contexts.length} 个 Context · {clipboardInfo.metadata.context}</p>}
      {clipboardInfo.error && <p className="import-error" role="status">{clipboardInfo.error}</p>}
    </div>}

    {source !== 'directory' && (source === 'clipboard' || files.length > 0) && <div className="form-row import-name-row"><label>配置名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：production" /></label><label>环境变量名称<input value={envName || effectiveEnvName} onChange={(event) => setEnvName(event.target.value)} placeholder="默认使用文件名大写" /></label></div>}
    {!desktop && source !== 'clipboard' && files.length > 0 && <label className="import-browser-path">{source === 'file' ? '本机完整文件路径' : '所选目录的本机完整路径'}<input value={browserPath} onChange={(event) => setBrowserPath(event.target.value)} placeholder={source === 'file' ? '~/.kube/config' : '~/.kube'} /><small>浏览器无法读取本机完整路径；桌面版会自动填写。</small></label>}
    {source === 'clipboard' && <div className="form-stack import-save-location"><div className="form-row"><label>保存目录<div className="input-with-action"><input aria-label="保存目录" value={directoryPath} onChange={(event) => setDirectoryPath(event.target.value)} placeholder="默认保存到应用本地数据目录" /><button className="toolbar-button" disabled={busy || !desktop} onClick={() => { void desktop?.pickDirectory().then((value) => { if (value) setDirectoryPath(value) }).catch(() => setError('选择目录失败')) }}><FolderOpen size={15} />选择</button></div></label><label>文件名<input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder={effectiveFileName} /></label></div><small>已有文件不会被覆盖。内容只保存到本机，保存目录须位于代码仓库以外。</small></div>}
    <div className="import-destination"><label>导入到分组<select value={groupId} onChange={(event) => setGroupId(event.target.value)}>{groups.length ? groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>) : <option value="">自动创建“导入配置”分组</option>}</select></label><details><summary>添加标签（可选）</summary><input aria-label="导入配置标签" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="生产, 只读" /></details></div>
    <p className="import-privacy"><ShieldCheck size={15} />仅在本机读取与保存，不联网、不执行配置命令。</p>
    {error && <p className="import-error" role="alert">{error}</p>}
    <div className="modal-actions import-footer"><button className="ghost-button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy || (source === 'clipboard' ? !clipboardInfo.metadata || !desktop : !selectedFiles.length)} onClick={() => void importSelected()}>{busy ? <LoaderCircle size={16} className="import-spinner" /> : <FileUp size={16} />}{busy ? '处理中…' : source === 'directory' ? `导入选中配置${selectedFiles.length ? `（${selectedFiles.length}）` : ''}` : '导入配置'}</button></div>
    <input ref={fileInput} type="file" hidden onChange={(event) => { void readBrowserFiles(event.target.files, false); event.target.value = '' }} />
    <input ref={directoryInput} type="file" multiple hidden onChange={(event) => { void readBrowserFiles(event.target.files, true); event.target.value = '' }} />
  </div>
}
