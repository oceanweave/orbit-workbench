/// <reference types="vite/client" />

type OrbitKubeFile = { path: string; content: string }
type OrbitKubeScan = { root: string; files: (OrbitKubeFile & { relativePath?: string })[]; skipped: { path: string; reason: string }[]; truncated: boolean }

interface Window {
  orbitDesktop?: {
    pickKubeconfigFile: () => Promise<OrbitKubeFile | null>
    importKubeconfigDirectory: (options: { recursive: boolean }) => Promise<OrbitKubeScan | null>
    readClipboard: () => Promise<string>
    kubeconfigDirectory: () => Promise<string>
    pickDirectory: () => Promise<string | null>
    saveKubeconfigFile: (input: { directoryPath: string; fileName: string; content: string }) => Promise<OrbitKubeFile>
    writeKubeconfigFile: (input: { path: string; content: string; expectedContent?: string }) => Promise<OrbitKubeFile>
    storageInfo: () => Promise<{ directory: string }>
    openStorage: () => Promise<string>
    revealKubeconfig: (path: string) => Promise<void>
    readKubeconfig: (path: string) => Promise<OrbitKubeFile>
  }
}
