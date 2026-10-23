/// <reference types="vite/client" />

type OrbitKubeFile = { path: string; content: string }

interface Window {
  orbitDesktop?: {
    pickKubeconfigFile: () => Promise<OrbitKubeFile | null>
    pickDirectory: () => Promise<string | null>
    saveKubeconfigFile: (input: { directoryPath: string; fileName: string; content: string }) => Promise<OrbitKubeFile>
    writeKubeconfigFile: (input: { path: string; content: string }) => Promise<OrbitKubeFile>
  }
}
