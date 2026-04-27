import { useState } from 'react'
import {
  getAllProviders, getAllProviderOrder,
  upsertProvider, removeProvider,
  type Provider, type ProviderModel,
} from '../../lib/providers'
import { WORKFLOW_TYPES, WORKFLOW_TYPE_LABELS, type WorkflowType } from '../../lib/workflowTypes'
import { saveKey, loadKey, deleteKey } from '../../lib/keyStore'
import { loadEnabledModels, saveEnabledModels } from '../../lib/providerPrefs'
import { callProvider } from '../../lib/callProvider'
import { callImageProvider } from '../../lib/callImageProvider'

// ── Types ────────────────────────────────────────────────────────────────────

interface ModelState {
  enabled: boolean
}

interface ProviderState {
  apiKey: string
  collapsed: boolean
  models: Record<string, ModelState>
}

// ── Blank provider template for the Add form ──────────────────────────────────

const BLANK_PROVIDER: Provider = {
  key: '',
  name: '',
  model: '',
  models: [{ id: '', name: '' }],
  baseUrl: '',
  needsKey: true,
  paidOnly: false,
  color: '#888888',
  bestFor: ['general'],
  goodAt: '',
  notGreatAt: '',
  supportsVision: false,
  instructionsUrl: '',
  keyHint: '',
}

const PRESET_COLORS = [
  '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7',
  '#DDA0DD','#A29BFE','#FFD93D','#74B9FF','#FD79A8',
  '#55EFC4','#F0A500','#888888',
]

// ── Help modal ───────────────────────────────────────────────────────────────

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 24, maxWidth: 480, width: '90%',
        maxHeight: '80%', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Adding a New API Provider</div>

        <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
          <p style={{ margin: '0 0 10px' }}>
            Click <strong>Add New Provider</strong> at the top of the Providers screen to add any
            OpenAI-compatible provider — most modern LLM APIs support this format.
          </p>

          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Required fields:</p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
            <li><strong>Name</strong> — display name (e.g. "My Provider")</li>
            <li><strong>Provider ID</strong> — unique key, lowercase, no spaces (e.g. "myprovider")</li>
            <li><strong>Base URL</strong> — the API endpoint, e.g. <code>https://api.example.com/v1</code></li>
            <li><strong>At least one model</strong> — ID and display name</li>
          </ul>

          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>API format:</p>
          <p style={{ margin: '0 0 10px' }}>
            Custom providers use OpenAI-compatible format (<code>/chat/completions</code>).
            Built-in providers with special formats (Gemini, Anthropic, Cloudflare) are pre-configured.
          </p>

          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>API key:</p>
          <p style={{ margin: '0 0 10px' }}>
            Enter your key in the provider card — it saves automatically when you click away.
            Keys are stored locally on this device only.
          </p>

          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Editing built-in providers:</p>
          <p style={{ margin: 0 }}>
            Built-in providers (Groq, Gemini, etc.) can be edited — your changes are
            saved locally and override the defaults. Deleting a built-in hides it;
            it can be re-added with the same Provider ID.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%' }}
        >Got it</button>
      </div>
    </div>
  )
}

// ── Provider edit/add form ────────────────────────────────────────────────────

interface ProviderFormProps {
  initial: Provider
  isNew: boolean
  onSave: (p: Provider) => void
  onCancel: () => void
}

