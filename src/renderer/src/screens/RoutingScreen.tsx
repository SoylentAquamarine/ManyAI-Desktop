import { useState } from 'react'
import { PROVIDERS, ROUTING_ORDER, ProviderKey } from '../lib/providers'
import {
  TASK_TYPES, TASK_META, DEFAULT_ROUTES,
  loadRoutingPrefs, saveRoutingPrefs, RouteEntry, RoutingPrefs,
} from '../lib/routing'
import type { ImageProvider } from '../lib/callImageProvider'
import { loadAllKeys } from '../lib/keyStore'
import { loadEnabledProviders } from '../lib/providerPrefs'

const MAX_CHAIN = 4

export default function RoutingScreen() {
  const [prefs, setPrefs] = useState<RoutingPrefs>(() => loadRoutingPrefs())
  const [saved, setSaved] = useState(false)

  const availableKeys = new Set(Object.keys(loadAllKeys()) as ProviderKey[])
  availableKeys.add('pollinations')
  const enabledMap = loadEnabledProviders()
  const availableProviders = ROUTING_ORDER.filter(k =>
    (k === 'pollinations' || availableKeys.has(k)) && enabledMap[k] !== false
  )

  const getChain = (task: string): RouteEntry[] =>
    prefs.routes[task as keyof typeof prefs.routes] ?? DEFAULT_ROUTES[task as keyof typeof DEFAULT_ROUTES]

  const setChain = (task: string, chain: RouteEntry[]) =>
    setPrefs(prev => ({ ...prev, routes: { ...prev.routes, [task]: chain } }))

  const updateEntry = (task: string, idx: number, patch: Partial<RouteEntry>) => {
    const chain = [...getChain(task)]
    chain[idx] = { ...chain[idx], ...patch }
    setChain(task, chain)
  }

  const onProviderChange = (task: string, idx: number, pk: ProviderKey) => {
    updateEntry(task, idx, { provider: pk, model: PROVIDERS[pk].model })
  }

  const addEntry = (task: string) => {
    const chain = getChain(task)
    if (chain.length >= MAX_CHAIN) return
    // pick a provider not already in the chain
    const used = new Set(chain.map(e => e.provider))
    const next = ROUTING_ORDER.find(k => !used.has(k)) ?? 'pollinations'
    setChain(task, [...chain, { provider: next, model: PROVIDERS[next].model }])
  }

  const removeEntry = (task: string, idx: number) => {
    const chain = getChain(task).filter((_, i) => i !== idx)
    setChain(task, chain.length ? chain : [DEFAULT_ROUTES[task as keyof typeof DEFAULT_ROUTES][0]])
  }

  const handleSave = () => {
    saveRoutingPrefs(prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const resetDefaults = () => {
    const reset: RoutingPrefs = { autoDetect: true, imageProvider: 'pollinations', routes: { ...DEFAULT_ROUTES } }
    setPrefs(reset)
    saveRoutingPrefs(reset)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="screen">
      <div className="api-toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Task Routing</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            Each task type tries providers top-to-bottom — first available wins.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={resetDefaults}>Defaults</button>
          <button className="btn-primary" onClick={handleSave}>{saved ? '✓ Saved' : 'Save'}</button>
        </div>
      </div>

      <div className="api-list">
        {/* Auto-detect toggle */}
        <div className="route-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Auto-detect task type</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Reads your prompt and picks the route. You can still override per message.</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={prefs.autoDetect}
              onChange={e => setPrefs(p => ({ ...p, autoDetect: e.target.checked }))} />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Image generation */}
        <div className="route-card">
          <div className="route-card-header">
            <span style={{ fontSize: 20 }}>🎨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Image Generation</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Used when task type is Image</div>
            </div>
          </div>
          <select value={prefs.imageProvider} style={{ width: '100%' }}
            onChange={e => setPrefs(p => ({ ...p, imageProvider: e.target.value as ImageProvider }))}>
            <option value="pollinations">Pollinations (free, no key needed)</option>
            <option value="openai-dalle">OpenAI DALL-E 3 (requires OpenAI key)</option>
          </select>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
            Keywords: <em>generate image of, draw, paint, create a picture…</em>
          </div>
        </div>

        {/* Per-task chains */}
        {TASK_TYPES.filter(t => t !== 'image').map(task => {
          const meta = TASK_META[task]
          const chain = getChain(task)

          return (
            <div key={task} className="route-card">
              <div className="route-card-header">
                <span style={{ fontSize: 20 }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{meta.description}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {chain.map((entry, idx) => {
                  const avail = availableProviders.includes(entry.provider)
                  return (
                    <div key={idx} className="chain-row">
                      <span className="chain-num">{idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx+1}th`}</span>
                      <select value={entry.provider} style={{ flex: 1 }}
                        onChange={e => onProviderChange(task, idx, e.target.value as ProviderKey)}>
                        {ROUTING_ORDER.map(pk => (
                          <option key={pk} value={pk}>
                            {PROVIDERS[pk].name}{availableProviders.includes(pk) ? '' : ' (no key)'}
                          </option>
                        ))}
                      </select>
                      <select value={entry.model} style={{ flex: 1 }}
                        onChange={e => updateEntry(task, idx, { model: e.target.value })}>
                        {PROVIDERS[entry.provider].models.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      {!avail && <span className="no-key-badge">no key</span>}
                      {chain.length > 1 && (
                        <button className="chain-remove" onClick={() => removeEntry(task, idx)} title="Remove">✕</button>
                      )}
                    </div>
                  )
                })}
              </div>

              {chain.length < MAX_CHAIN && (
                <button className="chain-add" onClick={() => addEntry(task)}>+ Add fallback</button>
              )}

              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                Keywords: <em>{getKeywordExamples(task)}</em>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getKeywordExamples(task: string): string {
  const ex: Record<string, string> = {
    coding: 'code, function, bug, debug, python, javascript, sql…',
    reasoning: 'calculate, solve, analyze, logic, math, step-by-step…',
    creative: 'write a story, poem, creative, brainstorm, fiction…',
    summarization: 'summarize, summary, tldr, key points, overview…',
    translation: 'translate, in Spanish, in French, en español…',
    general: '(everything else — the final fallback)',
  }
  return ex[task] ?? ''
}
