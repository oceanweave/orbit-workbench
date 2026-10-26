const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const MAX_FILES = 5000
const MAX_SCAN_BYTES = 32 * 1024 * 1024
const expand = (value) => value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value
const helpers = () => import('../shared/kubeconfig.mjs')

async function readKubeFile(filePath) {
  const { inspectKubeconfig, MAX_KUBECONFIG_BYTES } = await helpers()
  const resolved = await fs.realpath(path.resolve(expand(filePath)))
  const handle = await fs.open(resolved, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new Error('请选择普通文件')
    if (info.size > MAX_KUBECONFIG_BYTES) throw new Error('文件超过 2 MB，请单独检查')
    // Bounded read also protects against a source file growing during the scan.
    const buffer = Buffer.alloc(Math.min(Math.max(info.size + 1, 1024), 64 * 1024))
    const chunks = []
    let total = 0
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, MAX_KUBECONFIG_BYTES + 1 - total), total)
      if (!bytesRead) break
      total += bytesRead
      if (total > MAX_KUBECONFIG_BYTES) throw new Error('文件超过 2 MB，请单独检查')
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)))
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))
    return { path: resolved, content, ...inspectKubeconfig(content) }
  } finally { await handle.close() }
}

async function scanKubeDirectory(directoryPath, { recursive = true } = {}) {
  const root = await fs.realpath(path.resolve(expand(directoryPath)))
  if (!(await fs.stat(root)).isDirectory()) throw new Error('请选择目录')
  const files = [], skipped = []
  let visited = 0, directories = 0, bytes = 0, truncated = false
  async function visit(directory) {
    if (++directories > MAX_FILES) { truncated = true; return }
    let entries
    try { entries = await fs.readdir(directory, { withFileTypes: true }) }
    catch { skipped.push({ path: directory, reason: '无法读取此目录' }); return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (truncated) break
      if (['.git', 'node_modules'].includes(entry.name)) continue
      const target = path.join(directory, entry.name)
      // Do not traverse symlinks, preventing directory cycles and escaping the selected tree.
      if (entry.isSymbolicLink()) { skipped.push({ path: target, reason: '已跳过符号链接' }); continue }
      if (entry.isDirectory()) { if (recursive) await visit(target); continue }
      if (!entry.isFile()) continue
      if (++visited > MAX_FILES) { truncated = true; break }
      try {
        const file = await readKubeFile(target)
        const size = Buffer.byteLength(file.content)
        if (bytes + size > MAX_SCAN_BYTES) { truncated = true; break }
        bytes += size
        files.push({ ...file, relativePath: path.relative(root, file.path) })
      } catch {
        skipped.push({ path: target, reason: '不是有效的 kubeconfig，或文件不可读 / 超过 2 MB' })
      }
    }
  }
  await visit(root)
  return { root, files, skipped, truncated }
}

async function saveManagedKubeFile({ directoryPath, fileName, content }) {
  const { inspectKubeconfig } = await helpers()
  inspectKubeconfig(content)
  if (!fileName?.trim() || fileName !== path.basename(fileName) || /[\\/:*?"<>|\x00-\x1f]/.test(fileName) || /[. ]$/.test(fileName) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName)) throw new Error('请输入有效的文件名')
  if (!directoryPath?.trim()) throw new Error('请选择本地保存目录')
  const directory = path.resolve(expand(directoryPath))
  // Resolve existing ancestors before creating anything, including symlinked parents.
  let ancestor = directory
  while (true) {
    try { ancestor = await fs.realpath(ancestor); break }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = path.dirname(ancestor)
      if (parent === ancestor) throw error
      ancestor = parent
    }
  }
  for (let current = ancestor; ; current = path.dirname(current)) {
    try { await fs.lstat(path.join(current, '.git')); throw new Error('请将 kubeconfig 保存在代码仓库以外的本地目录') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (path.dirname(current) === current) break
  }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const target = path.join(await fs.realpath(directory), fileName)
  try { await fs.writeFile(target, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' }) }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('同名文件已存在，请更换文件名；原文件未覆盖')
    throw new Error('保存失败，请检查目录权限')
  }
  return { path: target, content }
}

module.exports = { readKubeFile, scanKubeDirectory, saveManagedKubeFile }
