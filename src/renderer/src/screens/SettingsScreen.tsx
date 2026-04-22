import { useState } from 'react'
import { PROVIDERS, ROUTING_ORDER, ProviderKey } from '../lib/providers'
import { saveKey, loadKey, deleteKey } from '../lib/keyStore'
import { loadEnabledProviders, saveEnabledProviders, loadSelectedModels, saveSelectedModels } from '../lib/providerPrefs'
import { testProvider } from '../lib/callProvider'

interface ProviderState {
  key: string
  enabled: boolean
  model: string
  status: string
  statusOk: boolean | null
  testing: boolean
}

export default function SettingsScreen() {
  const [state, setState] = useState<Record<ProviderKey, ProviderState>>(() => {
    const enabled = loadEnabledProviders()
    const models = loadSelectedModels()
    return Object.fromEntries(
      ROUTING_ORDER.map(k => [k, {
        key: loadKey(k) ?? '',
        enabled: enabled[k] ?? true,
        model: models[k],
        status: '',
        statusOk: null,
        testing: false,
      }])
    ) as Record<ProviderKey, ProviderState>
  })

  const update = (pk: ProviderKey, patch: Partial<ProviderState>) => {
    setState(prev => ({ ...prev, [pk]: { ...prev[pk], ...patch } }))
  }

  const saveAll = () => {
    const enabled = Object.fromEntries(ROUTING_ORDER.map(k => [k, state[k].enabled])) as Record<ProviderKey, boolean>
    const models = Object.fromEntries(ROUTING_ORDER.map(k => [k, state[k].model])) as Record<ProviderKey, string>
    saveEnabledProviders(enabled)
    saveSelectedModels(models)
    ROUTING_ORDER.forEach(k => {
      const v = state[k].key.trim()
      if (v) saveKey(k, v)
      else deleteKey(k)
    })
  }

  const testKey = async (pk: ProviderKey) => {
    const v = state[pk].key.trim()
    update(pk, { testing: true, status: '', statusOk: null })
    const provider = { ...PROVIDERS[pk], model: state[pk].model }
    const result = await testProvider(provider, v || undefined)
    update(pk, { testing: false, status: result.message, statusOk: result.ok })
  }

  return (
    <div className="screen">
      <div className="settings-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>API keys are stored locally on this device.</span>
          <button className="btn-primary" onClick={saveAll}>Save All</button>
        </div>

        {ROUTING_ORDER.map(pk => {
          const p = PROVIDERS[pk]
          const s = state[pk]
          return (
            <div key={pk} className="provider-card" style={{ borderLeftColor: p.color, borderLeftWidth: 3 }}>
              <div className="provider-card-header">
                <div className="provider-dot" style={{ background: p.color }} />
                <span className="provider-name">{p.name}</span>
                <span className={`provider-badge ${p.paidOnly ? '' : 'free'}`}>
                  {p.paidOnly ? 'Paid' : 'Free tier'}
                </span>
                {!p.needsKey && <span className="provider-badge free">No key needed</span>}
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={e => update(pk, { enabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              {p.needsKey && (
                <>
                  <div className="key-row">
                    <input
                      type="password"
                      placeholder={p.keyHint ?? `${p.name} API key`}
                      value={s.key}
                      onChange={e => update(pk, { key: e.target.value })}
                    />
                    <button className="btn-ghost" onClick={() => testKey(pk)} disabled={s.testing}>
                      {s.testing ? '…' : 'Test'}
                    </button>
                  </div>
                  {s.status && (
                    <div className={`key-status ${s.statusOk ? 'ok' : 'err'}`}>{s.status}</div>
                  )}
                </>
              )}

              {p.models.length > 1 && (
                <div style={{ marginTop: 8 }}>
                  <select value={s.model} onChange={e => update(pk, { model: e.target.value })}>
                    {p.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                {p.goodAt} · <a href={`https://${p.instructionsUrl}`} target="_blank" style={{ color: 'var(--accent)' }}>{p.instructionsUrl}</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