function ProviderForm({ initial, isNew, onSave, onCancel }: ProviderFormProps) {
  const [form, setForm] = useState<Provider>({ ...initial })
  const [error, setError] = useState('')

  const set = (patch: Partial<Provider>) => setForm(f => ({ ...f, ...patch }))

  const addModel = () =>
    set({ models: [...form.models, { id: '', name: '' }] })

  const updateModel = (idx: number, patch: Partial<ProviderModel>) =>
    set({ models: form.models.map((m, i) => i === idx ? { ...m, ...patch } : m) })

  const removeModel = (idx: number) =>
    set({ models: form.models.filter((_, i) => i !== idx) })

  const handleSave = () => {
    if (!form.name.trim())      return setError('Name is required')
    if (!form.key.trim())       return setError('Provider ID is required')
    if (!/^[a-z0-9_-]+$/.test(form.key)) return setError('Provider ID must be lowercase letters, numbers, hyphens, underscores')
    if (!form.baseUrl.trim())   return setError('Base URL is required')
    if (form.models.length === 0) return setError('At least one model is required')
    if (form.models.some(m => !m.id.trim())) return setError('All model IDs are required')

    const defaultModel = form.models.find(m => m.id === form.model) ? form.model : form.models[0].id
    onSave({ ...form, key: form.key.trim(), model: defaultModel })
  }

  const label = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 3, marginTop: 10 }}>{text}</div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 24, maxWidth: 740, width: '98%',
        maxHeight: '92%', overflowY: 'auto',
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          {isNew ? 'Add New Provider' : `Edit — ${initial.name}`}
        </div>

        {label('Name')}
        <input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. My Provider" style={{ width: '100%' }} />

        {label('Provider ID')}
        <input
          value={form.key}
          onChange={e => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
          placeholder="e.g. myprovider"
          disabled={!isNew}
          style={{ width: '100%', opacity: isNew ? 1 : 0.6 }}
        />
        {!isNew && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>Provider ID cannot be changed after creation</div>}

        {label('Base URL')}
        <input value={form.baseUrl} onChange={e => set({ baseUrl: e.target.value })} placeholder="https://api.example.com/v1" style={{ width: '100%' }} />

        {label('Instructions URL (for getting an API key)')}
        <input value={form.instructionsUrl} onChange={e => set({ instructionsUrl: e.target.value })} placeholder="example.com/api-keys" style={{ width: '100%' }} />

        {label('Good at (short description)')}
        <input value={form.goodAt} onChange={e => set({ goodAt: e.target.value })} placeholder="e.g. Fast general Q&A" style={{ width: '100%' }} />

        {label('Key hint (placeholder text in key input)')}
        <input value={form.keyHint ?? ''} onChange={e => set({ keyHint: e.target.value })} placeholder="e.g. sk-..." style={{ width: '100%' }} />

        {label('Color')}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {PRESET_COLORS.map(c => (
            <div
              key={c}
              onClick={() => set({ color: c })}
              style={{
                width: 22, height: 22, borderRadius: 4, background: c, cursor: 'pointer',
                border: form.color === c ? '2px solid var(--text)' : '2px solid transparent',
              }}
            />
          ))}
          <input
            type="color"
            value={form.color}
            onChange={e => set({ color: e.target.value })}
            style={{ width: 22, height: 22, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4 }}
            title="Custom color"
          />
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.needsKey} onChange={e => set({ needsKey: e.target.checked })} />
            Requires API key
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.paidOnly} onChange={e => set({ paidOnly: e.target.checked })} />
            Paid only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.supportsVision} onChange={e => set({ supportsVision: e.target.checked })} />
            Vision support
          </label>
        </div>

        {label('Models')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.models.map((m, idx) => (
            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={m.id}
                  onChange={e => updateModel(idx, { id: e.target.value })}
                  placeholder="model-id"
                  style={{ flex: 1, fontSize: 12 }}
                />
                <input
                  value={m.name}
                  onChange={e => updateModel(idx, { name: e.target.value })}
                  placeholder="Display name"
                  style={{ flex: 1, fontSize: 12 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="defaultModel"
                    checked={form.model === m.id || (form.model === '' && idx === 0)}
                    onChange={() => set({ model: m.id })}
                  />
                  Default
                </label>
                {form.models.length > 1 && (
                  <button
                    onClick={() => removeModel(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '0 4px' }}
                  >✕</button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', width: '100%' }}>Capabilities</span>
                {WORKFLOW_TYPES.map(wt => (
                  <label key={wt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', minWidth: 160 }}>
                    <input
                      type="checkbox"
                      checked={m.capabilities?.includes(wt) ?? false}
                      onChange={e => {
                        const current: WorkflowType[] = m.capabilities ?? []
                        updateModel(idx, {
                          capabilities: e.target.checked
                            ? [...current.filter(c => c !== wt), wt]
                            : current.filter(c => c !== wt)
                        })
                      }}
                    />
                    {WORKFLOW_TYPE_LABELS[wt]}
                  </label>
                ))}
                <div style={{ width: '100%', display: 'flex', gap: 16, marginTop: 4, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, whiteSpace: 'nowrap' }}>
                    Max tokens
                    <input
                      type="number"
                      min={1}
                      step={256}
                      placeholder="1024"
                      value={m.maxTokens ?? ''}
                      onChange={e => updateModel(idx, { maxTokens: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                      style={{ width: 80, fontSize: 11 }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, whiteSpace: 'nowrap' }}>
                    Image size
                    <input
                      placeholder="1024x1024"
                      value={m.imageSize ?? ''}
                      onChange={e => updateModel(idx, { imageSize: e.target.value.trim() || undefined })}
                      style={{ width: 100, fontSize: 11 }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={m.randomSeed ?? false}
                      onChange={e => updateModel(idx, { randomSeed: e.target.checked || undefined })}
                    />
                    Random seed (bypass cache)
                  </label>
                </div>
              </div>
            </div>
          ))}
          <button className="btn-ghost" onClick={addModel} style={{ fontSize: 11, alignSelf: 'flex-start', padding: '3px 10px' }}>
            + Add model
          </button>
        </div>

        {error && <div style={{ color: '#e55', fontSize: 12, marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 1 }}>
            {isNew ? 'Add Provider' : 'Save Changes'}
          </button>
          <button className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

function buildState(providers: Record<string, Provider>, order: string[]): Record<string, ProviderState> {
  const enabledModels = loadEnabledModels()
  return Object.fromEntries(
    order.map(pk => {
      const p = providers[pk]
      return [pk, {
        apiKey: loadKey(pk) ?? '',
        collapsed: false,
        models: Object.fromEntries(
          p.models.map(m => [`${pk}:${m.id}`, {
            enabled: enabledModels[`${pk}:${m.id}`] !== false,
          }])
        ),
      }]
    })
  )
}

export default function ApiScreen() {
  const [revision, setRevision] = useState(0)
  const allProviders = getAllProviders()
  const order = getAllProviderOrder()

  const [state, setState] = useState<Record<string, ProviderState>>(() => buildState(allProviders, order))
  const [showHelp, setShowHelp] = useState(false)
  const [editTarget, setEditTarget] = useState<Provider | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, 'idle' | 'testing' | 'ok' | string>>({})
  const [capOpen, setCapOpen] = useState<Record<string, boolean>>({})
  const [modelDeleteConfirm, setModelDeleteConfirm] = useState<string | null>(null)
  /** Per-provider key: brief "✓ Saved" flash after blur-save */
  const [keySaved, setKeySaved] = useState<Record<string, boolean>>({})
  const [testingAll, setTestingAll] = useState(false)
  const [testAllProgress, setTestAllProgress] = useState('')

  const refresh = () => {
    const providers = getAllProviders()
    const ord = getAllProviderOrder()
    setState(buildState(providers, ord))
    setRevision(r => r + 1)
  }

  const updateProvider = (pk: string, patch: Partial<ProviderState>) =>
    setState(prev => ({ ...prev, [pk]: { ...prev[pk], ...patch } }))

  /** Save the API key for one provider, called on blur of the key input. */
  const saveKeyForProvider = (pk: string) => {
    const v = state[pk]?.apiKey?.trim()
    if (v) saveKey(pk, v)
    else deleteKey(pk)
    setKeySaved(prev => ({ ...prev, [pk]: true }))
    setTimeout(() => setKeySaved(prev => ({ ...prev, [pk]: false })), 2000)
  }

  /** Toggle a model on/off and immediately persist the enabled map. */
  const toggleModel = (pk: string, mk: string, enabled: boolean) => {
    setState(prev => {
      const next = {
        ...prev,
        [pk]: {
          ...prev[pk],
          models: { ...prev[pk].models, [mk]: { ...prev[pk].models[mk], enabled } }
        }
      }
      // Persist the full enabled map from the new state synchronously
      const modelEnabled: Record<string, boolean> = {}
      Object.entries(next).forEach(([p, ps]) =>
        Object.entries(ps.models).forEach(([m, ms]) => { modelEnabled[m] = ms.enabled })
      )
      saveEnabledModels(modelEnabled)
      return next
    })
  }

  /** True when the model only supports image generation (not chat). */
  const isImageOnly = (pk: string, modelId: string) => {
    const caps = getAllProviders()[pk]?.models.find(m => m.id === modelId)?.capabilities
    return caps != null && caps.includes('image') && !caps.includes('chat')
  }

  /** Run a single model test, using image generation for image-only models. */
  const runTest = async (pk: string, modelId: string, apiKey: string | undefined): Promise<string> => {
    if (isImageOnly(pk, modelId)) {
      try {
        await callImageProvider('a small red square', pk, modelId, apiKey)
        return 'ok'
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    }
    const p = getAllProviders()[pk]
    const result = await callProvider({ ...p, model: modelId }, 'Hi', apiKey)
    return result.error ?? 'ok'
  }

  /** Run Test on every enabled model across all providers, one after another. */
  const handleTestAll = async () => {
    setTestingAll(true)
    setTestResults({})
    const providers = getAllProviders()
    const orderedKeys = [...getAllProviderOrder()].sort((a, b) =>
      (providers[a]?.name ?? a).localeCompare(providers[b]?.name ?? b)
    )
    let done = 0
    const jobs: { pk: string; modelId: string }[] = []
    for (const pk of orderedKeys) {
      const p = providers[pk]
      if (!p) continue
      for (const m of p.models) {
        const mk = `${pk}:${m.id}`
        if (state[pk]?.models[mk]?.enabled !== false) jobs.push({ pk, modelId: m.id })
      }
    }
    for (const { pk, modelId } of jobs) {
      const mk = `${pk}:${modelId}`
      setTestAllProgress(`Testing ${providers[pk]?.name ?? pk} / ${modelId} (${++done}/${jobs.length})`)
      setTestResults(prev => ({ ...prev, [mk]: 'testing' }))
      const apiKey = state[pk]?.apiKey || loadKey(pk) || undefined
      const result = await runTest(pk, modelId, apiKey)
      setTestResults(prev => ({ ...prev, [mk]: result }))
    }
    setTestingAll(false)
    setTestAllProgress('')
  }

  const handleEdit = (provider: Provider) => {
    setEditTarget(provider)
    setIsAdding(false)
  }

  const handleAdd = () => {
    setEditTarget(null)
    setIsAdding(true)
  }

  const handleSaveProvider = (p: Provider) => {
    upsertProvider(p)
    // Persist any API key that's currently in state for this provider
    const v = state[p.key]?.apiKey?.trim()
    if (v) saveKey(p.key, v)
    else if (state[p.key]?.apiKey === '') deleteKey(p.key)
    setEditTarget(null)
    setIsAdding(false)
    refresh()
  }

  const handleDelete = (key: string) => {
    if (deleteConfirm !== key) {
      setDeleteConfirm(key)
      return
    }
    deleteKey(key)
    removeProvider(key)
    setDeleteConfirm(null)
    refresh()
  }

  const handleModelDelete = (pk: string, modelId: string) => {
    const mk = `${pk}:${modelId}`
    if (modelDeleteConfirm !== mk) { setModelDeleteConfirm(mk); return }
    const provider = getAllProviders()[pk]
    if (!provider || provider.models.length <= 1) return
    const updated = { ...provider, models: provider.models.filter(m => m.id !== modelId) }
    if (updated.model === modelId) updated.model = updated.models[0].id
    upsertProvider(updated)
    setModelDeleteConfirm(null)
    refresh()
  }

  const handleTest = async (pk: string, modelId: string) => {
    const mk = `${pk}:${modelId}`
    setTestResults(prev => ({ ...prev, [mk]: 'testing' }))
    const apiKey = state[pk]?.apiKey || loadKey(pk) || undefined
    const result = await runTest(pk, modelId, apiKey)
    setTestResults(prev => ({ ...prev, [mk]: result }))
  }

  const currentProviders = getAllProviders()
  const currentOrder = [...getAllProviderOrder()].sort((a, b) =>
    (currentProviders[a]?.name ?? a).localeCompare(currentProviders[b]?.name ?? b)
  )

  return (
    <div className="screen">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {(editTarget || isAdding) && (
        <ProviderForm
          initial={editTarget ?? BLANK_PROVIDER}
          isNew={isAdding}
          onSave={handleSaveProvider}
          onCancel={() => { setEditTarget(null); setIsAdding(false) }}
        />
      )}

      <div className="api-toolbar">
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>API keys stored locally on this device.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setShowHelp(true)} title="How to add a provider" style={{ fontSize: 12 }}>
            ? Help
          </button>
          <button className="btn-ghost" onClick={handleAdd} style={{ fontSize: 12 }}>
            + Add Provider
          </button>
          <button
            className="btn-primary"
            onClick={handleTestAll}
            disabled={testingAll}
            title="Test every enabled model sequentially"
            style={{ minWidth: 100 }}
          >
            {testingAll ? (testAllProgress || 'Testing…') : 'Test All'}
          </button>
        </div>
      </div>

      <div className="api-list">
        {currentOrder.map(pk => {
          const p = currentProviders[pk]
          if (!p) return null
          const s = state[pk] ?? { apiKey: '', collapsed: false, models: {} }
          const isConfirming = deleteConfirm === pk

          return (
            <div key={`${pk}-${revision}`} className="api-card" style={{ borderLeftColor: p.color }}>
              <div className="api-card-header">
                <div className="provider-dot" style={{ background: p.color }} />
                <span className="provider-name">{p.name}</span>
                <span className={`provider-badge ${p.paidOnly ? '' : 'free'}`}>{p.paidOnly ? 'Paid' : 'Free'}</span>
                {!p.needsKey && <span className="provider-badge free">No key</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => handleEdit(p)}
                  >Edit</button>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, padding: '2px 8px', color: isConfirming ? '#e55' : undefined, borderColor: isConfirming ? '#e55' : undefined }}
                    onClick={() => handleDelete(pk)}
                  >{isConfirming ? 'Confirm Delete' : 'Delete'}</button>
                  {isConfirming && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => setDeleteConfirm(null)}
                    >Cancel</button>
                  )}
                </div>
              </div>

              <div className="api-card-body">
                {p.needsKey && (
                  <div className="key-row" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="password"
                      placeholder={p.keyHint ?? `${p.name} API key`}
                      value={s.apiKey}
                      onChange={e => updateProvider(pk, { apiKey: e.target.value })}
                      onBlur={() => saveKeyForProvider(pk)}
                      style={{ flex: 1 }}
                    />
                    {keySaved[pk] && (
                      <span style={{ fontSize: 11, color: '#4caf50', whiteSpace: 'nowrap' }}>✓ Saved</span>
                    )}
                  </div>
                )}
                <div className="model-list">
                  {p.models.map(m => {
                    const mk = `${pk}:${m.id}`
                    const ms = s.models[mk] ?? { enabled: true }
                    const isCapOpen = !!capOpen[mk]
                    const updateCapabilities = (cap: WorkflowType, checked: boolean) => {
                      const current: WorkflowType[] = m.capabilities ?? []
                      const next = checked
                        ? [...current.filter(c => c !== cap), cap]
                        : current.filter(c => c !== cap)
                      const updated = { ...p, models: p.models.map(x => x.id === m.id ? { ...x, capabilities: next } : x) }
                      upsertProvider(updated)
                      refresh()
                    }
                    return (
                      <div key={mk}>
                        <div className="model-row">
                          <span className="model-name">{m.name}</span>
                          <span className="model-id">{m.id}</span>
                          <button
                            onClick={() => setCapOpen(prev => ({ ...prev, [mk]: !prev[mk] }))}
                            style={{ fontSize: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-dim)', padding: '1px 6px', whiteSpace: 'nowrap' }}
                            title="Edit capabilities for this model"
                          >
                            {isCapOpen ? 'Capabilities ▲' : 'Capabilities ▼'}
                          </button>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 10, padding: '1px 7px', marginLeft: 'auto' }}
                            disabled={testResults[mk] === 'testing'}
                            onClick={() => handleTest(pk, m.id)}
                            title="Send a test message to verify this model works"
                          >
                            {testResults[mk] === 'testing' ? '...' : 'Test'}
                          </button>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 10, padding: '1px 7px', color: modelDeleteConfirm === mk ? '#e55' : undefined, borderColor: modelDeleteConfirm === mk ? '#e55' : undefined }}
                            onClick={() => handleModelDelete(pk, m.id)}
                            title={p.models.length <= 1 ? 'Cannot delete the only model' : 'Delete this model'}
                            disabled={p.models.length <= 1}
                          >{modelDeleteConfirm === mk ? 'Confirm' : 'Delete'}</button>
                          {modelDeleteConfirm === mk && (
                            <button className="btn-ghost" style={{ fontSize: 10, padding: '1px 7px' }} onClick={() => setModelDeleteConfirm(null)}>Cancel</button>
                          )}
                          {testResults[mk] && testResults[mk] !== 'testing' && (
                            <span style={{
                              fontSize: 10,
                              color: testResults[mk] === 'ok' ? '#4caf50' : '#e55',
                              whiteSpace: 'nowrap',
                              maxWidth: 120,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }} title={testResults[mk] === 'ok' ? 'OK' : testResults[mk]}>
                              {testResults[mk] === 'ok' ? '✓ OK' : '✗ ' + testResults[mk]}
                            </span>
                          )}
                        </div>
                        {isCapOpen && (
                          <div style={{ padding: '8px 12px 8px 36px', background: 'var(--bg2)', borderRadius: 6, margin: '4px 0', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', width: '100%', marginBottom: 2 }}>Capabilities</div>
                            {WORKFLOW_TYPES.map(wt => (
                              <label key={wt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer', minWidth: 180 }}>
                                <input
                                  type="checkbox"
                                  checked={m.capabilities?.includes(wt) ?? false}
                                  onChange={e => updateCapabilities(wt, e.target.checked)}
                                />
                                {WORKFLOW_TYPE_LABELS[wt]}
                              </label>
                            ))}
                            <div style={{ width: '100%', display: 'flex', gap: 16, marginTop: 6, alignItems: 'center' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, whiteSpace: 'nowrap' }}>
                                Max tokens
                                <input
                                  type="number"
                                  min={1}
                                  step={256}
                                  placeholder="1024"
                                  value={m.maxTokens ?? ''}
                                  onChange={e => {
                                    const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                                    const updated = { ...p, models: p.models.map(x => x.id === m.id ? { ...x, maxTokens: v } : x) }
                                    upsertProvider(updated)
                                    refresh()
                                  }}
                                  style={{ width: 80, fontSize: 11 }}
                                />
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, whiteSpace: 'nowrap' }}>
                                Image size
                                <input
                                  placeholder="1024x1024"
                                  value={m.imageSize ?? ''}
                                  onChange={e => {
                                    const v = e.target.value.trim() || undefined
                                    const updated = { ...p, models: p.models.map(x => x.id === m.id ? { ...x, imageSize: v } : x) }
                                    upsertProvider(updated)
                                    refresh()
                                  }}
                                  style={{ width: 100, fontSize: 11 }}
                                />
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <input
                                  type="checkbox"
                                  checked={m.randomSeed ?? false}
                                  onChange={e => {
                                    const v = e.target.checked || undefined
                                    const updated = { ...p, models: p.models.map(x => x.id === m.id ? { ...x, randomSeed: v } : x) }
                                    upsertProvider(updated)
                                    refresh()
                                  }}
                                />
                                Random seed (bypass cache)
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {p.instructionsUrl && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                    <a href={`https://${p.instructionsUrl}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{p.instructionsUrl}</a>
                    {p.goodAt && <>{' · '}{p.goodAt}</>}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
