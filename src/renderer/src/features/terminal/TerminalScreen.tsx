import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { workflowBus } from '../../lib/workflowBus'
import '@xterm/xterm/css/xterm.css'

type Protocol = 'ssh' | 'telnet' | 'sftp' | 'ftp' | 'ftps'

interface FtpEntry {
  name: string
  type: 'file' | 'dir' | 'link'
  size: number
  date: string
}

interface SavedConn {
  host: string
  port: string
  username: string
  protocol: Protocol
}

const DEFAULT_PORTS: Record<Protocol, string> = {
  ssh: '22', telnet: '23', sftp: '22', ftp: '21', ftps: '990',
}

const STORAGE_KEY = 'manyai_terminal_connection'

function loadSaved(): SavedConn {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { host: '', port: '22', username: '', protocol: 'ssh' }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ── File browser (SFTP / FTP) ─────────────────────────────────────────────────

function FileBrowser({ sessionId, protocol }: { sessionId: string; protocol: 'sftp' | 'ftp' | 'ftps' }) {
  const [cwd, setCwd] = useState('/')
  const [entries, setEntries] = useState<FtpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newDirName, setNewDirName] = useState('')
  const [showNewDir, setShowNewDir] = useState(false)
  const isSftp = protocol === 'sftp'

  const list = useCallback(async (dir: string) => {
    setLoading(true)
    setError('')
    const result = isSftp
      ? await window.api.terminal.sftpList(sessionId, dir)
      : await window.api.terminal.ftpList(sessionId, dir)
    setLoading(false)
    if ('error' in result) { setError(result.error); return }
    const sorted = [...result.entries].sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1
      if (a.type !== 'dir' && b.type === 'dir') return 1
      return a.name.localeCompare(b.name)
    })
    setEntries(sorted)
    setCwd(dir)
  }, [sessionId, isSftp])

  useEffect(() => { list('/') }, [list])

  const navigate = (entry: FtpEntry) => {
    if (entry.type !== 'dir') return
    const next = cwd.endsWith('/') ? `${cwd}${entry.name}` : `${cwd}/${entry.name}`
    list(next)
  }

  const goUp = () => {
    if (cwd === '/') return
    const parent = cwd.substring(0, cwd.lastIndexOf('/')) || '/'
    list(parent)
  }

  const download = async (entry: FtpEntry) => {
    const remote = cwd.endsWith('/') ? `${cwd}${entry.name}` : `${cwd}/${entry.name}`
    isSftp
      ? await window.api.terminal.sftpDownload(sessionId, remote)
      : await window.api.terminal.ftpDownload(sessionId, remote)
  }

  const upload = async () => {
    isSftp
      ? await window.api.terminal.sftpUpload(sessionId, cwd.endsWith('/') ? cwd : cwd + '/')
      : await window.api.terminal.ftpUpload(sessionId, cwd.endsWith('/') ? cwd : cwd + '/')
    list(cwd)
  }

  const mkdir = async () => {
    if (!newDirName.trim()) return
    const remote = cwd.endsWith('/') ? `${cwd}${newDirName}` : `${cwd}/${newDirName}`
    isSftp
      ? await window.api.terminal.sftpMkdir(sessionId, remote)
      : await window.api.terminal.ftpMkdir(sessionId, remote)
    setNewDirName('')
    setShowNewDir(false)
    list(cwd)
  }

  const del = async (entry: FtpEntry) => {
    if (!confirm(`Delete ${entry.name}?`)) return
    const remote = cwd.endsWith('/') ? `${cwd}${entry.name}` : `${cwd}/${entry.name}`
    isSftp
      ? await window.api.terminal.sftpDelete(sessionId, remote, entry.type === 'dir')
      : await window.api.terminal.ftpDelete(sessionId, remote, entry.type === 'dir')
    list(cwd)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'monospace' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button className="btn-ghost" onClick={goUp} disabled={cwd === '/'} style={{ fontSize: 11, padding: '2px 8px' }}>↑ Up</button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cwd}</span>
        <button className="btn-ghost" onClick={() => list(cwd)} style={{ fontSize: 11, padding: '2px 8px' }}>↺ Refresh</button>
        <button className="btn-ghost" onClick={upload} style={{ fontSize: 11, padding: '2px 8px' }}>↑ Upload</button>
        <button className="btn-ghost" onClick={() => setShowNewDir(v => !v)} style={{ fontSize: 11, padding: '2px 8px' }}>+ Dir</button>
      </div>

      {showNewDir && (
        <div style={{ display: 'flex', gap: 6, padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
          <input
            value={newDirName}
            onChange={e => setNewDirName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && mkdir()}
            placeholder="New folder name"
            style={{ fontSize: 12, padding: '3px 6px', flex: 1 }}
            autoFocus
          />
          <button className="btn-primary" onClick={mkdir} style={{ fontSize: 11 }}>Create</button>
          <button className="btn-ghost" onClick={() => setShowNewDir(false)} style={{ fontSize: 11 }}>Cancel</button>
        </div>
      )}

      {error && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: '#e55', background: 'rgba(238,85,85,0.08)', flexShrink: 0 }}>{error}</div>
      )}

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12 }}>Empty directory</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <th style={{ textAlign: 'left', padding: '4px 10px', color: 'var(--text-dim)', fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: 'right', padding: '4px 10px', color: 'var(--text-dim)', fontWeight: 600 }}>Size</th>
                <th style={{ textAlign: 'right', padding: '4px 10px', color: 'var(--text-dim)', fontWeight: 600 }}>Modified</th>
                <th style={{ padding: '4px 6px' }} />
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr
                  key={entry.name}
                  style={{ borderBottom: '1px solid var(--border)', cursor: entry.type === 'dir' ? 'pointer' : 'default' }}
                  onDoubleClick={() => navigate(entry)}
                >
                  <td style={{ padding: '4px 10px', color: entry.type === 'dir' ? 'var(--accent)' : 'var(--text)' }}>
                    {entry.type === 'dir' ? '📁 ' : entry.type === 'link' ? '🔗 ' : '📄 '}
                    {entry.name}
                  </td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>
                    {entry.type === 'file' ? formatSize(entry.size) : '—'}
                  </td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {entry.date ? new Date(entry.date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {entry.type === 'file' && (
                      <button
                        className="btn-ghost"
                        onClick={() => download(entry)}
                        style={{ fontSize: 10, padding: '1px 6px', marginRight: 4 }}
                      >↓</button>
                    )}
                    {entry.type === 'dir' && (
                      <button
                        className="btn-ghost"
                        onClick={() => navigate(entry)}
                        style={{ fontSize: 10, padding: '1px 6px', marginRight: 4 }}
                      >Open</button>
                    )}
                    <button
                      className="btn-ghost"
                      onClick={() => del(entry)}
                      style={{ fontSize: 10, padding: '1px 6px', color: '#e55' }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Main TerminalScreen ───────────────────────────────────────────────────────

export default function TerminalScreen() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<SavedConn & { password: string }>(() => ({ ...loadSaved(), password: '' }))
  const [sessionId] = useState(() => `term-${Date.now()}`)
  const [captureLines, setCaptureLines] = useState(50)

  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])

  const isFileBrowser = connected && (form.protocol === 'sftp' || form.protocol === 'ftp' || form.protocol === 'ftps')
  const isShell = connected && (form.protocol === 'ssh' || form.protocol === 'telnet')

  const initXterm = useCallback((el: HTMLDivElement) => {
    if (xtermRef.current) return
    const term = new Terminal({
      theme: { background: '#1a1a1a', foreground: '#e0e0e0', cursor: '#00ff88' },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13, cursorBlink: true, scrollback: 2000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    xtermRef.current = term
    fitRef.current = fit

    term.onData(data => {
      if (connected) window.api.terminal.send(sessionId, data)
    })
  }, [connected, sessionId])

  useEffect(() => {
    if (termRef.current && isShell) initXterm(termRef.current)
  }, [isShell, initXterm])

  useEffect(() => {
    const observer = new ResizeObserver(() => fitRef.current?.fit())
    if (termRef.current) observer.observe(termRef.current)
    return () => observer.disconnect()
  }, [isShell])

  const handleConnect = async () => {
    setError('')
    setConnecting(true)
    const port = parseInt(form.port, 10) || parseInt(DEFAULT_PORTS[form.protocol], 10)

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      host: form.host, port: String(port), username: form.username, protocol: form.protocol,
    }))

    if (form.protocol === 'ssh' || form.protocol === 'telnet') {
      const result = await window.api.terminal.connect({
        sessionId, host: form.host, port,
        username: form.username, password: form.password || undefined,
      })
      if ('error' in result) { setError(result.error); setConnecting(false); return }

      setConnected(true)
      setConnecting(false)

      const offData = window.api.terminal.onData(sessionId, data => xtermRef.current?.write(data))
      const offClose = window.api.terminal.onClose(sessionId, () => {
        xtermRef.current?.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m')
        setConnected(false)
        cleanupRef.current.forEach(fn => fn())
        cleanupRef.current = []
      })
      const offErr = window.api.terminal.onError(sessionId, msg => {
        xtermRef.current?.writeln(`\r\n\x1b[31m[Error: ${msg}]\x1b[0m`)
      })
      cleanupRef.current = [offData, offClose, offErr]

    } else if (form.protocol === 'sftp') {
      const result = await window.api.terminal.sftpConnect({
        sessionId, host: form.host, port,
        username: form.username, password: form.password || undefined,
      })
      if ('error' in result) { setError(result.error); setConnecting(false); return }
      setConnected(true)
      setConnecting(false)

    } else { // ftp / ftps
      const result = await window.api.terminal.ftpConnect({
        sessionId, host: form.host, port,
        username: form.username, password: form.password || undefined,
        secure: form.protocol === 'ftps',
      })
      if ('error' in result) { setError(result.error); setConnecting(false); return }
      setConnected(true)
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    await window.api.terminal.disconnect(sessionId)
    if (isShell) xtermRef.current?.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m')
    setConnected(false)
    cleanupRef.current.forEach(fn => fn())
    cleanupRef.current = []
  }

  const handleCaptureToWorkflow = () => {
    const term = xtermRef.current
    if (!term) return
    const lines: string[] = []
    const count = Math.min(captureLines, term.buffer.active.length)
    const start = Math.max(0, term.buffer.active.length - count)
    for (let i = start; i < term.buffer.active.length; i++) {
      lines.push(term.buffer.active.getLine(i)?.translateToString(true) ?? '')
    }
    const content = lines.join('\n').trim()
    if (!content) return
    workflowBus.publish({
      targetTabId: 'active',
      payload: {
        source: `terminal:${form.host}`,
        timestamp: new Date().toISOString(),
        contentType: 'text',
        content,
        title: `Terminal output — ${form.host}`,
        metadata: { host: form.host, username: form.username },
      },
    })
  }

  const setProtocol = (p: Protocol) =>
    setForm(f => ({ ...f, protocol: p, port: DEFAULT_PORTS[p] }))

  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{label}</span>
      {node}
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {!connected ? (
          <>
            <select
              value={form.protocol}
              onChange={e => setProtocol(e.target.value as Protocol)}
              style={{ fontSize: 11, padding: '3px 6px' }}
            >
              <option value="ssh">SSH</option>
              <option value="telnet">Telnet</option>
              <option value="sftp">SFTP</option>
              <option value="ftp">FTP</option>
              <option value="ftps">FTPS</option>
            </select>
            {field('Host', (
              <input
                value={form.host}
                onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                placeholder="hostname or IP"
                style={{ fontSize: 12, padding: '3px 6px', width: 140 }}
              />
            ))}
            {field('Port', (
              <input
                value={form.port}
                onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                style={{ fontSize: 12, padding: '3px 6px', width: 48 }}
              />
            ))}
            {field('User', (
              <input
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="username"
                style={{ fontSize: 12, padding: '3px 6px', width: 100 }}
              />
            ))}
            {field('Password', (
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="(optional)"
                style={{ fontSize: 12, padding: '3px 6px', width: 100 }}
                onKeyDown={e => { if (e.key === 'Enter' && form.host && form.username) handleConnect() }}
              />
            ))}
            <button
              className="btn-primary"
              onClick={handleConnect}
              disabled={connecting || !form.host || !form.username}
              style={{ fontSize: 11, padding: '4px 12px', alignSelf: 'flex-end', marginBottom: 1 }}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
            {error && <span style={{ fontSize: 11, color: 'var(--accent2, #e55)' }}>{error}</span>}
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
              {form.protocol.toUpperCase()} {form.username}@{form.host}:{form.port}
            </span>
            <div style={{ flex: 1 }} />
            {isShell && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                  Capture last
                  <input
                    type="number"
                    value={captureLines}
                    onChange={e => setCaptureLines(Math.max(1, parseInt(e.target.value) || 50))}
                    style={{ width: 44, fontSize: 11, padding: '2px 4px' }}
                    min={1} max={500}
                  />
                  lines
                </label>
                <button
                  className="btn-ghost"
                  onClick={handleCaptureToWorkflow}
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  title="Send captured terminal output to the active workflow tab"
                >
                  → Workflow
                </button>
              </>
            )}
            <button
              className="btn-ghost"
              onClick={handleDisconnect}
              style={{ fontSize: 11, padding: '3px 10px', color: 'var(--accent2, #e55)' }}
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {isFileBrowser && (
        <FileBrowser
          sessionId={sessionId}
          protocol={form.protocol as 'sftp' | 'ftp' | 'ftps'}
        />
      )}

      <div
        ref={el => { if (el && isShell && !xtermRef.current) initXterm(el) }}
        style={{
          flex: 1, padding: 4, background: '#1a1a1a', overflow: 'hidden',
          display: isShell ? 'block' : 'none',
        }}
      />

      {!connected && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-dim)', fontSize: 13, fontFamily: 'monospace',
        }}>
          {connecting ? 'Connecting…' : 'Enter connection details above'}
        </div>
      )}
    </div>
  )
}
