import { useState, useEffect } from 'react'
import { loadWorkflows, saveWorkflows, saveRemovedBuiltins, loadRemovedBuiltins, WorkflowDef } from '../../lib/workflows'
import { WORKFLOW_TYPES, WORKFLOW_TYPE_LABELS, type WorkflowType } from '../../lib/workflowTypes'

const BLANK: Omit<WorkflowDef, 'builtIn'> = {
  type: '',
  label: '',
  icon: '🔧',
  description: '',
  enabled: true,
  workflowType: ['chat'],
  systemPrompt: '',
  contextFiles: [],
}

interface WorkflowsScreenProps {
  autoOpenAdd?: boolean
  onAutoOpenAddConsumed?: () => void
}

export default function WorkflowsScreen({ autoOpenAdd = false, onAutoOpenAddConsumed }: WorkflowsScreenProps) {
  const [workflows, setWorkflows]   = useState<WorkflowDef[]>(() => loadWorkflows())
  const [removedBuiltins, setRemovedBuiltins] = useState<string[]>(() => loadRemovedBuiltins())
  const [saved, setSaved]           = useState(false)
  const [editing, setEditing]       = useState<WorkflowDef | null>(null)
  const [form, setForm]             = useState<typeof BLANK>(BLANK)
  const [formErr, setFormErr]       = useState('')
  const [addingFile, setAddingFile] = useState(false)

  const toggle = (type: string) => {
    setWorkflows(prev => prev.map(w => w.type === type ? { ...w, enabled: !w.enabled } : w))
  }

  const handleSave = () => {
    saveWorkflows(workflows)
    saveRemovedBuiltins(removedBuiltins)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const openAdd = () => {
    setForm({ ...BLANK, contextFiles: [] })
    setFormErr('')
    setEditing({ ...BLANK, builtIn: false } as WorkflowDef)
  }

  useEffect(() => {
    if (autoOpenAdd) {
      openAdd()
      onAutoOpenAddConsumed?.()
    }
  }, [])

  const openEdit = (w: WorkflowDef) => {
    setForm({
      type: w.type,
      label: w.label,
      icon: w.icon,
      description: w.description,
      enabled: w.enabled,
      workflowType: w.workflowType ?? ['chat'],
      systemPrompt: w.systemPrompt ?? '',
      contextFiles: w.contextFiles ?? [],
    })
    setFormErr('')
    setEditing(w)
  }

  const closeForm = () => setEditing(null)

  const submitForm = () => {
    if (!form.label.trim()) { setFormErr('Label is required.'); return }
    const isEditingBuiltIn = editing?.builtIn ?? false
    const slug = form.type.trim() || form.label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!slug) { setFormErr('Could not derive a type slug.'); return }

    const updated: WorkflowDef = {
      type: slug,
      label: form.label.trim(),
      icon: form.icon.trim() || '🔧',
      description: form.description.trim(),
      enabled: form.enabled,
      builtIn: false,
      workflowType: (form.workflowType as WorkflowType[] | undefined)?.length ? form.workflowType as WorkflowType[] : ['chat'],
      systemPrompt: form.systemPrompt?.trim() || undefined,
      contextFiles: form.contextFiles?.length ? form.contextFiles : undefined,
    }

    setWorkflows(prev => {
      // Remove the original (built-in or custom) entry with this slug, then add updated
      const filtered = prev.filter(w => w.type !== slug)
      return [...filtered, updated]
    })
    if (isEditingBuiltIn) {
      setRemovedBuiltins(prev => prev.includes(slug) ? prev : [...prev, slug])
    }
    setEditing(null)
  }

  const deleteWorkflow = (type: string, isBuiltIn: boolean) => {
    if (isBuiltIn) {
      setRemovedBuiltins(prev => [...prev, type])
    }
    setWorkflows(prev => prev.filter(w => w.type !== type))
  }

  const pickContextFile = async () => {
    setAddingFile(true)
    try {
      const result = await window.api.openFiles()
      if (!('error' in result)) {
        setForm(f => {
          const existing = new Set((f.contextFiles ?? []).map(x => x.path))
          const newFiles = result.files.filter(x => !existing.has(x.path))
          return { ...f, contextFiles: [...(f.contextFiles ?? []), ...newFiles] }
        })
      }
    } finally {
      setAddingFile(false)
    }
  }

  const removeContextFile = (path: string) => {
    setForm(f => ({ ...f, contextFiles: (f.contextFiles ?? []).filter(x => x.path !== path) }))
  }

  const enabledCount = workflows.filter(w => w.enabled).length

  return (
    <div className="screen">
      <div className="api-toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Workflows</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            Enabled workflows appear in the new-tab picker.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-ghost" onClick={openAdd} style={{ fontSize: 11 }}>
            + Add
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="api-list">
        {[...workflows].sort((a, b) => a.label.localeCompare(b.label)).map(w => (
          <div key={w.type} className="route-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{w.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{w.label}</span>
                {w.workflowType?.map(wt => (
                  <span key={wt} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--bg2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                    {WORKFLOW_TYPE_LABELS[wt] ?? wt}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{w.description}</div>
              {(w.contextFiles?.length || w.systemPrompt) && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, opacity: 0.7 }}>
                  {w.systemPrompt && '📝 instructions '}
                  {w.contextFiles?.length ? `📎 ${w.contextFiles.length} attached file${w.contextFiles.length > 1 ? 's' : ''}` : ''}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn-ghost"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => openEdit(w)}
              >Edit</button>
              <>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger, #e55)' }}
                  onClick={() => deleteWorkflow(w.type, w.builtIn)}
                >Delete</button>
                <label className="toggle" title={w.enabled ? 'Disable' : 'Enable'}>
                  <input type="checkbox" checked={w.enabled} onChange={() => toggle(w.type)} />
                  <span className="toggle-slider" />
                </label>
              </>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)' }}>
        {enabledCount} of {workflows.length} workflows enabled
      </div>

      {/* Add / Edit modal */}
      {editing && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeForm}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              width: 480,
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {workflows.some(w => w.type === form.type && !w.builtIn) ? 'Edit Workflow' : 'Add Workflow'}
            </div>

            <Field label="Label *">
              <input
               
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Job Hunting"
              />
            </Field>

            <Field label="Icon">
              <input
               
                value={form.icon}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                placeholder="Emoji, e.g. 💼"
                style={{ width: 80 }}
              />
            </Field>

            <Field label="Workflow Type" hint="Select all types this workflow requires. Only models supporting ALL selected types will be available.">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: '6px 0' }}>
                {WORKFLOW_TYPES.map(wt => {
                  const current = (form.workflowType as WorkflowType[] | undefined) ?? []
                  const checked = current.includes(wt)
                  return (
                    <label key={wt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', minWidth: 200 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const next: WorkflowType[] = e.target.checked
                            ? [...current.filter(c => c !== wt), wt]
                            : current.filter(c => c !== wt)
                          setForm(f => ({ ...f, workflowType: next }))
                        }}
                      />
                      {WORKFLOW_TYPE_LABELS[wt]}
                    </label>
                  )
                })}
              </div>
            </Field>

            <Field label="Description">
              <input

                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description shown in the tab picker"
              />
            </Field>

            <Field label="Instructions" hint="Silently prepended before every message — tell the AI what to do with the attached files.">
              <textarea
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                placeholder="Analyze the job description I paste against each of the attached resume versions. Tell me which version is the best match and why, then suggest specific improvements."
                rows={5}
                style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
              />
            </Field>

            <Field label="Attached Files" hint="Injected silently into every message. You can select multiple files at once.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(form.contextFiles ?? []).map(f => (
                  <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ flex: 1, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📄 {f.name}
                    </span>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: '1px 6px', flexShrink: 0 }}
                      onClick={() => removeContextFile(f.path)}
                    >✕</button>
                  </div>
                ))}
                <button
                  className="btn-ghost"
                  style={{ fontSize: 11, alignSelf: 'flex-start' }}
                  onClick={pickContextFile}
                  disabled={addingFile}
                >
                  {addingFile ? 'Picking…' : '+ Attach Files'}
                </button>
              </div>
            </Field>

            {formErr && (
              <div style={{ fontSize: 12, color: 'var(--danger, #e55)' }}>{formErr}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={closeForm}>Cancel</button>
              <button className="btn-primary" onClick={submitForm}>
                {workflows.some(w => w.type === form.type && !w.builtIn) ? 'Update' : 'Add Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600 }}>{label}</label>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: -2 }}>{hint}</span>}
      {children}
    </div>
  )
}
