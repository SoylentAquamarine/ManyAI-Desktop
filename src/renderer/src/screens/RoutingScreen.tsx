import { useState } from 'react'
import { PROVIDERS, ROUTING_ORDER, ProviderKey } from '../lib/providers'
import {
  TASK_TYPES, TASK_META, DEFAULT_ROUTES,
  loadRoutingPrefs, saveRoutingPrefs, RouteEntry, RoutingPrefs,
} from '../lib/routing'
import type { ImageProvider } from '../lib/callImageProvider'
import { loadAllKeys } from '../lib/keyStore'
import { loadEnabledProviders } from '../lib/providerPrefs'

export default function RoutingScreen() {
  const [prefs, setPrefs] = useState<RoutingPrefs>(() => loadRoutingPrefs())
  const [saved, setSaved] = useState(false)

  const availableKeys = new Set(Object.keys(loadAllKeys()) as ProviderKey[])
  availableKeys.add('pollinations')
  const enabledMap = loadEnabledProviders()

  // Providers that are configured and enabled (to show in dropdowns)
  const availableProviders = ROUTING_ORDER.filter(k =>
    (k === 'pollinations' || availableKeys.has(k)) && enabledMap[k] !== false
  )

  const setRoute = (task: string, patch: Partial<RouteEntry>) => {
    setPrefs(prev => ({
      ...prev,
      routes: {
        ...prev.routes,
        [task]: { ...(prev.routes[task as keyof typeof prev.routes] ?? DEFAULT_ROUTES[task as keyof typeof DEFAULT_ROUTES]), ...patch },
      },
    }))
  }

  const onProviderChange = (task: string, pk: ProviderKey) => {
    // Reset model to provider default when switching provider
    setRoute(task, { provider: pk, model: PROVIDERS[pk].model })
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
            Route each task type to the best provider. Auto-detect reads your prompt.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Reads your prompt and picks the right route automatically. You can still override per message.
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={prefs.autoDetect}
              onChange={e => setPrefs(p => ({ ...p, autoDetect: e.target.checked }))}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Image generation provider */}
        <div className="route-card">
          <div className="route-card-header">
            <span style={{ fontSize: 20 }}>🎨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Image Generation</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Provider used when task type is detected as Image</div>
            </div>
          </div>
          <div className="route-selectors">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>PROVIDER</div>
              <select
                value={prefs.imageProvider}
                onChange={e => setPrefs(p => ({ ...p, imageProvider: e.target.value as ImageProvider }))}
              >
                <option value="pollinations">Pollinations (free, no key)</option>
                <option value="openai-dalle">OpenAI DALL-E 3 (requires OpenAI key)</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
            Keywords detected: <em>generate image of, draw, paint, create a picture…</em>
          </div>
        </div>

        {/* Per-task-type routing */}
        {TASK_TYPES.filter(t => t !== 'image').map(task => {
          const meta = TASK_META[task]
          const route = prefs.routes[task] ?? DEFAULT_ROUTES[task]
          const selectedProvider = route.provider
          const providerModels = PROVIDERS[selectedProvider]?.models ?? []
          const isAvailable = availableProviders.includes(selectedProvider)

          return (
            <div key={task} className="route-card">
              <div className="route-card-header">
                <span style={{ fontSize: 20 }}>{meta.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{meta.description}</div>
                </div>
                {!isAvailable && (
                  <span style={{ fontSize: 10, color: 'var(--accent2)', background: 'rgba(255,107,107,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                    no key
                  </span>
                )}
              </div>

              <div className="route-selectors">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>PROVIDER</div>
                  <select
                    value={selectedProvider}
                    onChange={e => onProviderChange(task, e.target.value as ProviderKey)}
                  >
                    {ROUTING_ORDER.map(pk => {
                      const avail = availableProviders.includes(pk)
                      return (
                        <option key={pk} value={pk} style={{ color: avail ? '' : '#888' }}>
                          {PROVIDERS[pk].name}{avail ? '' : ' (no key)'}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>MODEL</div>
                  <select
                    value={route.model}
                    onChange={e => setRoute(task, { model: e.target.value })}
                  >
                    {providerModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                Keywords detected: <em>{getKeywordExamples(task)}</em>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getKeywordExamples(task: string): string {
  const examples: Record<string, string> = {
    coding: 'code, function, bug, debug, python, javascript, sql…',
    reasoning: 'calculate, solve, analyze, logic, math, step-by-step…',
    creative: 'write a story, poem, creative, brainstorm, fiction…',
    summarization: 'summarize, summary, tldr, key points, overview…',
    translation: 'translate, in Spanish, in French, en español…',
    general: '(everything else)',
  }
  return examples[task] ?? ''
}
