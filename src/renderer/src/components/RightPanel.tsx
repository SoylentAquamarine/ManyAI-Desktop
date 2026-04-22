interface Workflow {
  label: string
  icon: string
  prompt: string
}

const WORKFLOWS: Workflow[] = [
  { icon: '✍️', label: 'Summarize',    prompt: 'Please summarize the following text concisely:\n\n' },
  { icon: '🐛', label: 'Fix code',     prompt: 'Please find and fix the bug in this code:\n\n' },
  { icon: '💡', label: 'Brainstorm',   prompt: 'Give me 10 creative ideas for: ' },
  { icon: '📧', label: 'Write email',  prompt: 'Write a professional email about: ' },
  { icon: '🔍', label: 'Explain',      prompt: 'Explain this clearly and simply:\n\n' },
  { icon: '✏️', label: 'Fix grammar',  prompt: 'Fix the grammar and improve the clarity of:\n\n' },
  { icon: '🌐', label: 'Translate EN', prompt: 'Translate this to English:\n\n' },
  { icon: '📋', label: 'Bullet points',prompt: 'Convert this into clear bullet points:\n\n' },
]

interface Props {
  onWorkflow: (prompt: string) => void
}

export default function RightPanel({ onWorkflow }: Props) {
  return (
    <div className="right-panel">
      <div className="right-panel-title">Workflows</div>
      <div className="workflow-list">
        {WORKFLOWS.map(w => (
          <button
            key={w.label}
            className="workflow-btn"
            onClick={() => onWorkflow(w.prompt)}
            title={w.prompt}
          >
            <span className="workflow-icon">{w.icon}</span>
            <span>{w.label}</span>
          </button>
        ))}
      </div>

      <div className="right-panel-title" style={{ marginTop: 16 }}>Quick actions</div>
      <div className="workflow-list">
        <button className="workflow-btn" onClick={() => onWorkflow('What can you help me with?')}>
          <span className="workflow-icon">❓</span>
          <span>What can you do?</span>
        </button>
        <button className="workflow-btn" onClick={() => onWorkflow('Give me a random interesting fact.')}>
          <span className="workflow-icon">🎲</span>
          <span>Random fact</span>
        </button>
      </div>
    </div>
  )
}
