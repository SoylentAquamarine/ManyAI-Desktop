import { useState } from 'react'
import { loadWorkflows, saveWorkflows, WorkflowDef } from '../lib/workflows'

interface Props {
  onOpenRouting: () => void
}

export default function WorkflowsScreen({ onOpenRouting }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowDef[]>(() => loadWorkflows())
  const [saved, setSaved] = useState(false)

  const toggle = (type: string) => {
    setWorkflows(prev =>
      prev.map(w =>
        w.type === type && w.type !== 'general'   // general is always on
          ? { ...w, enabled: !w.enabled }
          : w
      )
    )
  }

  const handleSave = () => {
    saveWorkflows(workflows)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const enabledCount = workflows.filter(w => w.enabled).length

  return (
    <div className="screen">
      <div className="api-toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Workflows</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            Enabled workflows appear in the new-tab picker. General is always available.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-ghost" onClick={onOpenRouting} style={{ fontSize: 11 }}>
            🔀 Routing →
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="api-list">
        {workflows.map(w => (
          <div key={w.type} className="route-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{w.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{w.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{w.description}</div>
            </div>
            {w.type === 'general' ? (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', opacity: 0.6 }}>always on</span>
            ) : (
              <label className="toggle" title={w.enabled ? 'Disable this workflow' : 'Enable this workflow'}>
                <input
                  type="checkbox"
                  checked={w.enabled}
                  onChange={() => toggle(w.type)}
                />
                <span className="toggle-slider" />
              </label>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)' }}>
        {enabledCount} of {workflows.length} workflows enabled · To configure which provider/model each workflow uses, click <strong>Routing →</strong> above.
      </div>
    </div>
  )
}
