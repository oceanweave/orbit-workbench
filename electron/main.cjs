const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron')
const { readKubeFile, scanKubeDirectory, saveManagedKubeFile } = require('./kube-files.cjs')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const isExternalUrl = (url) => /^(https?:|chrome-extension:)/i.test(url)
const expandUserPath = (value) => value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: 'Orbit Workbench',
    backgroundColor: '#0b0e13',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('orbit:pick-kubeconfig-file', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择 kubeconfig 文件',
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const selectedPath = result.filePaths[0]
  return readKubeFile(selectedPath)
})

ipcMain.handle('orbit:import-kubeconfig-directory', async (_event, options) => {
  const result = await dialog.showOpenDialog({ title: '选择要导入的 kubeconfig 目录', properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  return scanKubeDirectory(result.filePaths[0], { recursive: options?.recursive !== false })
})

ipcMain.handle('orbit:read-clipboard', () => clipboard.readText())
ipcMain.handle('orbit:kubeconfig-directory', () => path.join(app.getPath('userData'), 'kubeconfigs'))

ipcMain.handle('orbit:pick-directory', async () => {
  const result = await dialog.showOpenDialog({ title: '选择保存目录', properties: ['openDirectory', 'createDirectory'] })
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
})

ipcMain.handle('orbit:save-kubeconfig-file', async (_event, input) => {
  return saveManagedKubeFile({ directoryPath: String(input?.directoryPath ?? ''), fileName: String(input?.fileName ?? ''), content: String(input?.content ?? '') })
})

ipcMain.handle('orbit:write-kubeconfig-file', async (_event, input) => {
  const targetPath = expandUserPath(String(input?.path ?? ''))
  const content = String(input?.content ?? '')
  if (!targetPath) throw new Error('缺少 kubeconfig 文件路径')
  await fs.writeFile(targetPath, content, { encoding: 'utf8', mode: 0o600 })
  return { path: targetPath, content }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
