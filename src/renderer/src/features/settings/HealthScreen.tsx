import { useState, useEffect, useRef } from 'react'
import { healthCheck, type ProviderSummary, type HealthResult, type HealthConfig } from '../../lib/healthCheck'
import { getLogPath } from '../../lib/workingDir'

const STATUS_COLOR: Record<string, string> = {
  healthy:  'var(--accent)',
  degraded: '#fa0',
  down:     '#e55',
  unknown:  'var(--text-dim)',
}

const STATUS_ICON: Record<string, string> = {
  healthy:  '✓',
  degraded: '⚠',
  down:     '✗',
  unknown:  '?',
}

export default function HealthScreen() {
  const [config, setConfig]       = useState<HealthConfig>(() => healthCheck.loadConfig())
  const [summaries, setSummaries] = useState<ProviderSummary[]>(() => healthCheck.getSummaries())
  const [log, setLog]             = useState<HealthResult[]>(() => healthCheck.loadLog())
  const [running, setRunning]     = useState(false)
  const [progress, setProgress]   = useState({ done: 0, total: 0 })
  const [logFilter, setLogFilter] = useState('')
  const [logLines, setLogLines]   = useState<string[]>([])
  const [loadingLog, setLoadingLog] = useState(false)
  const [selected, setSelected]   = useState<string | null>(null)

  const refresh = () => {
    setSummaries(healthCheck.getSummaries())
    setLog(healthCheck.loadLog())
  }

  const saveConfig = (next: HealthConfig) => {
    setConfig(next)
    healthCheck.saveConfig(next)
  }

  // Run all checks
  const runAll = async () => {
    setRunning(true)
    setProgress({ done: 0, total: 0 })
    await healthCheck.checkAll((done, total, _latest) => {
      setProgress({ done, total })
      refresh()
    })
    setRunning(false)
    refresh()
  }

  // Run single check
  const runOne = async (pk: string) => {
    setSelected(pk)
    await healthCheck.checkProvider(pk)
    setSelected(null)
    refresh()
  }

  // Load app log file content
  const loadLogFile = async () => {
    const logPath = getLogPath()
    if (!logPath) { setLogLines(['No working directory set — log file unavailable.']); return }
    setLoadingLog(true)
    const result = await window.api.readFileByPath(logPath)
    setLoadingLog(false)
    if ('error' in result) { setLogLines([`Error reading log: ${result.error}`]); return }
    setLogLines(result.content.split('\n').filter(Boolean).reverse().slice(0, 500))
  }

  const openLogFile = async () => {
    const logPath = getLogPath()
    if (!logPath) return
    await window.api.openPath(logPath)
  }

  const filteredLog = logFilter
    ? log.filter(e => e.provider.includes(logFilter) || e.model.includes(logFilter) || (e.error ?? '').includes(logFilter))
    : log

  const logPath = getLogPath()

  return (
    <div style={{ padding: '0 0 32px' }}>
      <div className="api-list">

        {/* ── Continuous monitoring ────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '24px 0 8px', fontWeight: 600 }}>
          Continuous Monitoring
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={config.continuousEnabled}
            onChange={e => saveConfig({ ...config, continuousEnabled: e.target.checked })}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Enable hourly health checks</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Runs a lightweight test call to each enabled provider in the background.
              Results feed into the smart router's scoring automatically.
            </div>
          </div>
        </label>

        {config.continuousEnabled && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 12 }}>
            <span style={{ color: 'var(--text-dim)' }}>Interval</span>
            <select
              value={config.intervalMinutes}
              onChange={e => saveConfig({ ...config, intervalMinutes: parseInt(e.target.value) })}
              style={{ fontSize: 12 }}
            >
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
              <option value={120}>Every 2 hours</option>
              <option value={360}>Every 6 hours</option>
            </select>
          </label>
        )}

        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 16px' }} />

        {/* ── Provider status table ─────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 600 }}>Provider Health</div>
          <div style={{ flex: 1 }} />
          {running && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Checking {progress.done}/{progress.total}…
            </span>
          )}
          <button
            className="btn-primary"
            onClick={runAll}
            disabled={running}
            style={{ fontSize: 11, padding: '4px 14px' }}
          >
            {running ? 'Running…' : 'Run All Checks'}
          </button>
        </div>

        {summaries.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            No providers with API keys found. Add keys in Settings → Providers.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Provider</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Model</th>
                  <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Latency</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>Success %</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Last Checked</th>
                  <th style={{ padding: '4px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {summaries.map(s => (
                  <tr key={s.provider} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text)' }}>{s.name}</td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-dim)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.model}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                      <span style={{
                        color: STATUS_COLOR[s.status],
                        fontWeight: 700, fontSize: 13,
                      }} title={s.lastError}>
                        {STATUS_ICON[s.status]}
                      </span>
                      <span style={{ fontSize: 10, color: STATUS_COLOR[s.status], marginLeft: 4 }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-dim)' }}>
                      {s.lastLatencyMs != null ? `${(s.lastLatencyMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-dim)' }}>
                      {s.recentSuccessRate != null ? `${Math.round(s.recentSuccessRate * 100)}%` : '—'}
                    </td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {s.lastChecked ? new Date(s.lastChecked).toLocaleString() : 'Never'}
                    </td>
                    <td style={{ padding: '5px 8px' }}>
                      <button
                        className="btn-ghost"
                        onClick={() => runOne(s.provider)}
                        disabled={running || selected === s.provider}
                        style={{ fontSize: 10, padding: '2px 8px' }}
                      >
                        {selected === s.provider ? '…' : 'Check'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Error details for degraded/down providers */}
        {summaries.filter(s => s.status === 'down' || s.status === 'degraded').map(s => s.lastError && (
          <div key={s.provider} style={{
            fontSize: 11, padding: '6px 10px', marginBottom: 6,
            background: 'rgba(238,85,85,0.08)', borderRadius: 4,
            borderLeft: `3px solid ${STATUS_COLOR[s.status]}`,
          }}>
            <strong>{s.name}</strong> — {s.lastError}
          </div>
        ))}

        <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 16px' }} />

        {/* ── Health check log ─────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 600 }}>Check History</div>
          <div style={{ flex: 1 }} />
          <input
            value={logFilter}
            onChange={e => setLogFilter(e.target.value)}
            placeholder="Filter…"
            style={{ fontSize: 11, padding: '3px 8px', width: 110 }}
          />
          <button className="btn-ghost" onClick={() => { healthCheck.clearLog(); refresh() }} style={{ fontSize: 11, padding: '3px 10px' }}>
            Clear
          </button>
        </div>

        {filteredLog.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            {log.length === 0 ? 'No health checks run yet. Click "Run All Checks" above.' : 'No entries match filter.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Time</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Provider</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Model</th>
                  <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Latency</th>
                  <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Result</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.slice(0, 100).map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: e.success ? 1 : 0.7 }}>
                    <td style={{ padding: '3px 6px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {new Date(e.ts).toLocaleString()}
                    </td>
                    <td style={{ padding: '3px 6px', color: 'var(--text)' }}>{e.provider}</td>
                    <td style={{ padding: '3px 6px', color: 'var(--text-dim)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.model}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text-dim)' }}>
                      {e.latencyMs > 0 ? `${(e.latencyMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td style={{ padding: '3px 6px', textAlign: 'center', color: e.success ? STATUS_COLOR.healthy : STATUS_COLOR.down, fontWeight: 700 }}>
                      {e.success ? '✓' : '✗'}
                    </td>
                    <td style={{ padding: '3px 6px', color: '#e55', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.error ?? ''}
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

        <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 16px' }} />

        {/* ── Application log file ─────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 14, fontWeight: 600 }}>Application Log</div>
          <div style={{ flex: 1 }} />
          {logPath && (
            <>
              <button className="btn-ghost" onClick={loadLogFile} disabled={loadingLog} style={{ fontSize: 11, padding: '3px 10px' }}>
                {loadingLog ? 'Loading…' : 'View in App'}
              </button>
              <button className="btn-ghost" onClick={openLogFile} style={{ fontSize: 11, padding: '3px 10px' }}>
                Open File ↗
              </button>
            </>
          )}
        </div>

        {!logPath ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Set a working directory in Settings → Import / Export to enable file logging.
          </div>
        ) : logLines.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Click "View in App" to load the log, or "Open File" to view in your text editor.
            <br />
            <code style={{ fontSize: 10 }}>{logPath}</code>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>
              Last 500 lines, newest first — <code>{logPath}</code>
            </div>
            <div style={{
              fontFamily: 'Consolas, monospace', fontSize: 10, lineHeight: 1.5,
              background: 'var(--bg2)', borderRadius: 6, padding: '8px 10px',
              maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              color: 'var(--text)',
            }}>
              {logLines.map((line, i) => (
                <div key={i} style={{
                  color: line.includes('[ERROR]') ? '#e55' : line.includes('[WARN]') ? '#fa0' : 'inherit'
                }}>
                  {line}
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
