import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { workflowBus } from '../../lib/workflowBus'
import '@xterm/xterm/css/xterm.css'

interface SavedConn {
  host: string
  port: string
  username: string
  protocol: 'ssh' | 'telnet'
}

const STORAGE_KEY = 'manyai_terminal_connection'

function loadSaved(): SavedConn {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { host: '', port: '22', username: '', protocol: 'ssh' }
}

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

  const initXterm = useCallback((el: HTMLDivElement) => {
    if (xtermRef.current) return
    const term = new Terminal({
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#00ff88',
      },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 2000,
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
    if (termRef.current && connected) {
      initXterm(termRef.current)
    }
  }, [connected, initXterm])

  useEffect(() => {
    const observer = new ResizeObserver(() => fitRef.current?.fit())
    if (termRef.current) observer.observe(termRef.current)
    return () => observer.disconnect()
  }, [connected])

  useEffect(() => {
    if (!connected) return
    const fit = fitRef.current
    const term = xtermRef.current
    if (!fit || !term) return
    const { cols, rows } = term
    window.api.terminal.resize(sessionId, cols, rows)
  }, [connected, sessionId])

  const handleConnect = async () => {
    setError('')
    setConnecting(true)

    const port = parseInt(form.port, 10) || (form.protocol === 'ssh' ? 22 : 23)

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      host: form.host, port: String(port), username: form.username, protocol: form.protocol,
    }))

    const result = await window.api.terminal.connect({
      sessionId,
      host: form.host,
      port,
      username: form.username,
      password: form.password || undefined,
    })

    if ('error' in result) {
      setError(result.error)
      setConnecting(false)
      return
    }

    setConnected(true)
    setConnecting(false)

    // Wire up incoming data
    const offData = window.api.terminal.onData(sessionId, data => {
      xtermRef.current?.write(data)
    })
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
  }

  const handleDisconnect = async () => {
    await window.api.terminal.disconnect(sessionId)
    xtermRef.current?.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m')
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
              onChange={e => setForm(f => ({ ...f, protocol: e.target.value as 'ssh' | 'telnet', port: e.target.value === 'ssh' ? '22' : '23' }))}
              style={{ fontSize: 11, padding: '3px 6px' }}
            >
              <option value="ssh">SSH</option>
              <option value="telnet">Telnet</option>
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
              {form.username}@{form.host}:{form.port}
            </span>
            <div style={{ flex: 1 }} />
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

      {/* Terminal area */}
      <div
        ref={el => { if (el && connected && !xtermRef.current) initXterm(el) }}
        style={{
          flex: 1,
          padding: 4,
          background: '#1a1a1a',
          overflow: 'hidden',
          display: connected ? 'block' : 'none',
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
