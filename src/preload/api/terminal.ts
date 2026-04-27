import { ipcRenderer } from 'electron'

export interface FtpEntry {
  name: string
  type: 'file' | 'dir' | 'link'
  size: number
  date: string
}

export const terminalApi = {
  // ── SSH shell ───────────────────────────────────────────────────────────────
  connect(opts: {
    sessionId: string; host: string; port: number
    username: string; password?: string; privateKey?: string
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
    const h = (_: unknown, d: string) => cb(d)
    ipcRenderer.on(ch, h)
    return () => ipcRenderer.removeListener(ch, h)
  },

  onClose(sessionId: string, cb: () => void): () => void {
    const ch = `term:close:${sessionId}`
    const h = () => cb()
    ipcRenderer.on(ch, h)
    return () => ipcRenderer.removeListener(ch, h)
  },

  onError(sessionId: string, cb: (msg: string) => void): () => void {
    const ch = `term:error:${sessionId}`
    const h = (_: unknown, m: string) => cb(m)
    ipcRenderer.on(ch, h)
    return () => ipcRenderer.removeListener(ch, h)
  },

  // ── SFTP ───────────────────────────────────────────────────────────────────
  sftpConnect(opts: {
    sessionId: string; host: string; port: number
    username: string; password?: string; privateKey?: string
  }): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('sftp:connect', opts)
  },

  sftpList(sessionId: string, remotePath: string): Promise<{ entries: FtpEntry[] } | { error: string }> {
    return ipcRenderer.invoke('sftp:list', sessionId, remotePath)
  },

  sftpDownload(sessionId: string, remotePath: string): Promise<{ ok: true; path: string } | { canceled: true } | { error: string }> {
    return ipcRenderer.invoke('sftp:download', sessionId, remotePath)
  },

  sftpUpload(sessionId: string, remotePath: string): Promise<{ ok: true } | { canceled: true } | { error: string }> {
    return ipcRenderer.invoke('sftp:upload', sessionId, remotePath)
  },

  sftpMkdir(sessionId: string, remotePath: string): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('sftp:mkdir', sessionId, remotePath)
  },

  sftpDelete(sessionId: string, remotePath: string, isDir: boolean): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('sftp:delete', sessionId, remotePath, isDir)
  },

  // ── FTP / FTPS ─────────────────────────────────────────────────────────────
  ftpConnect(opts: {
    sessionId: string; host: string; port: number
    username: string; password?: string; secure: boolean
  }): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('ftp:connect', opts)
  },

  ftpList(sessionId: string, remotePath: string): Promise<{ entries: FtpEntry[] } | { error: string }> {
    return ipcRenderer.invoke('ftp:list', sessionId, remotePath)
  },

  ftpDownload(sessionId: string, remotePath: string): Promise<{ ok: true; path: string } | { canceled: true } | { error: string }> {
    return ipcRenderer.invoke('ftp:download', sessionId, remotePath)
  },

  ftpUpload(sessionId: string, remotePath: string): Promise<{ ok: true } | { canceled: true } | { error: string }> {
    return ipcRenderer.invoke('ftp:upload', sessionId, remotePath)
  },

  ftpMkdir(sessionId: string, remotePath: string): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('ftp:mkdir', sessionId, remotePath)
  },

  ftpDelete(sessionId: string, remotePath: string, isDir: boolean): Promise<{ ok: true } | { error: string }> {
    return ipcRenderer.invoke('ftp:delete', sessionId, remotePath, isDir)
  },
}
