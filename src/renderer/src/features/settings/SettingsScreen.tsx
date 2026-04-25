import { useState } from 'react'
import ApiScreen from './ApiScreen'
import WorkflowsScreen from './WorkflowsScreen'
import RoutingScreen from './RoutingScreen'

type SettingsTab = 'general' | 'api' | 'workflows' | 'routing' | 'save'

export default function SettingsScreen() {
  const [tab, setTab] = useState<SettingsTab>('general')

  const tabBtn = (key: SettingsTab, label: string) => (
    <button
      onClick={() => setTab(key)}
      style={{
        fontSize: 12, padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
        background: tab === key ? 'var(--accent)' : 'transparent',
        color: tab === key ? '#fff' : 'var(--text-dim)',
        fontWeight: tab === key ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg)', flexWrap: 'wrap' }}>
        {tabBtn('general',   'General')}
        {tabBtn('api',       'API')}
        {tabBtn('workflows', 'Workflows')}
        {tabBtn('routing',   'Workflow Models')}
        {tabBtn('save',      'Save Config')}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'general'   && <GeneralSettings />}
        {tab === 'api'       && <ApiScreen />}
        {tab === 'workflows' && <WorkflowsScreen />}
        {tab === 'routing'   && <RoutingScreen />}
        {tab === 'save'      && <SaveConfig />}
      </div>
    </div>
  )
}

function GeneralSettings() {
  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="api-list">
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0 8px' }}>Data</div>
        <div className="settings-row">
          <span>Clear all saved responses</span>
          <button className="btn-danger" onClick={() => {
            if (confirm('Delete all saved responses? This cannot be undone.')) {
              localStorage.removeItem('manyai_saved_responses')
            }
          }}>Clear</button>
        </div>
        <div className="settings-row">
          <span>Reset all API keys</span>
          <button className="btn-danger" onClick={() => {
            if (confirm('Remove all stored API keys? You will need to re-enter them.')) {
              Object.keys(localStorage)
                .filter(k => k.startsWith('manyai_key_'))
                .forEach(k => localStorage.removeItem(k))
            }
          }}>Reset</button>
        </div>
        <div className="settings-row">
          <span>Reset provider order &amp; preferences</span>
          <button className="btn-ghost" onClick={() => {
            if (confirm('Reset provider order and enabled state to defaults?')) {
              localStorage.removeItem('manyai_provider_order')
              localStorage.removeItem('manyai_provider_enabled')
              localStorage.removeItem('manyai_model_enabled')
            }
          }}>Reset</button>
        </div>

        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0 8px' }}>About</div>
        <div className="settings-row">
          <span>ManyAI Desktop</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>v0.1.0</span>
        </div>
        <div className="settings-row">
          <span>Mobile app</span>
          <a href="https://github.com/SoylentAquamarine/ManyAI" target="_blank" style={{ color: 'var(--accent)', fontSize: 12 }}>
            github.com/SoylentAquamarine/ManyAI
          </a>
        </div>
      </div>
    </div>
  )
}

function SaveConfig() {
  const [encrypt, setEncrypt]   = useState(false)
  const [password, setPassword] = useState('')
  const [status, setStatus]     = useState('')

  const handleSave = () => {
    if (encrypt && !password.trim()) {
      setStatus('Enter a password to encrypt the config.')
      return
    }
    // Placeholder: collect exportable config from localStorage
    const config: Record<string, unknown> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('manyai_')) {
        try { config[k] = JSON.parse(localStorage.getItem(k)!) }
        catch { config[k] = localStorage.getItem(k) }
      }
    }
    const json = JSON.stringify(config, null, 2)
    // Download as file
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'manyai-config.json'
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Config saved.')
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="api-list">
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0 8px' }}>Save Configuration</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
          Export all ManyAI settings (API keys, routing prefs, workflows) to a local file.
        </div>

        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={encrypt}
              onChange={e => { setEncrypt(e.target.checked); if (!e.target.checked) setPassword('') }}
            />
            Encrypt API keys with a password
          </label>

          {encrypt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <input
                type="password"
                placeholder="Encryption password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-primary" onClick={handleSave}>
              Save to File
            </button>
            {status && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{status}</span>}
          </div>
        </div>

        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0 8px' }}>Note</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Encryption support is coming soon. For now the file is saved as plain JSON — keep it private.
        </div>
      </div>
    </div>
  )
}
