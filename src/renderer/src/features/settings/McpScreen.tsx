import { useState, useEffect, useCallback } from 'react'
import type { McpServerConfig } from '../../../../preload/types/mcp'

interface ServerStatus {
  name: string
  status: string
  error?: string
  toolCount: number
}

const BLANK: McpServerConfig = { name: '', transport: 'stdio', command: '', args: [], env: {} }

export default function McpScreen() {
  const [servers, setServers]   = useState<ServerStatus[]>([])
  const [configs, setConfigs]   = useState<McpServerConfig[]>([])
  const [form, setForm]         = useState<McpServerConfig>(BLANK)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState<string | null>(null)
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText]   = useState('')

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }

  const reload = useCallback(async () => {
    const r = await window.api.listServers()
    if ('error' in r) return
    setServers(r.servers)
    setConfigs(r.configs)
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleAdd = async () => {
    if (!form.name.trim()) { flash('Name is required'); return }
    if (form.transport === 'stdio' && !form.command?.trim()) { flash('Command is required'); return }
    if (form.transport === 'http' && !form.url?.trim()) { flash('URL is required'); return }

    // Parse args (one per line) and env (KEY=VALUE per line)
    const args = argsText.split('\n').map(s => s.trim()).filter(Boolean)
    const env: Record<string, string> = {}
    for (const line of envText.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }

    setSaving(true)
    const r = await window.api.addServer({ ...form, args, env })
    setSaving(false)
    if (r.error) { flash(`Error: ${r.error}`); return }
    flash(r.ok ? `Connected: ${form.name}` : `Failed: ${r.error}`)
    setShowForm(false)
    setForm(BLANK); setArgsText(''); setEnvText('')
    reload()
  }

  const handleRemove = async (name: string) => {
    await window.api.removeServer(name)
    reload()
  }

  const handleReconnect = async (name: string) => {
    const r = await window.api.reconnect(name)
    flash(r.ok ? `Reconnected: ${name}` : `Failed: ${r.error}`)
    reload()
  }

  const statusColor = (s: string) =>
    s === 'connected' ? 'var(--accent)' : '#e55'

  return (
    <div style={{ padding: '20px 24px', maxWidth: 640 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>MCP Servers</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
            Connect external MCP servers to give the agent additional tools.
          </div>
        </div>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Add Server'}
        </button>
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--accent)' }}>
          {msg}
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            <label style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>Name</span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="my-filesystem" style={{ width: '100%', fontSize: 12 }} />
            </label>

            <label style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>Transport</span>
              <select value={form.transport} onChange={e => setForm(f => ({ ...f, transport: e.target.value as 'stdio' | 'http' }))}
                style={{ fontSize: 12 }}>
                <option value="stdio">stdio (local process)</option>
                <option value="http">HTTP (remote server)</option>
              </select>
            </label>

            {form.transport === 'stdio' ? (<>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>Command</span>
                <input value={form.command ?? ''} onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem" style={{ width: '100%', fontSize: 12 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>Args (one per line)</span>
                <textarea value={argsText} onChange={e => setArgsText(e.target.value)}
                  placeholder="/path/to/allowed/dir" rows={2}
                  style={{ width: '100%', fontSize: 12, resize: 'vertical', fontFamily: 'monospace' }} />
              </label>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>Environment (KEY=VALUE per line)</span>
                <textarea value={envText} onChange={e => setEnvText(e.target.value)}
                  placeholder="API_KEY=abc123" rows={2}
                  style={{ width: '100%', fontSize: 12, resize: 'vertical', fontFamily: 'monospace' }} />
              </label>
            </>) : (
              <label style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>URL</span>
                <input value={form.url ?? ''} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="http://localhost:3000" style={{ width: '100%', fontSize: 12 }} />
              </label>
            )}

            <button className="btn-primary" style={{ fontSize: 12, alignSelf: 'flex-start' }}
              onClick={handleAdd} disabled={saving}>
              {saving ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {servers.length === 0 && configs.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0' }}>
          No MCP servers configured. Add one above to give the agent access to external tools.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {configs.map(cfg => {
            const status = servers.find(s => s.name === cfg.name)
            return (
              <div key={cfg.name} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{cfg.name}</span>
                    <span style={{ fontSize: 10, color: statusColor(status?.status ?? 'error') }}>
                      ● {status?.status ?? 'disconnected'}
                    </span>
                    {status?.toolCount ? (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{status.toolCount} tools</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, fontFamily: 'monospace' }}>
                    {cfg.transport === 'stdio' ? `${cfg.command} ${(cfg.args ?? []).join(' ')}` : cfg.url}
                  </div>
                  {status?.error && (
                    <div style={{ fontSize: 11, color: '#e55', marginTop: 2 }}>{status.error}</div>
                  )}
                </div>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => handleReconnect(cfg.name)}>
                  Reconnect
                </button>
                <button className="btn-ghost" style={{ fontSize: 11, color: '#e55' }} onClick={() => handleRemove(cfg.name)}>
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      )}

      {servers.some(s => s.status === 'connected' && s.toolCount > 0) && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Available MCP Tools</div>
          <ToolList />
        </div>
      )}
    </div>
  )
}

function ToolList() {
  const [tools, setTools] = useState<{ fullName: string; description?: string; serverName: string }[]>([])

  useEffect(() => {
    window.api.listTools().then(r => {
      if ('tools' in r) setTools(r.tools)
    })
  }, [])

  if (!tools.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tools.map(t => (
        <div key={t.fullName} style={{
          padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
        }}>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)' }}>{t.fullName}</div>
          {t.description && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{t.description}</div>}
        </div>
      ))}
    </div>
  )
}
