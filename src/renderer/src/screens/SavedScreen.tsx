import { useState, useEffect } from 'react'
import { loadAllResponses, deleteResponse, SavedResponse, DEFAULT_CATEGORIES } from '../lib/savedResponses'

export default function SavedScreen() {
  const [items, setItems] = useState<SavedResponse[]>([])
  const [category, setCategory] = useState('All')
  const [detail, setDetail] = useState<SavedResponse | null>(null)

  const refresh = () => setItems(loadAllResponses())
  useEffect(() => { refresh() }, [])

  const filtered = category === 'All' ? items : items.filter(r => r.category === category)
  const categories = ['All', ...DEFAULT_CATEGORIES]

  const handleDelete = (id: string) => {
    deleteResponse(id)
    refresh()
    if (detail?.id === id) setDetail(null)
  }

  return (
    <div className="screen">
      <div className="saved-toolbar">
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
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
            <div className="saved-card-preview">{item.response}</div>
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
            <div className="saved-detail-response">{detail.response}</div>
            <div className="saved-detail-actions">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(detail.response)}>Copy</button>
              <button className="btn-danger" onClick={() => handleDelete(detail.id)}>Delete</button>
              <button className="btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
