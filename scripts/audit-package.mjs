import { listPackage, statFile, uncache } from '@electron/asar'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Only generated frontend assets, application modules, the package manifest and
// installed dependencies belong in a distributable. User imports and Electron's
// userData directory are deliberately outside this boundary, regardless of suffix.
const applicationFile = /^\/(?:dist\/(?:index\.html|assets\/[^/]+\.(?:js|css|svg|png|jpe?g|webp|woff2?|ico))|electron\/(?:main|preload|kube-files)\.cjs|shared\/(?:bookmarks|commands|kubeconfig|ordering)\.(?:mjs|d\.mts)|package\.json)$/
const userDataSegment = /(?:^|\/)(?:\.kube|kubeconfigs|local-data|Local Storage|Session Storage|IndexedDB|Cookies(?:-journal)?)(?:\/|$)/i

export function auditPackage(archive) {
  uncache(archive)
  const paths = listPackage(archive)
  const rejected = []
  let checked = 0
  for (const entry of paths) {
    const path = entry.replaceAll('\\', '/')
    const metadata = statFile(archive, path.replace(/^\/+/, ''), false)
    if (metadata.files) continue
    checked++
    if (userDataSegment.test(path) || (!path.startsWith('/node_modules/') && (!applicationFile.test(path) || metadata.link))) rejected.push(path)
  }
  if (rejected.length) throw new Error(`安装包含有未获准的文件，禁止发布：\n${rejected.join('\n')}`)
  return { checked, applicationFiles: paths.filter((path) => !path.startsWith('/node_modules/') && applicationFile.test(path)) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: npm run package:audit -- <app.asar>')
    process.exitCode = 1
  } else {
    try {
      const report = auditPackage(resolve(process.argv[2]))
      console.log(`安装包检查通过：${report.checked} 个文件，仅包含程序资源与依赖；未发现本地工作区、书签导出或 kubeconfig 文件。`)
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
