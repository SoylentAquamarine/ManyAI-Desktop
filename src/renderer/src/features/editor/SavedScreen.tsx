import { useState, useEffect } from 'react'
import { loadAllResponses, deleteResponse, SavedResponse, DEFAULT_CATEGORIES } from '../../lib/savedResponses'

/** Guess a good default filename from the response content and title. */
function suggestFilename(item: SavedResponse): string {
  // Look for a fenced code block language tag: ```python, ```bash, etc.
  const langMatch = item.response.match(/```(\w+)/)
  const ext: Record<string, string> = {
    python: 'py', py: 'py',
    javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
    bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh',
    powershell: 'ps1', ps1: 'ps1', batch: 'bat', bat: 'bat',
    ruby: 'rb', go: 'go', rust: 'rs', cpp: 'cpp', c: 'c',
    java: 'java', kotlin: 'kt', swift: 'swift', php: 'php',
    html: 'html', css: 'css', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yml',
  }
  const lang = langMatch?.[1]?.toLowerCase() ?? ''
  const extension = ext[lang] ?? 'txt'
  // Sanitise the title for use as a filename
  const base = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'response'
  return `${base}.${extension}`
}

/** Extract just the code from inside the first fenced code block, or return the full response. */
function extractCode(response: string): string {
  const match = response.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return match ? match[1].trimEnd() : response
}

export default function SavedScreen() {
  const [items, setItems] = useState<SavedResponse[]>([])
  const [category, setCategory] = useState('All')
  const [detail, setDetail] = useState<SavedResponse | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const refresh = () => setItems(loadAllResponses())
  useEffect(() => { refresh() }, [])

  const filtered = category === 'All' ? items : items.filter(r => r.category === category)
  const categories = ['All', ...DEFAULT_CATEGORIES]

  const handleDelete = (id: string) => {
    deleteResponse(id)
    refresh()
    if (detail?.id === id) setDetail(null)
  }

  const handleDownload = (item: SavedResponse) => {
    const a = document.createElement('a')
    a.href = item.imageUri!
    a.download = `manyai-${item.id}.png`
    a.click()
  }

  const handleSaveToFile = async (item: SavedResponse) => {
    const filename = suggestFilename(item)
    const content = extractCode(item.response)
    const result = await window.api.saveFile(filename, content)
    if ('path' in result) {
      setSaveMsg(`Saved to ${result.path.split(/[\\/]/).pop()}`)
    } else if (result.error !== 'Cancelled') {
      setSaveMsg(`Error: ${result.error}`)
    }
    setTimeout(() => setSaveMsg(null), 3000)
  }

  return (
    <div className="screen">
      <div className="saved-toolbar">
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 'auto' }}>
          {saveMsg
            ? <span style={{ color: 'var(--accent)' }}>{saveMsg}</span>
            : `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="saved-list">
        {filtered.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
            <div>No saved responses yet.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Use the Save button on any chat response.</div>
          </div>
        )}
        {filtered.map(item => (
          <div key={item.id} className="saved-card" onClick={() => setDetail(item)}>
            <div className="saved-card-title">{item.title}</div>
            <div className="saved-card-meta">
              <span>{item.provider}</span>
              <span>{item.category}</span>
              <span>{new Date(item.savedAt).toLocaleDateString()}</span>
            </div>
            {item.imageUri ? (
              <img src={item.imageUri} alt={item.title} style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 6, marginTop: 6, objectFit: 'cover' }} />
            ) : (
              <div className="saved-card-preview">{item.response}</div>
            )}
          </div>
        ))}
      </div>

      {detail && (
        <div className="saved-detail" onClick={() => setDetail(null)}>
          <div className="saved-detail-box" onClick={e => e.stopPropagation()}>
            <h3>{detail.title}</h3>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {detail.provider} · {detail.category} · {new Date(detail.savedAt).toLocaleString()}
            </div>
            <div className="saved-detail-prompt">{detail.prompt}</div>
            {detail.imageUri ? (
              <img src={detail.imageUri} alt={detail.title} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 12 }} />
            ) : (
              <div className="saved-detail-response">{detail.response}</div>
            )}
            <div className="saved-detail-actions">
              {detail.imageUri ? (
                <button className="btn-ghost" onClick={() => handleDownload(detail)}>Download</button>
              ) : (
                <>
                  <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(detail.response)}>Copy</button>
                  <button className="btn-ghost" onClick={() => handleSaveToFile(detail)}>Save to File…</button>
                </>
              )}
              <button className="btn-danger" onClick={() => handleDelete(detail.id)}>Delete</button>
              <button className="btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
