const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('orbitDesktop', {
  pickKubeconfigFile: () => ipcRenderer.invoke('orbit:pick-kubeconfig-file'),
  importKubeconfigDirectory: (options) => ipcRenderer.invoke('orbit:import-kubeconfig-directory', options),
  readClipboard: () => ipcRenderer.invoke('orbit:read-clipboard'),
  kubeconfigDirectory: () => ipcRenderer.invoke('orbit:kubeconfig-directory'),
  pickDirectory: () => ipcRenderer.invoke('orbit:pick-directory'),
  saveKubeconfigFile: (input) => ipcRenderer.invoke('orbit:save-kubeconfig-file', input),
  writeKubeconfigFile: (input) => ipcRenderer.invoke('orbit:write-kubeconfig-file', input),
})
