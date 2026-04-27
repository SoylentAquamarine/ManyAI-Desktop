import { ipcMain, WebContents, dialog, app } from 'electron'
import { Client as SshClient, SFTPWrapper } from 'ssh2'
import * as ftp from 'basic-ftp'
import * as path from 'path'
import * as fs from 'fs'

// ── SSH shell sessions ────────────────────────────────────────────────────────

interface ShellSession {
  kind: 'shell'
  client: SshClient
  stream: NodeJS.ReadWriteStream
  sender: WebContents
}

// ── SFTP sessions ─────────────────────────────────────────────────────────────

interface SftpSession {
  kind: 'sftp'
  client: SshClient
  sftp: SFTPWrapper
}

// ── FTP sessions ──────────────────────────────────────────────────────────────

interface FtpSession {
  kind: 'ftp'
  client: ftp.Client
}

type AnySession = ShellSession | SftpSession | FtpSession

const sessions = new Map<string, AnySession>()

function push(sender: WebContents, channel: string, ...args: unknown[]) {
  if (!sender.isDestroyed()) sender.send(channel, ...args)
}

export interface FtpEntry {
  name: string
  type: 'file' | 'dir' | 'link'
  size: number
  date: string
}

export function registerTerminalIpc(): void {

  // ── SSH shell connect ───────────────────────────────────────────────────────

  ipcMain.handle('term:connect', async (event, opts: {
    sessionId: string
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
  }) => {
    const { sessionId, host, port, username, password, privateKey } = opts
    const sender = event.sender

    if (sessions.has(sessionId)) return { error: 'Already connected' }

    return new Promise<{ ok: true } | { error: string }>(resolve => {
      const client = new SshClient()

      client.on('ready', () => {
        client.shell({ term: 'xterm-256color' }, (err, stream) => {
          if (err) { client.end(); resolve({ error: err.message }); return }

          sessions.set(sessionId, { kind: 'shell', client, stream, sender })
          resolve({ ok: true })

          stream.on('data', (data: Buffer) => push(sender, `term:data:${sessionId}`, data.toString()))
          stream.stderr?.on('data', (data: Buffer) => push(sender, `term:data:${sessionId}`, data.toString()))
          stream.on('close', () => { sessions.delete(sessionId); push(sender, `term:close:${sessionId}`) })
        })
      })

      client.on('error', err => {
        sessions.delete(sessionId)
        push(sender, `term:error:${sessionId}`, err.message)
        resolve({ error: err.message })
      })

      const connectOpts: Parameters<SshClient['connect']>[0] = { host, port, username, readyTimeout: 10000 }
      if (privateKey) connectOpts.privateKey = privateKey
      else connectOpts.password = password
      client.connect(connectOpts)
    })
  })

  ipcMain.handle('term:send', (_e, sessionId: string, data: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'shell') return { error: 'Not a shell session' }
    s.stream.write(data)
    return { ok: true }
  })

  ipcMain.handle('term:resize', (_e, sessionId: string, cols: number, rows: number) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'shell') return
    ;(s.stream as any).setWindow(rows, cols, 0, 0)
  })

  ipcMain.handle('term:disconnect', (_e, sessionId: string) => {
    const s = sessions.get(sessionId)
    if (s) {
      if (s.kind === 'shell') { s.stream.end(); s.client.end() }
      else if (s.kind === 'sftp') s.client.end()
      else if (s.kind === 'ftp') s.client.close()
      sessions.delete(sessionId)
    }
    return { ok: true }
  })

  // ── SFTP connect ────────────────────────────────────────────────────────────

  ipcMain.handle('sftp:connect', async (_e, opts: {
    sessionId: string
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
  }) => {
    const { sessionId, host, port, username, password, privateKey } = opts
    if (sessions.has(sessionId)) return { error: 'Already connected' }

    return new Promise<{ ok: true } | { error: string }>(resolve => {
      const client = new SshClient()

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) { client.end(); resolve({ error: err.message }); return }
          sessions.set(sessionId, { kind: 'sftp', client, sftp })
          resolve({ ok: true })
        })
      })

      client.on('error', err => { sessions.delete(sessionId); resolve({ error: err.message }) })

      const connectOpts: Parameters<SshClient['connect']>[0] = { host, port, username, readyTimeout: 10000 }
      if (privateKey) connectOpts.privateKey = privateKey
      else connectOpts.password = password
      client.connect(connectOpts)
    })
  })

  ipcMain.handle('sftp:list', (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'sftp') return { error: 'Not an SFTP session' }

    return new Promise<{ entries: FtpEntry[] } | { error: string }>(resolve => {
      s.sftp.readdir(remotePath, (err, list) => {
        if (err) return resolve({ error: err.message })
        const entries: FtpEntry[] = list.map(f => ({
          name: f.filename,
          type: f.attrs.isDirectory() ? 'dir' : f.attrs.isSymbolicLink() ? 'link' : 'file',
          size: f.attrs.size,
          date: new Date(f.attrs.mtime * 1000).toISOString(),
        }))
        resolve({ entries })
      })
    })
  })

  ipcMain.handle('sftp:download', async (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'sftp') return { error: 'Not an SFTP session' }

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), path.basename(remotePath)),
    })
    if (canceled || !filePath) return { canceled: true }

    return new Promise<{ ok: true; path: string } | { error: string }>(resolve => {
      s.sftp.fastGet(remotePath, filePath, err => {
        if (err) resolve({ error: err.message })
        else resolve({ ok: true, path: filePath })
      })
    })
  })

  ipcMain.handle('sftp:upload', async (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'sftp') return { error: 'Not an SFTP session' }

    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (canceled || !filePaths[0]) return { canceled: true }
    const localPath = filePaths[0]
    const dest = remotePath.endsWith('/') ? remotePath + path.basename(localPath) : remotePath

    return new Promise<{ ok: true } | { error: string }>(resolve => {
      s.sftp.fastPut(localPath, dest, err => {
        if (err) resolve({ error: err.message })
        else resolve({ ok: true })
      })
    })
  })

  ipcMain.handle('sftp:mkdir', (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'sftp') return { error: 'Not an SFTP session' }

    return new Promise<{ ok: true } | { error: string }>(resolve => {
      s.sftp.mkdir(remotePath, err => {
        if (err) resolve({ error: err.message })
        else resolve({ ok: true })
      })
    })
  })

  ipcMain.handle('sftp:delete', (_e, sessionId: string, remotePath: string, isDir: boolean) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'sftp') return { error: 'Not an SFTP session' }

    return new Promise<{ ok: true } | { error: string }>(resolve => {
      const fn = isDir
        ? (p: string, cb: (err: Error | null) => void) => s.sftp.rmdir(p, cb)
        : (p: string, cb: (err: Error | null) => void) => s.sftp.unlink(p, cb)
      fn(remotePath, err => {
        if (err) resolve({ error: err.message })
        else resolve({ ok: true })
      })
    })
  })

  // ── FTP connect ─────────────────────────────────────────────────────────────

  ipcMain.handle('ftp:connect', async (_e, opts: {
    sessionId: string
    host: string
    port: number
    username: string
    password?: string
    secure: boolean
  }) => {
    const { sessionId, host, port, username, password, secure } = opts
    if (sessions.has(sessionId)) return { error: 'Already connected' }

    const client = new ftp.Client()
    client.ftp.verbose = false

    try {
      await client.access({ host, port, user: username, password: password ?? '', secure })
      sessions.set(sessionId, { kind: 'ftp', client })
      return { ok: true }
    } catch (err: any) {
      client.close()
      return { error: err.message ?? String(err) }
    }
  })

  ipcMain.handle('ftp:list', async (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'ftp') return { error: 'Not an FTP session' }

    try {
      const list = await s.client.list(remotePath)
      const entries: FtpEntry[] = list.map(f => ({
        name: f.name,
        type: f.type === ftp.FileType.Directory ? 'dir' : f.type === ftp.FileType.SymbolicLink ? 'link' : 'file',
        size: f.size,
        date: f.modifiedAt?.toISOString() ?? '',
      }))
      return { entries }
    } catch (err: any) {
      return { error: err.message ?? String(err) }
    }
  })

  ipcMain.handle('ftp:download', async (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'ftp') return { error: 'Not an FTP session' }

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), path.basename(remotePath)),
    })
    if (canceled || !filePath) return { canceled: true }

    try {
      await s.client.downloadTo(filePath, remotePath)
      return { ok: true, path: filePath }
    } catch (err: any) {
      return { error: err.message ?? String(err) }
    }
  })

  ipcMain.handle('ftp:upload', async (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'ftp') return { error: 'Not an FTP session' }

    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (canceled || !filePaths[0]) return { canceled: true }
    const localPath = filePaths[0]
    const dest = remotePath.endsWith('/') ? remotePath + path.basename(localPath) : remotePath

    try {
      await s.client.uploadFrom(localPath, dest)
      return { ok: true }
    } catch (err: any) {
      return { error: err.message ?? String(err) }
    }
  })

  ipcMain.handle('ftp:mkdir', async (_e, sessionId: string, remotePath: string) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'ftp') return { error: 'Not an FTP session' }

    try {
      await s.client.ensureDir(remotePath)
      return { ok: true }
    } catch (err: any) {
      return { error: err.message ?? String(err) }
    }
  })

  ipcMain.handle('ftp:delete', async (_e, sessionId: string, remotePath: string, isDir: boolean) => {
    const s = sessions.get(sessionId)
    if (!s || s.kind !== 'ftp') return { error: 'Not an FTP session' }

    try {
      if (isDir) await s.client.removeDir(remotePath)
      else await s.client.remove(remotePath)
      return { ok: true }
    } catch (err: any) {
      return { error: err.message ?? String(err) }
    }
  })
}
