import { useState } from 'react'
import { getAllProviders } from '../../lib/providers'
import {
  loadProviderOrder, saveProviderOrder,
  loadEnabledProviders, saveEnabledProviders,
  loadSelectedModels, saveSelectedModels,
} from '../../lib/providerPrefs'

export default function ProvidersScreen() {
  const allProviders = getAllProviders()
  const [order, setOrder] = useState<string[]>(() => loadProviderOrder())
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => loadEnabledProviders())
  const [models, setModels] = useState<Record<string, string>>(() => loadSelectedModels())
  const [saved, setSaved] = useState(false)

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setOrder(next)
  }

  const saveAll = () => {
    saveProviderOrder(order)
    saveEnabledProviders(enabled)
    saveSelectedModels(models)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="screen">
      <div className="api-toolbar">
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          Order = routing priority. Top = tried first.
        </span>
        <button className="btn-primary" onClick={saveAll}>{saved ? '✓ Saved' : 'Save'}</button>
      </div>
      <div className="api-list">
        {order.map((pk, idx) => {
          const p = allProviders[pk]
          if (!p) return null
          return (
            <div key={pk} className="provider-order-row" style={{ borderLeftColor: p.color }}>
              <div className="order-arrows">
                <button className="arrow-btn" onClick={() => move(idx, -1)} disabled={idx === 0}>▲</button>
                <span className="order-num">{idx + 1}</span>
                <button className="arrow-btn" onClick={() => move(idx, 1)} disabled={idx === order.length - 1}>▼</button>
              </div>
              <div className="provider-dot" style={{ background: p.color }} />
              <div className="order-info">
                <div className="provider-name">{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.goodAt}</div>
              </div>
              <div className="order-controls">
                {p.models.length > 1 && (
                  <select
                    value={models[pk] ?? p.model}
                    onChange={e => setModels(prev => ({ ...prev, [pk]: e.target.value }))}
                    style={{ fontSize: 12, padding: '4px 8px', width: 180 }}
                  >
                    {p.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                {p.models.length === 1 && (
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.models[0].name}</span>
                )}
                <label className="toggle" style={{ marginLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={enabled[pk] ?? true}
                    onChange={e => setEnabled(prev => ({ ...prev, [pk]: e.target.checked }))}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
