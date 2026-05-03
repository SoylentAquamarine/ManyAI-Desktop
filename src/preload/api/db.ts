import { ipcRenderer } from 'electron'

export const dbApi = {
  logMessage: (
    workingDir: string,
    type: string,
    role: string,
    content: string,
    meta?: { provider?: string; model?: string; latencyMs?: number; toolName?: string; args?: string }
  ) => ipcRenderer.invoke('log-message', workingDir, type, role, content, meta) as Promise<{ ok: boolean } | { error: string }>,
}
