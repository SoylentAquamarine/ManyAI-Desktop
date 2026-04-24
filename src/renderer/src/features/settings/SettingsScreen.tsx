export default function SettingsScreen() {
  return (
    <div className="screen">
      <div className="api-list">
        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0 8px' }}>General</div>
        <div className="settings-row">
          <span>Clear all saved responses</span>
          <button className="btn-danger" onClick={() => {
            if (confirm('Delete all saved responses? This cannot be undone.')) {
              localStorage.removeItem('manyai_saved_responses')
            }
          }}>Clear</button>
        </div>
        <div className="settings-row">
          <span>Reset all API keys</span>
          <button className="btn-danger" onClick={() => {
            if (confirm('Remove all stored API keys?')) {
              Object.keys(localStorage)
                .filter(k => k.startsWith('manyai_key_'))
                .forEach(k => localStorage.removeItem(k))
            }
          }}>Reset</button>
        </div>
        <div className="settings-row">
          <span>Reset provider order &amp; preferences</span>
          <button className="btn-ghost" onClick={() => {
            if (confirm('Reset provider order and enabled state to defaults?')) {
              localStorage.removeItem('manyai_provider_order')
              localStorage.removeItem('manyai_provider_enabled')
              localStorage.removeItem('manyai_model_enabled')
            }
          }}>Reset</button>
        </div>

        <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '24px 0 8px' }}>About</div>
        <div className="settings-row">
          <span>ManyAI Desktop</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>v0.1.0</span>
        </div>
        <div className="settings-row">
          <span>Mobile app</span>
          <a href="https://github.com/SoylentAquamarine/ManyAI" target="_blank" style={{ color: 'var(--accent)', fontSize: 12 }}>
            github.com/SoylentAquamarine/ManyAI
          </a>
        </div>
      </div>
    </div>
  )
}
