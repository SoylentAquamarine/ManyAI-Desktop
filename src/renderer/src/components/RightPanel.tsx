import { useState, useEffect, useRef } from 'react'
import {
  enabledWorkflows, loadWorkflows, saveWorkflows,
  loadRemovedBuiltins, saveRemovedBuiltins,
  type WorkflowDef, type ContextFile,
} from '../lib/workflows'
import { getAllProviders, getAllProviderOrder } from '../lib/providers'
import {
  loadRoutingPrefs, saveRoutingPrefs, DEFAULT_ROUTES,
  type RoutingPrefs, type RouteEntry,
} from '../lib/routing'
import { WORKFLOW_REGISTRY } from '../workflows'
import { loadAllKeys } from '../lib/keyStore'
import { loadEnabledProviders } from '../lib/providerPrefs'
import { LANGUAGES } from '../i18n/config'
import i18n from '../i18n/config'
import type { PanelType } from '../App'
import type { TaskType } from '../lib/providers'

const NAV: { key: PanelType; icon: string; label: string }[] = [
  { key: 'saved',    icon: '📂', label: 'Saved' },
  { key: 'settings', icon: '⚙',  label: 'Settings' },
]

function LanguagePicker() {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState(() => localStorage.getItem('manyai_language') ?? 'en-US')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = (code: string) => {
    setLang(code)
    localStorage.setItem('manyai_language', code)
    i18n.changeLanguage(code)
    setOpen(false)
  }

  const current = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]

  return (
    <div ref={ref} style={{ position: 'relative', padding: '4px 6px 0' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Change language"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, width: '100%',
          padding: '5px 8px', borderRadius: 6,
          background: open ? 'var(--bg2)' : 'transparent',
          border: '1px solid ' + (open ? 'var(--border)' : 'transparent'),
          cursor: 'pointer', fontSize: 11, color: 'var(--text-dim)',
        }}
      >
        <span style={{ fontSize: 14 }}>{current.flag}</span>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current.label}
        </span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 6, right: 6,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          maxHeight: 260, overflowY: 'auto', zIndex: 200,
        }}>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => select(l.code)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 10px',
                background: l.code === lang ? 'var(--accent)' : 'transparent',
                color: l.code === lang ? 'var(--accent-text)' : 'var(--text)',
                border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  activePanel: PanelType | null
  onTogglePanel: (p: PanelType) => void
  showPicker: boolean
  onSelectWorkflow: (type: TaskType) => void
  onCancelPicker: () => void
  onNewWorkflow: () => void
  activeWorkflow: WorkflowDef | null
  continuousState: boolean
  onToggleContinuous: () => void
  onWorkflowSaved: () => void
}

const MAX_CHAIN = 255

