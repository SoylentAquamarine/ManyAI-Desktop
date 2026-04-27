import { useState, useEffect } from 'react'
import { smartRouter, type SmartRoutingMode, type SmartRoutingConfig } from '../../lib/smartRouter'
import { loadWorkflows } from '../../lib/workflows'
import { getAllProviders, getAllProviderOrder } from '../../lib/providers'
import { loadAllKeys } from '../../lib/keyStore'
import { loadEnabledProviders } from '../../lib/providerPrefs'
import { WORKFLOW_REGISTRY } from '../../workflows'

const MODE_LABELS: Record<SmartRoutingMode, { label: string; desc: string }> = {
  'best-first': {
    label: 'Best First',
    desc: 'Try the highest-scored provider. Fall back to the next if it fails.',
  },
  'serial': {
    label: 'Serial',
    desc: 'Try providers one at a time in scored order. Stop on first success.',
  },
  'parallel': {
    label: 'Parallel',
    desc: 'Fire all capable providers simultaneously. Same as manual parallel but auto-selected.',
  },
}

export default function SmartRoutingScreen() {
  const [config, setConfig] = useState<SmartRoutingConfig>(() => smartRouter.loadConfig())
  const [log, setLog] = useState(() => smartRouter.loadLog())
  const [logFilter, setLogFilter] = useState('')

  useEffect(() => {
    setLog(smartRouter.loadLog())
  }, [])

  const saveConfig = (next: SmartRoutingConfig) => {
    setConfig(next)
    smartRouter.saveConfig(next)
  }

  const clearLog = () => {
    smartRouter.clearLog()
    setLog([])
  }

  // Build per-provider score table
  const workflows = loadWorkflows()
  const allProviders = getAllProviders()
  const providerOrder = getAllProviderOrder()
  const keys = loadAllKeys()
  const enabledMap = loadEnabledProviders()
  const availableKeys = new Set(Object.keys(keys))
  availableKeys.add('pollinations')

  const smartWorkflows = workflows.filter(w => w.smartRouting && w.type !== 'irc' && w.type !== 'rss' && w.type !== 'terminal')

  const filteredLog = logFilter
    ? log.filter(e => e.workflowType.includes(logFilter) || e.provider.includes(logFilter) || e.model.includes(logFilter))
    : log

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {text}
    </div>
  )

  return (
    <div style={{ padding: '0 0 32px' }}>
      <div className="api-list">

        {/* ── Mode ─────────────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '24px 0 8px', fontWeight: 600 }}>Routing Mode</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {(Object.keys(MODE_LABELS) as SmartRoutingMode[]).map(mode => (
            <label key={mode} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="sr-mode"
                checked={config.mode === mode}
                onChange={() => saveConfig({ ...config, mode })}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{MODE_LABELS[mode].label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{MODE_LABELS[mode].desc}</div>
              </div>
            </label>
          ))}
        </div>

        {/* ── Options ─────────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '8px 0', fontWeight: 600 }}>Options</div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={config.fallbackEnabled}
            onChange={e => saveConfig({ ...config, fallbackEnabled: e.target.checked })}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Fallback on failure</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              In best-first / serial mode, try the next provider if one fails
            </div>
          </div>
        </label>

        {config.mode === 'parallel' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 10 }}>
            <span>Max parallel providers</span>
            <input
              type="number"
              value={config.maxParallel || ''}
              onChange={e => saveConfig({ ...config, maxParallel: Math.max(0, parseInt(e.target.value) || 0) })}
              placeholder="0 = unlimited"
              style={{ width: 80, fontSize: 12, padding: '3px 6px' }}
              min={0} max={20}
            />
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(0 = unlimited)</span>
          </label>
        )}

        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

        {/* ── Provider scores ──────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '8px 0', fontWeight: 600 }}>
          Provider Scores
          <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
            (per workflow, based on recent history)
          </span>
        </div>

        {smartWorkflows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
            No workflows have smart routing enabled yet. Enable it in the workflow's right panel.
          </div>
        ) : smartWorkflows.map(wf => {
          const wfTypes = WORKFLOW_REGISTRY.find(w => w.type === wf.type)?.workflowType ?? ['chat']
          const capable = providerOrder.filter(pk => {
            if (enabledMap[pk] === false) return false
            if (!availableKeys.has(pk)) return false
            const p = allProviders[pk]
            if (!p) return false
            return p.models.some(m => wfTypes.every(wt => (m.capabilities ?? ['chat']).includes(wt)))
          })

          return (
            <div key={wf.type} style={{ marginBottom: 16 }}>
              {sectionLabel(`${wf.icon} ${wf.label}`)}
              {capable.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No capable providers available</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {capable
                    .map(pk => ({ pk, score: smartRouter.scoreProvider(wf.type, pk) }))
                    .sort((a, b) => b.score - a.score)
                    .map(({ pk, score }) => {
                      const recent = smartRouter.loadLog().filter(e => e.workflowType === wf.type && e.provider === pk).slice(0, 20)
                      const calls = recent.length
                      const successes = recent.filter(e => e.success).length
                      return (
                        <div key={pk} style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
                          padding: '3px 0',
                        }}>
                          <div style={{ width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                            {allProviders[pk]?.name ?? pk}
                          </div>
                          <div style={{ flex: 1, height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${score * 100}%`, background: score > 0.7 ? 'var(--accent)' : score > 0.4 ? '#fa0' : '#e55', borderRadius: 3, transition: 'width 0.3s' }} />
                          </div>
                          <div style={{ width: 36, textAlign: 'right', color: 'var(--text-dim)' }}>
                            {Math.round(score * 100)}%
                          </div>
                          <div style={{ width: 56, textAlign: 'right', color: 'var(--text-dim)' }}>
                            {calls === 0 ? 'no data' : `${successes}/${calls}`}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

        {/* ── Routing log ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 600 }}>Routing Log</div>
          <div style={{ flex: 1 }} />
          <input
            value={logFilter}
            onChange={e => setLogFilter(e.target.value)}
            placeholder="Filter…"
            style={{ fontSize: 11, padding: '3px 8px', width: 110 }}
          />
          <button className="btn-ghost" onClick={clearLog} style={{ fontSize: 11, padding: '3px 10px' }}>
            Clear
          </button>
        </div>

        {filteredLog.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {log.length === 0 ? 'No routing history yet.' : 'No entries match filter.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Time</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Workflow</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Provider</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Model</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Mode</th>
                  <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Latency</th>
                  <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.slice(0, 100).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: e.success ? 1 : 0.6 }}>
                    <td style={{ padding: '3px 6px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {new Date(e.ts).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '3px 6px', color: 'var(--text)' }}>{e.workflowType}</td>
                    <td style={{ padding: '3px 6px', color: 'var(--text)' }}>{allProviders[e.provider]?.name ?? e.provider}</td>
                    <td style={{ padding: '3px 6px', color: 'var(--text-dim)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.model}</td>
                    <td style={{ padding: '3px 6px', color: 'var(--text-dim)' }}>{e.mode}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text-dim)' }}>
                      {e.latencyMs > 0 ? `${(e.latencyMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                      {e.success ? '✓' : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLog.length > 100 && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '4px 6px' }}>
                Showing 100 of {filteredLog.length} entries
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
