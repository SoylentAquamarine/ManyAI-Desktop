import { useState } from 'react'
import ApiScreen from './ApiScreen'
import WorkflowsScreen from './WorkflowsScreen'
import RoutingScreen from './RoutingScreen'

type SettingsTab = 'general' | 'api' | 'workflows' | 'routing' | 'backup'

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
        {tabBtn('backup',    'Backup Config')}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'general'   && <GeneralSettings />}
        {tab === 'api'       && <ApiScreen />}
        {tab === 'workflows' && <WorkflowsScreen />}
        {tab === 'routing'   && <RoutingScreen />}
        {tab === 'backup'    && <BackupConfig />}
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

function BackupConfig() {
  const [status, setStatus] = useState('')

  const collectBackup = () => {
    const ls = localStorage

    // API keys — one entry per provider key
    const apiKeys: Record<string, string> = {}
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)!
      if (k.startsWith('manyai_key_')) {
        apiKeys[k.replace('manyai_key_', '')] = ls.getItem(k) ?? ''
      }
    }

    const parse = (key: string) => {
      const raw = ls.getItem(key)
      if (!raw) return undefined
      try { return JSON.parse(raw) } catch { return raw }
    }

    return {
      exportedAt: new Date().toISOString(),
      apiKeys,
      providers: {
        custom:   parse('manyai_custom_providers'),
        removed:  parse('manyai_removed_providers'),
        order:    parse('manyai_provider_order'),
        enabled:  parse('manyai_provider_enabled'),
        modelsEnabled: parse('manyai_model_enabled'),
      },
      workflows: {
        custom:         parse('manyai_workflows'),
        removedBuiltins: parse('manyai_removed_builtins'),
      },
      routing: parse('manyai_routing_prefs'),
    }
  }

  const handleBackup = () => {
    const backup = collectBackup()
    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const date = new Date().toISOString().slice(0, 10)
    a.download = `manyai-backup-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Backup downloaded.')
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="api-list">
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0 8px' }}>Backup Configuration</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.6 }}>
          Downloads a JSON file containing all API keys, custom providers (with full model details and capabilities), custom workflows, routing preferences, and provider enable/order state.
          Keep this file private — it contains your API keys in plain text.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
          <button className="btn-primary" onClick={handleBackup}>
            Download Backup
          </button>
          {status && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{status}</span>}
        </div>
      </div>
    </div>
  )
}
