import { enabledWorkflows } from '../lib/workflows'
import type { TaskType } from '../lib/providers'

interface Props {
  onSelect: (type: TaskType) => void
  onCancel: () => void
}

export default function WorkflowPickerModal({ onSelect, onCancel }: Props) {
  const workflows = enabledWorkflows()

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '24px 20px',
          minWidth: 320,
          maxWidth: 440,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>New Tab</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 18 }}>
          Choose a workflow type for this tab.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {workflows.map(w => (
            <button
              key={w.type}
              onClick={() => onSelect(w.type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg2)'
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{w.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{w.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{w.description}</div>
              </div>
            </button>
          ))}
        </div>

        <button
          className="btn-ghost"
          onClick={onCancel}
          style={{ marginTop: 16, width: '100%' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
