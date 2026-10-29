import type { KubeConfig } from '../types'

// Browsers report the Enter key while an IME is still composing (for example
// the first Enter that confirms a Chinese Pinyin candidate). Never treat that
// keypress as a form submission or inline-edit commit. `keyCode === 229` is
// kept as a fallback for WebKit/Electron versions that do not expose
// `nativeEvent.isComposing` consistently.
export const isCommittedEnter = (event: React.KeyboardEvent) =>
  event.key === 'Enter' &&
  !event.nativeEvent.isComposing &&
  event.keyCode !== 229

export const kubeGroupPalette = [
  '#527a66',
  '#627e91',
  '#a08b59',
  '#8d7897',
  '#a57474',
  '#668c8b',
  '#7b827a',
]

export const filenameStem = (value: string) =>
  value
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^./]+$/, '') ?? ''

export const deriveEnvName = (value: string, fallback = 'KUBECONFIG') => {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) return fallback
  return /^[A-Z_]/.test(normalized) ? normalized : `KUBE_${normalized}`
}

export const safeDownloadName = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'orbit-bookmarks'

export const displayEnvName = (config: KubeConfig) =>
  deriveEnvName(
    config.envName ||
      config.alias ||
      config.metaName?.replace(/^META_/i, '') ||
      config.name ||
      filenameStem(config.path),
  )

export const uid = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`
