export type CommandLanguage = 'bash' | 'powershell' | 'sql' | 'python' | 'javascript' | 'json' | 'yaml' | 'text'

export type SavedCommand = {
  id: string
  name: string
  description: string
  content: string
  language: CommandLanguage
  groupId: string
  createdAt: string
  updatedAt: string
}

export type CommandFolder = { id: string; name: string; color: string }
export type CommandLibrary = { version: 1; groups: CommandFolder[]; snippets: SavedCommand[] }

export const commandLanguages: { id: CommandLanguage; name: string }[] = [
  { id: 'bash', name: 'Shell / Bash' },
  { id: 'powershell', name: 'PowerShell' },
  { id: 'sql', name: 'SQL' },
  { id: 'python', name: 'Python' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'json', name: 'JSON' },
  { id: 'yaml', name: 'YAML' },
  { id: 'text', name: '纯文本' },
]
