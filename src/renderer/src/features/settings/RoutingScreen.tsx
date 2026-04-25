import { useState } from 'react'
import { getAllProviders, getAllProviderOrder } from '../../lib/providers'
import {
  TASK_META, DEFAULT_ROUTES,
  loadRoutingPrefs, saveRoutingPrefs, RouteEntry, RoutingPrefs,
} from '../../lib/routing'
import { loadAllKeys } from '../../lib/keyStore'
import { loadEnabledProviders } from '../../lib/providerPrefs'
import { loadWorkflows } from '../../lib/workflows'

const MAX_CHAIN = 4

export default function RoutingScreen() {
  const [prefs, setPrefs] = useState<RoutingPrefs>(() => loadRoutingPrefs())
  const [saved, setSaved] = useState(false)

  const allProviders = getAllProviders()
  const allProviderOrder = getAllProviderOrder()
  const availableKeys = new Set(Object.keys(loadAllKeys()))
  availableKeys.add('pollinations')
  const enabledMap = loadEnabledProviders()
  const availableProviders = allProviderOrder.filter(k =>
    (k === 'pollinations' || availableKeys.has(k)) && enabledMap[k] !== false
  )

  const allWorkflows = loadWorkflows()

  // Providers that have at least one image-gen model
  const imageProviderKeys = allProviderOrder.filter(pk =>
    allProviders[pk]?.models.some(m => m.supportsImageGen)
  )

  const getImageModels = (pk: string) =>
    allProviders[pk]?.models.filter(m => m.supportsImageGen) ?? []

  const getChain = (task: string): RouteEntry[] =>
    prefs.routes[task] ?? DEFAULT_ROUTES[task] ?? DEFAULT_ROUTES['general']

  const setChain = (task: string, chain: RouteEntry[]) =>
    setPrefs(prev => ({ ...prev, routes: { ...prev.routes, [task]: chain } }))

  const updateEntry = (task: string, idx: number, patch: Partial<RouteEntry>) => {
    const chain = [...getChain(task)]
    chain[idx] = { ...chain[idx], ...patch }
    setChain(task, chain)
  }

  const isImageWorkflow = (task: string) =>
    !!(allWorkflows.find(w => w.type === task)?.isImage)

  const onProviderChange = (task: string, idx: number, pk: string) => {
    const models = isImageWorkflow(task) ? getImageModels(pk) : (allProviders[pk]?.models ?? [])
    const model = models[0]?.id ?? allProviders[pk]?.model ?? ''
    updateEntry(task, idx, { provider: pk, model })
  }

  const addEntry = (task: string) => {
    const chain = getChain(task)
    if (chain.length >= MAX_CHAIN) return
    const used = new Set(chain.map(e => e.provider))
    const candidates = isImageWorkflow(task) ? imageProviderKeys : allProviderOrder
    const next = candidates.find(k => !used.has(k)) ?? candidates[0] ?? 'pollinations'
    const models = isImageWorkflow(task) ? getImageModels(next) : (allProviders[next]?.models ?? [])
    const model = models[0]?.id ?? allProviders[next]?.model ?? ''
    setChain(task, [...chain, { provider: next, model }])
  }

  const removeEntry = (task: string, idx: number) => {
    const chain = getChain(task).filter((_, i) => i !== idx)
    const fallback = DEFAULT_ROUTES[task] ?? DEFAULT_ROUTES['general']
    setChain(task, chain.length ? chain : [fallback[0]])
  }

  const handleSave = () => {
    saveRoutingPrefs(prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const resetDefaults = () => {
    const reset: RoutingPrefs = { autoDetect: true, routes: { ...DEFAULT_ROUTES } }
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

        {/* Per-task chains — all workflows including image */}
        {allWorkflows.map(w => {
          const task = w.type
          const meta = TASK_META[task] ?? w
          const chain = getChain(task)
          const imgWorkflow = !!w.isImage
          const providerList = imgWorkflow ? imageProviderKeys : allProviderOrder

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
                  const modelList = imgWorkflow
                    ? getImageModels(entry.provider)
                    : (allProviders[entry.provider]?.models.filter(m => !m.supportsImageGen) ?? [])
                  return (
                    <div key={idx} className="chain-row">
                      <span className="chain-num">{idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx+1}th`}</span>
                      <select value={entry.provider} style={{ flex: 1 }}
                        onChange={e => onProviderChange(task, idx, e.target.value)}>
                        {providerList.map(pk => (
                          <option key={pk} value={pk}>
                            {allProviders[pk]?.name ?? pk}{availableProviders.includes(pk) ? '' : ' (no key)'}
                          </option>
                        ))}
                      </select>
                      <select value={entry.model} style={{ flex: 1 }}
                        onChange={e => updateEntry(task, idx, { model: e.target.value })}>
                        {modelList.map(m => (
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
    image: 'generate image of, draw, paint, create a picture…',
    coding: 'code, function, bug, debug, python, javascript, sql…',
    reasoning: 'calculate, solve, analyze, logic, math, step-by-step…',
    creative: 'write a story, poem, creative, brainstorm, fiction…',
    summarization: 'summarize, summary, tldr, key points, overview…',
    translation: 'translate, in Spanish, in French, en español…',
    general: '(everything else — the final fallback)',
  }
  return ex[task] ?? ''
}
