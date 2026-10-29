const reserved = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'PWD',
  'OLDPWD',
  'IFS',
  'ENV',
  'BASH_ENV',
  'KUBECONFIG',
  'PSHOME',
  'PROFILE',
  'PID',
  'HOST',
  'NULL',
  'TRUE',
  'FALSE',
  'BASHOPTS',
  'SHELLOPTS',
  'UID',
  'EUID',
  'PPID',
  'RANDOM',
  'SECONDS',
  'LINENO',
  'OPTIND',
  'OPTARG',
  'PS1',
  'PS2',
  'PS3',
  'PS4',
  'TERM',
  'LANG',
  'LC_ALL',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'COMSPEC',
  'TEMP',
  'TMP',
])

export function validateEnvName(name, used = []) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) return '使用大写英文字母、数字或下划线，首位不能是数字'
  if (reserved.has(name)) return '此名称由系统或 kubectl 使用，请换一个环境变量名称'
  if (used.some((item) => item.toUpperCase() === name))
    return '其他配置已使用此名称，请设置不同的名称'
  return ''
}

const shLiteral = (text) => `'${text.replaceAll("'", "'\\''")}'`
const psLiteral = (text) => `'${text.replaceAll("'", "''")}'`
const doubleQuotedTail = (text) => text.replace(/[\\"$`]/g, '\\$&')
const shPath = (path) =>
  path === '~'
    ? '"$HOME"'
    : path.startsWith('~/')
      ? `"$HOME/${doubleQuotedTail(path.slice(2))}"`
      : shLiteral(path)
const psPath = (path) =>
  path === '~'
    ? '$HOME'
    : path.startsWith('~/')
      ? `(Join-Path $HOME ${psLiteral(path.slice(2))})`
      : psLiteral(path)

// Empty context/namespace means inherit. The literal string "default" is data,
// never a sentinel. Templates and extra arguments remain user-authored shell code.
export function generateKubeCommand({
  path,
  envName,
  command,
  context = '',
  namespace = '',
  extraArgs = '',
  format = 'variable',
  shell = 'bash',
}) {
  const error = validateEnvName(envName)
  if (error) throw new Error(error)
  if (!['bash', 'powershell'].includes(shell) || !['variable', 'once', 'session'].includes(format))
    throw new Error('不支持的命令格式或 Shell')
  const quote = shell === 'powershell' ? psLiteral : shLiteral
  const args = `${command}${context ? ` --context ${quote(context)}` : ''}${namespace ? ` -n ${quote(namespace)}` : ''}${extraArgs.trim() ? ` ${extraArgs.trim()}` : ''}`
  const value = shell === 'powershell' ? psPath(path) : shPath(path)
  const definition = shell === 'powershell' ? `$${envName} = ${value}` : `${envName}=${value}`
  let text
  if (shell === 'powershell') {
    if (format === 'variable') text = `${definition}\nkubectl --kubeconfig $${envName} ${args}`
    else if (format === 'session') text = `$env:KUBECONFIG = ${value}\nkubectl ${args}`
    else
      text = `& { $orbitHadConfig = Test-Path Env:KUBECONFIG; $orbitPreviousConfig = $env:KUBECONFIG; try { $env:KUBECONFIG = ${value}; kubectl ${args} } finally { if ($orbitHadConfig) { $env:KUBECONFIG = $orbitPreviousConfig } else { Remove-Item Env:KUBECONFIG -ErrorAction SilentlyContinue } } }`
  } else {
    if (format === 'variable') text = `${definition}\nKUBECONFIG="$${envName}" kubectl ${args}`
    else if (format === 'session') text = `export KUBECONFIG=${value}\nkubectl ${args}`
    else text = `KUBECONFIG=${value} kubectl ${args}`
  }
  return { text, definition, path }
}
