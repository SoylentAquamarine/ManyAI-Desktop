import { ipcMain, WebContents } from 'electron'
import { Client as SshClient } from 'ssh2'

interface TermSession {
  client: SshClient
  stream: NodeJS.ReadWriteStream | null
  sender: WebContents
}

const sessions = new Map<string, TermSession>()

function push(sender: WebContents, channel: string, ...args: unknown[]) {
  if (!sender.isDestroyed()) sender.send(channel, ...args)
}

export function registerTerminalIpc(): void {

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
          if (err) {
            client.end()
            resolve({ error: err.message })
            return
          }

          sessions.set(sessionId, { client, stream, sender })
          resolve({ ok: true })

          stream.on('data', (data: Buffer) => {
            push(sender, `term:data:${sessionId}`, data.toString())
          })

          stream.stderr?.on('data', (data: Buffer) => {
            push(sender, `term:data:${sessionId}`, data.toString())
          })

          stream.on('close', () => {
            sessions.delete(sessionId)
            push(sender, `term:close:${sessionId}`)
          })
        })
      })

      client.on('error', err => {
        sessions.delete(sessionId)
        push(sender, `term:error:${sessionId}`, err.message)
        resolve({ error: err.message })
      })

      const connectOpts: Parameters<SshClient['connect']>[0] = {
        host, port, username,
        readyTimeout: 10000,
      }
      if (privateKey) connectOpts.privateKey = privateKey
      else connectOpts.password = password

      client.connect(connectOpts)
    })
  })

  ipcMain.handle('term:send', (_event, sessionId: string, data: string) => {
    const s = sessions.get(sessionId)
    if (!s?.stream) return { error: 'Not connected' }
    s.stream.write(data)
    return { ok: true }
  })

  ipcMain.handle('term:resize', (_event, sessionId: string, cols: number, rows: number) => {
    const s = sessions.get(sessionId)
    if (!s?.stream) return
    ;(s.stream as any).setWindow(rows, cols, 0, 0)
  })

  ipcMain.handle('term:disconnect', (_event, sessionId: string) => {
    const s = sessions.get(sessionId)
    if (s) {
      s.stream?.end()
      s.client.end()
      sessions.delete(sessionId)
    }
    return { ok: true }
  })
}
