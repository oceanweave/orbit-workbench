import { parseDocument } from 'yaml'

export const MAX_KUBECONFIG_BYTES = 2 * 1024 * 1024

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Never include source snippets in errors: kubeconfig YAML may contain credentials.
export function inspectKubeconfig(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('文件内容为空')
  if (new TextEncoder().encode(content).length > MAX_KUBECONFIG_BYTES) throw new Error('文件超过 2 MB，请单独检查')
  if (content.includes('\0')) throw new Error('不是文本配置文件')
  let config
  try {
    const document = parseDocument(content, { prettyErrors: false, logLevel: 'silent' })
    if (document.errors.length || document.warnings.length) throw new Error()
    config = document.toJS({ maxAliasCount: 30 })
  } catch {
    throw new Error('YAML / JSON 格式无效')
  }
  if (!object(config) || config.kind !== 'Config' || config.apiVersion !== 'v1' || !Array.isArray(config.clusters) || !Array.isArray(config.contexts) || !Array.isArray(config.users)) {
    throw new Error('不是 kubeconfig：需要 apiVersion、kind、clusters、contexts 和 users')
  }
  const contexts = config.contexts.filter((item) => object(item) && typeof item.name === 'string' && object(item.context))
  const names = [...new Set(contexts.map((item) => item.name).filter(Boolean))]
  if (!names.length) throw new Error('配置中没有可用 Context')
  const context = names.includes(config['current-context']) ? config['current-context'] : names[0]
  const active = contexts.find((item) => item.name === context)
  const cluster = config.clusters.find((item) => object(item) && item.name === active.context.cluster)
  return { context, contexts: names, server: typeof cluster?.cluster?.server === 'string' ? cluster.cluster.server : '' }
}

export function kubeFileStem(filePath) {
  const name = filePath.split(/[\\/]/).pop() || 'config'
  return name.replace(/\.[^.]+$/, '') || name
}

export function kubeEnvName(value) {
  const name = value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'KUBE_CONFIG'
  return /^[A-Z_]/.test(name) ? name : `KUBE_${name}`
}

export function uniqueEnvName(value, used) {
  const base = kubeEnvName(value)
  let name = base
  let index = 2
  while (used.has(name)) name = `${base}_${index++}`
  used.add(name)
  return name
}

export function kubePathKey(value) {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '')
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

// This is deliberately metadata-only. It never writes to an imported source file.
export function prepareKubeImports(files, existing, options) {
  const paths = new Set(existing.map((item) => kubePathKey(item.path)))
  const envNames = new Set(existing.map((item) => kubeEnvName(item.envName || item.name)))
  const configs = []
  let duplicateCount = 0
  for (const file of files) {
    if (paths.has(kubePathKey(file.path))) { duplicateCount++; continue }
    const metadata = inspectKubeconfig(file.content)
    const name = file.name?.trim() || kubeFileStem(file.path)
    const envName = uniqueEnvName(file.envName?.trim() || kubeFileStem(file.path), envNames)
    paths.add(kubePathKey(file.path))
    configs.push({
      id: globalThis.crypto.randomUUID(), name, envName, alias: envName, metaName: envName,
      path: file.path, content: file.content, ...metadata, source: options.source,
      groupId: options.groupId, tags: options.tags || [], createdAt: new Date().toISOString(), updatedAt: '刚刚',
    })
  }
  return { configs, duplicateCount }
}
