const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('orbitDesktop', {
  pickKubeconfigFile: () => ipcRenderer.invoke('orbit:pick-kubeconfig-file'),
  pickDirectory: () => ipcRenderer.invoke('orbit:pick-directory'),
  saveKubeconfigFile: (input) => ipcRenderer.invoke('orbit:save-kubeconfig-file', input),
  writeKubeconfigFile: (input) => ipcRenderer.invoke('orbit:write-kubeconfig-file', input),
})
