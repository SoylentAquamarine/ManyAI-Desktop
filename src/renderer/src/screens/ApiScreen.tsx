import { useState } from 'react'
import { PROVIDERS, ROUTING_ORDER, ProviderKey } from '../lib/providers'
import { saveKey, loadKey, deleteKey } from '../lib/keyStore'
import { loadEnabledModels, saveEnabledModels } from '../lib/providerPrefs'
import { testProvider } from '../lib/callProvider'

interface ModelState {
  enabled: boolean
  status: string
  statusOk: boolean | null
  testing: boolean
}

interface ProviderState {
  apiKey: string
  collapsed: boolean
  models: Record<string, ModelState>
}

function initState(): Record<ProviderKey, ProviderState> {
  const enabledModels = loadEnabledModels()
  return Object.fromEntries(
    ROUTING_ORDER.map(pk => {
      const p = PROVIDERS[pk]
      return [pk, {
        apiKey: loadKey(pk) ?? '',
        collapsed: true,
        models: Object.fromEntries(
          p.models.map(m => [`${pk}:${m.id}`, {
            enabled: enabledModels[`${pk}:${m.id}`] !== false,
            status: '',
            statusOk: null,
            testing: false,
          }])
        ),
      }]
    })
  ) as Record<ProviderKey, ProviderState>
}

export default function ApiScreen() {
  const [state, setState] = useState<Record<ProviderKey, ProviderState>>(initState)
  const [saved, setSaved] = useState(false)

  const updateProvider = (pk: ProviderKey, patch: Partial<ProviderState>) =>
    setState(prev => ({ ...prev, [pk]: { ...prev[pk], ...patch } }))

  const updateModel = (pk: ProviderKey, mk: string, patch: Partial<ModelState>) =>
    setState(prev => ({
      ...prev,
      [pk]: {
        ...prev[pk],
        models: { ...prev[pk].models, [mk]: { ...prev[pk].models[mk], ...patch } }
      }
    }))

  const saveAll = () => {
    const modelEnabled: Record<string, boolean> = {}
    ROUTING_ORDER.forEach(pk => {
      const v = state[pk].apiKey.trim()
      if (v) saveKey(pk, v)
      else deleteKey(pk)
      Object.entries(state[pk].models).forEach(([mk, ms]) => {
        modelEnabled[mk] = ms.enabled
      })
    })
    saveEnabledModels(modelEnabled)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testModel = async (pk: ProviderKey, modelId: string) => {
    const mk = `${pk}:${modelId}`
    updateModel(pk, mk, { testing: true, status: '', statusOk: null })
    const provider = { ...PROVIDERS[pk], model: modelId }
    const apiKey = state[pk].apiKey.trim() || undefined
    const result = await testProvider(provider, apiKey)
    updateModel(pk, mk, { testing: false, status: result.message, statusOk: result.ok })
  }

  return (
    <div className="screen">
      <div className="api-toolbar">
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>API keys stored locally on this device.</span>
        <button className="btn-primary" onClick={saveAll}>{saved ? '✓ Saved' : 'Save All'}</button>
      </div>
      <div className="api-list">
        {ROUTING_ORDER.map(pk => {
          const p = PROVIDERS[pk]
          const s = state[pk]
          const isOpen = !s.collapsed
          return (
            <div key={pk} className="api-card" style={{ borderLeftColor: p.color }}>
              <div className="api-card-header" onClick={() => updateProvider(pk, { collapsed: !s.collapsed })}>
                <div className="provider-dot" style={{ background: p.color }} />
                <span className="provider-name">{p.name}</span>
                <span className={`provider-badge ${p.paidOnly ? '' : 'free'}`}>{p.paidOnly ? 'Paid' : 'Free'}</span>
                {!p.needsKey && <span className="provider-badge free">No key</span>}
                <span style={{ color: 'var(--text-dim)', marginLeft: 'auto', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div className="api-card-body">
                  {p.needsKey && (
                    <div className="key-row" style={{ marginBottom: 10 }}>
                      <input
                        type="password"
                        placeholder={p.keyHint ?? `${p.name} API key`}
                        value={s.apiKey}
                        onChange={e => updateProvider(pk, { apiKey: e.target.value })}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  )}
                  <div className="model-list">
                    {p.models.map(m => {
                      const mk = `${pk}:${m.id}`
                      const ms = s.models[mk]
                      return (
                        <div key={mk} className="model-row">
                          <label className="toggle" title="Enable/disable this model">
                            <input
                              type="checkbox"
                              checked={ms?.enabled ?? true}
                              onChange={e => updateModel(pk, mk, { enabled: e.target.checked })}
                            />
                            <span className="toggle-slider" />
                          </label>
                          <span className="model-name">{m.name}</span>
                          <span className="model-id">{m.id}</span>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }}
                            disabled={ms?.testing}
                            onClick={() => testModel(pk, m.id)}
                          >
                            {ms?.testing ? '…' : 'Test'}
                          </button>
                          {ms?.status && (
                            <span className={`model-status ${ms.statusOk ? 'ok' : 'err'}`}>{ms.status}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                    <a href={`https://${p.instructionsUrl}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{p.instructionsUrl}</a>
                    {' · '}{p.goodAt}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