export default function RightPanel({
  activePanel, onTogglePanel,
  showPicker, onSelectWorkflow, onCancelPicker, onNewWorkflow,
  activeWorkflow, continuousState, onToggleContinuous,
  onWorkflowSaved,
}: Props) {
  const workflows = enabledWorkflows()
  const [prefs, setPrefs] = useState<RoutingPrefs>(() => loadRoutingPrefs())

  const allProviders = getAllProviders()
  const allProviderOrder = getAllProviderOrder()
  const availableKeys = new Set(Object.keys(loadAllKeys()))
  availableKeys.add('pollinations')
  const enabledMap = loadEnabledProviders()
  const availableProviders = allProviderOrder.filter(k =>
    (k === 'pollinations' || availableKeys.has(k)) && enabledMap[k] !== false
  )

  const updatePrefs = (next: RoutingPrefs) => {
    setPrefs(next)
    saveRoutingPrefs(next)
  }

  const getChain = (task: string): RouteEntry[] =>
    prefs.routes[task] ?? DEFAULT_ROUTES[task] ?? DEFAULT_ROUTES['coding']

  const setChain = (task: string, chain: RouteEntry[]) =>
    updatePrefs({ ...prefs, routes: { ...prefs.routes, [task]: chain } })

  const onProviderChange = (task: string, idx: number, pk: string) => {
    const chain = [...getChain(task)]
    const wts = WORKFLOW_REGISTRY.find(w => w.type === task)?.workflowType ?? ['chat']
    const models = (allProviders[pk]?.models ?? []).filter(m => wts.every(wt => (m.capabilities ?? ['chat']).includes(wt)))
    const model = models[0]?.id ?? allProviders[pk]?.model ?? ''
    // New provider = new instance: fresh GUID so history doesn't bleed across
    chain[idx] = { provider: pk, model, instanceId: crypto.randomUUID() }
    setChain(task, chain)
  }

  const onModelChange = (task: string, idx: number, model: string) => {
    const chain = [...getChain(task)]
    chain[idx] = { ...chain[idx], model }
    setChain(task, chain)
  }

  const onEntryToggle = (task: string, idx: number, enabled: boolean) => {
    const chain = [...getChain(task)]
    chain[idx] = { ...chain[idx], enabled }
    setChain(task, chain)
  }

  const addEntry = (task: string) => {
    const chain = getChain(task)
    if (chain.length >= MAX_CHAIN) return
    const used = new Set(chain.map(e => e.provider))
    const wts = WORKFLOW_REGISTRY.find(w => w.type === task)?.workflowType ?? ['chat']
    const capableModelsFor = (pk: string) =>
      (allProviders[pk]?.models ?? []).filter(m => wts.every(wt => (m.capabilities ?? ['chat']).includes(wt)))
    const next = allProviderOrder.find(k => !used.has(k) && capableModelsFor(k).length > 0) ?? 'pollinations'
    const model = capableModelsFor(next)[0]?.id ?? allProviders[next]?.model ?? ''
    setChain(task, [...chain, { provider: next, model, instanceId: crypto.randomUUID() }])
  }

  const removeEntry = (task: string, idx: number) => {
    const chain = getChain(task).filter((_, i) => i !== idx)
    const fallback = DEFAULT_ROUTES[task] ?? DEFAULT_ROUTES['coding']
    setChain(task, chain.length ? chain : [fallback[0]])
  }

  return (
    <div className="right-panel">
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>

        {showPicker ? (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, padding: '0 4px' }}>New Tab</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 10, padding: '0 4px' }}>
              Choose a workflow type.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {workflows.map(w => (
                <button
                  key={w.type}
                  onClick={() => onSelectWorkflow(w.type as TaskType)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{w.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{w.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{w.description}</div>
                  </div>
                </button>
              ))}
            </div>
            <button
              className="btn-ghost"
              onClick={onNewWorkflow}
              style={{ marginTop: 10, width: '100%', fontSize: 11 }}
            >
              + New Workflow
            </button>
            <button className="btn-ghost" onClick={onCancelPicker} style={{ marginTop: 4, width: '100%', fontSize: 11 }}>
              Cancel
            </button>
          </div>

        ) : activeWorkflow && activePanel === null ? (
          <WorkflowDetail
            workflow={activeWorkflow}
            continuousState={continuousState}
            onToggleContinuous={onToggleContinuous}
            prefs={prefs}
            availableProviders={availableProviders}
            getChain={getChain}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            onEntryToggle={onEntryToggle}
            addEntry={addEntry}
            removeEntry={removeEntry}
            updatePrefs={updatePrefs}
            onWorkflowSaved={onWorkflowSaved}
          />
        ) : null}

      </div>

      <LanguagePicker />

      <div className="right-panel-nav">
        {NAV.map(n => (
          <button
            key={n.key}
            className={`nav-btn ${activePanel === n.key ? 'active' : ''}`}
            onClick={() => onTogglePanel(n.key)}
            title={n.label}
          >
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface DetailProps {
  workflow: WorkflowDef
  continuousState: boolean
  onToggleContinuous: () => void
  prefs: RoutingPrefs
  availableProviders: string[]
  getChain: (task: string) => RouteEntry[]
  onProviderChange: (task: string, idx: number, pk: string) => void
  onModelChange: (task: string, idx: number, model: string) => void
  onEntryToggle: (task: string, idx: number, enabled: boolean) => void
  addEntry: (task: string) => void
  removeEntry: (task: string, idx: number) => void
  updatePrefs: (next: RoutingPrefs) => void
  onWorkflowSaved: () => void
}

function WorkflowDetail({
  workflow, continuousState, onToggleContinuous,
  availableProviders, getChain, onProviderChange, onModelChange, onEntryToggle, addEntry, removeEntry,
  onWorkflowSaved,
}: DetailProps) {
  const task = workflow.type
  const workflowTypes = WORKFLOW_REGISTRY.find(w => w.type === task)?.workflowType ?? workflow.workflowType ?? ['chat']
  const canEdit = true
  const chain = getChain(task)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    label: workflow.label,
    icon: workflow.icon,
    description: workflow.description,
    systemPrompt: workflow.systemPrompt ?? '',
    contextFiles: workflow.contextFiles ?? [] as ContextFile[],
  })
  const [addingFile, setAddingFile] = useState(false)

  // Reset form when switching to a different workflow tab
  useEffect(() => {
    setEditing(false)
    setForm({
      label: workflow.label,
      icon: workflow.icon,
      description: workflow.description,
      systemPrompt: workflow.systemPrompt ?? '',
      contextFiles: workflow.contextFiles ?? [],
    })
  }, [workflow.type])

  // Keep form in sync with saved workflow when not editing
  useEffect(() => {
    if (!editing) {
      setForm({
        label: workflow.label,
        icon: workflow.icon,
        description: workflow.description,
        systemPrompt: workflow.systemPrompt ?? '',
        contextFiles: workflow.contextFiles ?? [],
      })
    }
  }, [workflow, editing])

  const pickFile = async () => {
    setAddingFile(true)
    try {
      const result = await window.api.openFiles()
      if (!('error' in result)) {
        setForm(f => {
          const existing = new Set((f.contextFiles).map(x => x.path))
          const newFiles = result.files.filter(x => !existing.has(x.path))
          return { ...f, contextFiles: [...f.contextFiles, ...newFiles] }
        })
      }
    } finally {
      setAddingFile(false)
    }
  }

  const removeFile = (path: string) => {
    setForm(f => ({ ...f, contextFiles: f.contextFiles.filter(x => x.path !== path) }))
  }

  const saveEdit = () => {
    const updated: WorkflowDef = {
      type: workflow.type,
      label: form.label.trim() || workflow.label,
      icon: form.icon.trim() || workflow.icon,
      description: form.description.trim(),
      enabled: workflow.enabled,
      builtIn: false,
      systemPrompt: form.systemPrompt.trim() || undefined,
      contextFiles: form.contextFiles.length ? form.contextFiles : undefined,
    }

    const allWorkflows = loadWorkflows()
    const filtered = allWorkflows.filter(w => w.type !== updated.type)
    saveWorkflows([...filtered, updated])

    if (workflow.builtIn) {
      const removed = loadRemovedBuiltins()
      if (!removed.includes(workflow.type)) {
        saveRemovedBuiltins([...removed, workflow.type])
      }
    }

    setEditing(false)
    onWorkflowSaved()
  }

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {text}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 4px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <input
            value={form.icon}
            onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
            style={{ width: 36, fontSize: 18, padding: '2px 4px', textAlign: 'center' }}
          />
        ) : (
          <span style={{ fontSize: 20, flexShrink: 0 }}>{workflow.icon}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              style={{ fontSize: 13, fontWeight: 600, padding: '2px 6px', width: '100%' }}
            />
          ) : (
            <div style={{ fontWeight: 700, fontSize: 13 }}>{workflow.label}</div>
          )}
        </div>
        {canEdit && !editing && (
          <button
            className="btn-ghost"
            onClick={() => setEditing(true)}
            style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
          >Edit</button>
        )}
      </div>

      {/* Description */}
      {(editing || workflow.description) && (
        <div>
          {sectionLabel('Description')}
          {editing ? (
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Short description"
              style={{ fontSize: 11, padding: '4px 8px' }}
            />
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{workflow.description}</div>
          )}
        </div>
      )}

      {/* Instructions */}
      {(editing || workflow.systemPrompt) && (
        <div>
          {sectionLabel('Instructions')}
          {editing ? (
            <textarea
              value={form.systemPrompt}
              onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="Silently prepended before every message…"
              rows={4}
              style={{ fontSize: 11, resize: 'vertical', fontFamily: 'inherit', padding: '6px 8px' }}
            />
          ) : (
            <div style={{
              fontSize: 11, color: 'var(--text)', background: 'var(--bg2)',
              borderRadius: 6, padding: '6px 8px', wordBreak: 'break-word',
              whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto',
            }}>
              {workflow.systemPrompt}
            </div>
          )}
        </div>
      )}

      {/* Attached files */}
      {(editing || !!workflow.contextFiles?.length) && (
        <div>
          {sectionLabel('Attached Files')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(editing ? form.contextFiles : workflow.contextFiles ?? []).map(f => (
              <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ flex: 1, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📄 {f.name}
                </span>
                {editing && (
                  <button
                    onClick={() => removeFile(f.path)}
                    style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', flexShrink: 0, padding: '0 2px' }}
                  >✕</button>
                )}
              </div>
            ))}
            {editing && (
              <button
                className="btn-ghost"
                onClick={pickFile}
                disabled={addingFile}
                style={{ fontSize: 11, padding: '3px 8px', alignSelf: 'flex-start', marginTop: 2 }}
              >{addingFile ? 'Picking…' : '+ Attach Files'}</button>
            )}
          </div>
        </div>
      )}

      {/* Save / Cancel */}
      {editing && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-primary" onClick={saveEdit} style={{ flex: 1, fontSize: 11, padding: '5px 0' }}>
            Save
          </button>
          <button className="btn-ghost" onClick={() => setEditing(false)} style={{ flex: 1, fontSize: 11, padding: '5px 0' }}>
            Cancel
          </button>
        </div>
      )}

      {/* Parallel */}
      <div>
        {sectionLabel('Parallel')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {chain.map((entry, idx) => {
            const avail = availableProviders.includes(entry.provider)
            const entryEnabled = entry.enabled !== false
            // Only show models whose capabilities include ALL of this workflow's types
            const allProvidersNow = getAllProviders()
            const modelList = (allProvidersNow[entry.provider]?.models ?? []).filter(m =>
              workflowTypes.every(wt => (m.capabilities ?? ['chat']).includes(wt))
            )
            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--bg2)', borderRadius: 6, padding: '6px 8px', opacity: entryEnabled ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={entryEnabled}
                    onChange={e => onEntryToggle(task, idx, e.target.checked)}
                    style={{ flexShrink: 0 }}
                    title={entryEnabled ? 'Disable this provider' : 'Enable this provider'}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 16, flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  {!avail && (
                    <span style={{ fontSize: 9, color: 'var(--accent2, #e55)', background: 'rgba(238,85,85,0.12)', borderRadius: 3, padding: '1px 4px' }}>no key</span>
                  )}
                  {chain.length > 1 && (
                    <button
                      onClick={() => removeEntry(task, idx)}
                      style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '0 2px' }}
                    >✕</button>
                  )}
                </div>
                <select
                  value={entry.provider}
                  style={{ width: '100%', fontSize: 11 }}
                  onChange={e => onProviderChange(task, idx, e.target.value)}
                >
                  {getAllProviderOrder()
                    .filter(pk => {
                      const p = getAllProviders()[pk]
                      return p?.models.some(m => workflowTypes.every(wt => (m.capabilities ?? ['chat']).includes(wt)))
                    })
                    .map(pk => (
                      <option key={pk} value={pk}>
                        {getAllProviders()[pk]?.name ?? pk}{availableProviders.includes(pk) ? '' : ' (no key)'}
                      </option>
                    ))}
                </select>
                <select
                  value={entry.model}
                  style={{ width: '100%', fontSize: 11 }}
                  onChange={e => onModelChange(task, idx, e.target.value)}
                >
                  {modelList.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )
          })}
          {chain.length < MAX_CHAIN && (
            <button
              className="btn-ghost"
              onClick={() => addEntry(task)}
              style={{ fontSize: 11, padding: '3px 8px', alignSelf: 'flex-start' }}
            >+ Add provider</button>
          )}
        </div>
      </div>

      {/* Continuous state */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={continuousState}
          onChange={onToggleContinuous}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Continuous state</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            {continuousState ? 'History carried between messages' : 'Each message starts fresh'}
          </div>
        </div>
      </label>

    </div>
  )
}
