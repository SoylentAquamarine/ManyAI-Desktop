import { ipcRenderer } from 'electron'

export const terminalApi = {
  connect(opts: {
    sessionId: string
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
  }): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('term:connect', opts)
  },

  send(sessionId: string, data: string): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('term:send', sessionId, data)
  },

  resize(sessionId: string, cols: number, rows: number): Promise<void> {
    return ipcRenderer.invoke('term:resize', sessionId, cols, rows)
  },

  disconnect(sessionId: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke('term:disconnect', sessionId)
  },

  onData(sessionId: string, cb: (data: string) => void): () => void {
    const ch = `term:data:${sessionId}`
    const handler = (_: unknown, data: string) => cb(data)
    ipcRenderer.on(ch, handler)
    return () => ipcRenderer.removeListener(ch, handler)
  },

  onClose(sessionId: string, cb: () => void): () => void {
    const ch = `term:close:${sessionId}`
    const handler = () => cb()
    ipcRenderer.on(ch, handler)
    return () => ipcRenderer.removeListener(ch, handler)
  },

  onError(sessionId: string, cb: (msg: string) => void): () => void {
    const ch = `term:error:${sessionId}`
    const handler = (_: unknown, msg: string) => cb(msg)
    ipcRenderer.on(ch, handler)
    return () => ipcRenderer.removeListener(ch, handler)
  },
}
