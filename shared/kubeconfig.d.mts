import type { KubeConfig } from '../src/types'
export const MAX_KUBECONFIG_BYTES: number
export function inspectKubeconfig(content: string): { context: string; contexts: string[]; server: string }
export function kubeFileStem(path: string): string
export function kubeEnvName(value: string): string
export function uniqueEnvName(value: string, used: Set<string>): string
export function kubePathKey(value: string): string
export function prepareKubeImports(files: { path: string; content: string; name?: string; envName?: string }[], existing: KubeConfig[], options: { source: 'file' | 'directory' | 'clipboard'; groupId: string; tags?: string[] }): { configs: KubeConfig[]; duplicateCount: number }
