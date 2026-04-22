import type { PanelType } from '../App'

interface Workflow {
  label: string
  icon: string
  prompt: string
}

const WORKFLOWS: Workflow[] = [
  { icon: '✍️', label: 'Summarize',     prompt: 'Please summarize the following text concisely:\n\n' },
  { icon: '🐛', label: 'Fix code',      prompt: 'Please find and fix the bug in this code:\n\n' },
  { icon: '💡', label: 'Brainstorm',    prompt: 'Give me 10 creative ideas for: ' },
  { icon: '📧', label: 'Write email',   prompt: 'Write a professional email about: ' },
  { icon: '🔍', label: 'Explain',       prompt: 'Explain this clearly and simply:\n\n' },
  { icon: '✏️', label: 'Fix grammar',   prompt: 'Fix the grammar and improve the clarity of:\n\n' },
  { icon: '🌐', label: 'Translate EN',  prompt: 'Translate this to English:\n\n' },
  { icon: '📋', label: 'Bullet points', prompt: 'Convert this into clear bullet points:\n\n' },
  { icon: '🎲', label: 'Random fact',   prompt: 'Give me a random interesting fact.' },
]

const NAV: { key: PanelType; icon: string; label: string }[] = [
  { key: 'saved',     icon: '📂', label: 'Saved' },
  { key: 'workflows', icon: '🧩', label: 'Workflows' },
  { key: 'api',       icon: '🔑', label: 'API' },
  { key: 'providers', icon: '⚡', label: 'Providers' },
  { key: 'settings',  icon: '⚙',  label: 'Settings' },
]

interface Props {
  onWorkflow: (prompt: string) => void
  activePanel: PanelType | null
  onTogglePanel: (p: PanelType) => void
}

export default function RightPanel({ onWorkflow, activePanel, onTogglePanel }: Props) {
  return (
    <div className="right-panel">
      <div className="right-panel-title">Workflows</div>
      <div className="workflow-list">
        {WORKFLOWS.map(w => (
          <button key={w.label} className="workflow-btn" onClick={() => onWorkflow(w.prompt)} title={w.prompt}>
            <span className="workflow-icon">{w.icon}</span>
            <span>{w.label}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

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
