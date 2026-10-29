export type CommandFormat = 'variable' | 'once' | 'session'
export type CommandShell = 'bash' | 'powershell'
export function validateEnvName(name: string, used?: string[]): string
export function generateKubeCommand(options: {
  path: string
  envName: string
  command: string
  context?: string
  namespace?: string
  extraArgs?: string
  format?: CommandFormat
  shell?: CommandShell
}): { text: string; definition: string; path: string }
