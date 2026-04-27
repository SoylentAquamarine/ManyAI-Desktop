/**
 * SettingsScreen.tsx — Top-level settings shell with tab navigation.
 *
 * Tabs:
 *   General        — theme, font, data-reset buttons
 *   API            — provider cards with API key entry (ApiScreen)
 *   Workflows      — workflow editor (WorkflowsScreen)
 *   Import/Export  — working directory + per-section backup/restore
 *   About          — credits and links
 */

import { useState } from 'react'
import ApiScreen from './ApiScreen'
import WorkflowsScreen from './WorkflowsScreen'
import AboutScreen from './AboutScreen'
import SmartRoutingScreen from './SmartRoutingScreen'
import { THEMES, loadTheme, saveTheme, type ThemeId } from '../../lib/theme'
import { getWorkingDir, setWorkingDir, getBackupsDir } from '../../lib/workingDir'
import { encryptText, decryptText } from '../../lib/crypto'
import { loadZoom, increaseZoom, decreaseZoom, ZOOM_MIN, ZOOM_MAX } from '../../lib/zoom'
import { FONTS, loadFont, saveFont } from '../../lib/font'

type SettingsTab = 'general' | 'api' | 'workflows' | 'smartrouting' | 'backup' | 'about'

interface SettingsScreenProps {
  /** Which tab to open on mount. */
  initialTab?: SettingsTab
  /** When true, WorkflowsScreen will auto-open the add-workflow form. */
  triggerAdd?: boolean
  onTriggerAddConsumed?: () => void
}

export default function SettingsScreen({
  initialTab = 'general',
  triggerAdd = false,
  onTriggerAddConsumed,
}: SettingsScreenProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  const tabBtn = (key: SettingsTab, label: string) => (
    <button
      onClick={() => setTab(key)}
      style={{
        fontSize: 13,
        padding: '5px 14px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        background: tab === key ? 'var(--accent)' : 'transparent',
        /* Use --accent-text so contrast is correct on all themes */
        color: tab === key ? 'var(--accent-text)' : 'var(--text-dim)',
        fontWeight: tab === key ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
      <div style={{
        display: 'flex', gap: 4, padding: '10px 14px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
        background: 'var(--bg)', flexWrap: 'wrap',
      }}>
        {tabBtn('general',      'General')}
        {tabBtn('api',          'Providers')}
        {tabBtn('workflows',    'Workflows')}
        {tabBtn('smartrouting', 'Smart Routing')}
        {tabBtn('backup',       'Import / Export')}
        {tabBtn('about',        'About')}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'general'   && <GeneralSettings />}
        {tab === 'api'       && <ApiScreen />}
        {tab === 'workflows' && (
          <WorkflowsScreen
            autoOpenAdd={triggerAdd}
            onAutoOpenAddConsumed={onTriggerAddConsumed}
          />
        )}
        {tab === 'smartrouting' && <SmartRoutingScreen />}
        {tab === 'backup' && <BackupConfig />}
        {tab === 'about'  && <AboutScreen />}
      </div>
    </div>
  )
}

// ── GeneralSettings ───────────────────────────────────────────────────────────

function GeneralSettings() {
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme())
  const [zoom,  setZoom]  = useState(() => loadZoom())
  const [font,  setFont]  = useState(() => loadFont())

  const handleTheme = (id: ThemeId) => {
    setTheme(id)
    saveTheme(id)
  }

  const handleFont = (id: string) => {
    setFont(id)
    saveFont(id)
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="api-list">

        {/* ── Appearance ─────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '24px 0 8px' }}>Appearance</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0 12px' }}>
          {[...THEMES].sort((a, b) => a.label.localeCompare(b.label)).map(t => (
            <button
              key={t.id}
              onClick={() => handleTheme(t.id)}
              title={t.label}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                border: theme === t.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)', fontSize: 11, maxWidth: 80,
              }}
            >
              <div style={{
                width: 40, height: 26, borderRadius: 4,
                background: t.preview,
                border: '1px solid var(--border)',
              }} />
              <span style={{ textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}>
                {t.label}
              </span>
            </button>
          ))}
        </div>

        {/* ── Font size ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
          <button
            className="btn-ghost"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom(decreaseZoom())}
            style={{ fontSize: 18, padding: '2px 12px', lineHeight: 1 }}
            title="Decrease font size"
          >A−</button>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', minWidth: 44, textAlign: 'center' }}>
            {zoom}%
          </span>
          <button
            className="btn-ghost"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom(increaseZoom())}
            style={{ fontSize: 18, padding: '2px 12px', lineHeight: 1 }}
            title="Increase font size"
          >A+</button>
        </div>

        {/* ── Font face ──────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '16px 0 8px' }}>Font Face</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0 12px' }}>
          {FONTS.map(f => (
            <button
              key={f.id}
              onClick={() => handleFont(f.id)}
              title={f.label}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                border: font === f.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                fontFamily: f.stack,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Data ───────────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '20px 0 8px' }}>Data</div>
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
            if (confirm('Remove all stored API keys? You will need to re-enter them.')) {
              Object.keys(localStorage)
                .filter(k => k.startsWith('manyai_key_'))
                .forEach(k => localStorage.removeItem(k))
            }
          }}>Reset</button>
        </div>


      </div>
    </div>
  )
}

// ── Shared backup types ───────────────────────────────────────────────────────

interface BackupDoc {
  exportedAt?: string
  version?: number
  apiKeys?: Record<string, string> | { encrypted: string }
  providers?: {
    custom?: unknown
    removed?: unknown
    order?: unknown
    enabled?: unknown
    modelsEnabled?: unknown
  }
  workflows?: {
    custom?: unknown
    removedBuiltins?: unknown
    routing?: unknown
  }
}

// ── Shared merge helpers (pure) ───────────────────────────────────────────────

function parseStored<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

function mergeObj(existing: Record<string, unknown>, backup: Record<string, unknown>) {
  return { ...backup, ...existing } // existing keys win
}

function mergeById<T extends Record<string, unknown>>(idKey: string, existing: T[], backup: T[]) {
  const seen = new Set(existing.map(x => x[idKey]))
  return [...existing, ...backup.filter(x => !seen.has(x[idKey]))]
}

function mergeUnion<T>(existing: T[], backup: T[]) {
  const seen = new Set(existing)
  return [...existing, ...backup.filter(x => !seen.has(x))]
}

function applyMerged<T>(
  key: string,
  backupVal: unknown,
  mergeMode: boolean,
  merge: (existing: T, backup: T) => T,
) {
  if (!mergeMode) { localStorage.setItem(key, JSON.stringify(backupVal)); return }
  const existing = parseStored<T>(key)
  if (existing == null) { localStorage.setItem(key, JSON.stringify(backupVal)); return }
  localStorage.setItem(key, JSON.stringify(merge(existing, backupVal as T)))
}

// ── SectionImport — inline file-pick + conflict-choice per section ────────────

interface SectionImportProps {
  backupsDir?: string
  onApply: (doc: BackupDoc, mergeMode: boolean) => Promise<string | void>
}

function SectionImport({ backupsDir, onApply }: SectionImportProps) {
  const [doc,       setDoc]       = useState<BackupDoc | null>(null)
  const [filename,  setFilename]  = useState('')
  const [mergeMode, setMergeMode] = useState(true)
  const [loadErr,   setLoadErr]   = useState('')
  const [status,    setStatus]    = useState('')
  const [open,      setOpen]      = useState(false)

  const handlePick = async () => {
    const result = await window.api.openFile(backupsDir)
    if ('error' in result) return
    try {
      setDoc(JSON.parse(result.content) as BackupDoc)
      setFilename(result.name)
      setLoadErr('')
      setStatus('')
      setOpen(true)
    } catch {
      setLoadErr('Could not parse file — is it a valid ManyAI backup?')
      setOpen(true)
    }
  }

  const handleApply = async () => {
    if (!doc) return
    const msg = await onApply(doc, mergeMode)
    setStatus(msg ?? 'Done. Reload the app to apply changes.')
    setOpen(false)
    setDoc(null)
    setFilename('')
  }

  const reset = () => { setOpen(false); setDoc(null); setFilename(''); setLoadErr(''); setStatus('') }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-ghost" onClick={handlePick}>Import…</button>
        {status && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{status}</span>}
      </div>
      {open && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--surface)',
        }}>
          {loadErr ? (
            <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 8 }}>{loadErr}</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>{filename}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name={`conflict-${filename}`} checked={mergeMode} onChange={() => setMergeMode(true)} />
                  Keep existing — only import what's missing
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name={`conflict-${filename}`} checked={!mergeMode} onChange={() => setMergeMode(false)} />
                  Override — replace with backup
                </label>
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {!loadErr && <button className="btn-primary" onClick={handleApply}>Apply</button>}
            <button className="btn-ghost" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── BackupConfig ──────────────────────────────────────────────────────────────

function BackupConfig() {
  const [workDir,   setWorkDir]   = useState(() => getWorkingDir())
  const [dirStatus, setDirStatus] = useState('')
  const [keyStatus, setKeyStatus] = useState('')
  const [provStatus, setProvStatus] = useState('')
  const [wfStatus,  setWfStatus]  = useState('')
  const [encryptKeys, setEncryptKeys] = useState(false)
  const [exportPwd,   setExportPwd]   = useState('')
  const [exportPwdConfirm, setExportPwdConfirm] = useState('')

  const backupsDir = getBackupsDir() || undefined
  const date = () => new Date().toISOString().slice(0, 10)
  const parse = (key: string) => {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    try { return JSON.parse(raw) } catch { return raw }
  }
  const saveJson = async (filename: string, data: unknown, setStatus: (s: string) => void) => {
    const result = await window.api.saveFile(filename, JSON.stringify(data, null, 2), backupsDir)
    if ('error' in result && result.error !== 'Cancelled') setStatus(`Save failed: ${result.error}`)
    else setStatus('Exported.')
    setTimeout(() => setStatus(''), 4000)
  }

  // ── Working directory ─────────────────────────────────────────────────────

  const handlePickDir = async () => {
    const result = await window.api.selectDirectory(workDir || undefined)
    if ('error' in result) return
    setWorkingDir(result.path)
    setWorkDir(result.path)
    setDirStatus('Working directory updated.')
    await window.api.ensureDir(`${result.path}/images`)
    await window.api.ensureDir(`${result.path}/backups`)
    setTimeout(() => setDirStatus(''), 3000)
  }

  const handleClearDir = () => {
    setWorkingDir('')
    setWorkDir('')
    setDirStatus('Working directory cleared.')
    setTimeout(() => setDirStatus(''), 3000)
  }

  // ── API Keys export ───────────────────────────────────────────────────────

  const handleExportKeys = async () => {
    if (encryptKeys) {
      if (!exportPwd) { setKeyStatus('Enter a password.'); return }
      if (exportPwd !== exportPwdConfirm) { setKeyStatus('Passwords do not match.'); return }
    }
    const rawKeys: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith('manyai_key_')) rawKeys[k.replace('manyai_key_', '')] = localStorage.getItem(k) ?? ''
    }
    let apiKeys: Record<string, string> | { encrypted: string } = rawKeys
    if (encryptKeys) apiKeys = { encrypted: await encryptText(JSON.stringify(rawKeys), exportPwd) }
    await saveJson(`manyai-apikeys-${date()}.json`, { exportedAt: new Date().toISOString(), version: 1, apiKeys }, setKeyStatus)
    setExportPwd(''); setExportPwdConfirm('')
  }

  const handleImportKeys = async (doc: BackupDoc, mergeMode: boolean): Promise<string> => {
    if (!doc.apiKeys) return 'No API keys found in file.'
    const isEncrypted = typeof doc.apiKeys === 'object' && 'encrypted' in (doc.apiKeys as object)
    let keys: Record<string, string>
    if (isEncrypted) {
      const pwd = prompt('Enter decryption password for API keys:') ?? ''
      try {
        keys = JSON.parse(await decryptText((doc.apiKeys as { encrypted: string }).encrypted, pwd))
      } catch {
        return 'Wrong password or corrupted data.'
      }
    } else {
      keys = doc.apiKeys as Record<string, string>
    }
    Object.entries(keys).forEach(([k, v]) => {
      if (!v) return
      const lsKey = `manyai_key_${k}`
      if (mergeMode && localStorage.getItem(lsKey)) return
      localStorage.setItem(lsKey, v)
    })
    return 'API keys imported. Reload to apply.'
  }

  // ── Providers export/import ───────────────────────────────────────────────

  const handleExportProviders = () => saveJson(`manyai-providers-${date()}.json`, {
    exportedAt: new Date().toISOString(), version: 1,
    providers: {
      custom:        parse('manyai_custom_providers'),
      removed:       parse('manyai_removed_providers'),
      order:         parse('manyai_provider_order'),
      enabled:       parse('manyai_provider_enabled'),
      modelsEnabled: parse('manyai_model_enabled'),
    },
  }, setProvStatus)

  const handleImportProviders = async (doc: BackupDoc, mergeMode: boolean): Promise<string> => {
    const p = doc.providers
    if (!p) return 'No provider data found in file.'
    if (p.custom        != null) applyMerged<Record<string, unknown>[]>('manyai_custom_providers',  p.custom,        mergeMode, (ex, bk) => mergeById('id',   ex, bk))
    if (p.removed       != null) applyMerged<string[]>                 ('manyai_removed_providers', p.removed,       mergeMode, (ex, bk) => mergeUnion(ex, bk))
    if (p.order         != null) applyMerged<string[]>                 ('manyai_provider_order',    p.order,         mergeMode, (ex, bk) => mergeUnion(ex, bk))
    if (p.enabled       != null) applyMerged<Record<string, unknown>>  ('manyai_provider_enabled',  p.enabled,       mergeMode, (ex, bk) => mergeObj(ex, bk))
    if (p.modelsEnabled != null) applyMerged<Record<string, unknown>>  ('manyai_model_enabled',     p.modelsEnabled, mergeMode, (ex, bk) => mergeObj(ex, bk))
    return 'Providers imported. Reload to apply.'
  }

  // ── Workflows export/import ───────────────────────────────────────────────

  const handleExportWorkflows = () => saveJson(`manyai-workflows-${date()}.json`, {
    exportedAt: new Date().toISOString(), version: 1,
    workflows: {
      custom:          parse('manyai_workflows'),
      removedBuiltins: parse('manyai_removed_builtins'),
      routing:         parse('manyai_routing_prefs'),
    },
  }, setWfStatus)

  const handleImportWorkflows = async (doc: BackupDoc, mergeMode: boolean): Promise<string> => {
    const w = doc.workflows
    if (!w) return 'No workflow data found in file.'
    if (w.custom          != null) applyMerged<Record<string, unknown>[]>     ('manyai_workflows',        w.custom,          mergeMode, (ex, bk) => mergeById('type', ex, bk))
    if (w.removedBuiltins != null) applyMerged<string[]>                      ('manyai_removed_builtins', w.removedBuiltins, mergeMode, (ex, bk) => mergeUnion(ex, bk))
    if (w.routing         != null) applyMerged<{ routes: Record<string, unknown> }>('manyai_routing_prefs', w.routing, mergeMode, (ex, bk) => ({ ...bk, routes: { ...bk.routes, ...ex.routes } }))
    return 'Workflows imported. Reload to apply.'
  }

  // ── Section heading style ─────────────────────────────────────────────────

  const sectionHead = (label: string) => (
    <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '24px 0 8px', fontWeight: 600 }}>
      {label}
    </div>
  )
  const divider = () => <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div className="api-list">

        {/* ── Working Directory ───────────────────────────────── */}
        {sectionHead('Working Directory')}
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
          Root folder for images, logs, and backups. Sub-folders are created automatically.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            readOnly value={workDir}
            placeholder="No working directory set"
            style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--text-dim)' }}
          />
          <button className="btn-primary" onClick={handlePickDir} style={{ whiteSpace: 'nowrap' }}>Browse…</button>
          {workDir && <button className="btn-ghost" onClick={handleClearDir} style={{ whiteSpace: 'nowrap' }}>Clear</button>}
        </div>
        {workDir && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
            Images → <code>{workDir}/images/</code><br />
            Logs → <code>{workDir}/manyai.log</code><br />
            Backups → <code>{workDir}/backups/</code>
          </div>
        )}
        {dirStatus && <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 6 }}>{dirStatus}</div>}

        {divider()}

        {/* ── API Keys ────────────────────────────────────────── */}
        {sectionHead('API Keys')}
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
          Export your API keys to a JSON file. You can encrypt them with a password.
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox" checked={encryptKeys}
            onChange={e => { setEncryptKeys(e.target.checked); setExportPwd(''); setExportPwdConfirm('') }}
          />
          Encrypt with a password (AES-256)
        </label>

        {encryptKeys && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <input type="password" placeholder="Encryption password" value={exportPwd}
              onChange={e => setExportPwd(e.target.value)} style={{ fontSize: 13 }} />
            <input type="password" placeholder="Confirm password" value={exportPwdConfirm}
              onChange={e => setExportPwdConfirm(e.target.value)} style={{ fontSize: 13 }} />
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              You will need this password to import encrypted keys.
            </div>
          </div>
        )}
        {!encryptKeys && (
          <div style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10 }}>
            Keys will be stored in plain text — keep the file private.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-primary" onClick={handleExportKeys}>Export API Keys</button>
          {keyStatus && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{keyStatus}</span>}
        </div>
        <SectionImport backupsDir={backupsDir} onApply={handleImportKeys} />

        {divider()}

        {/* ── Providers ───────────────────────────────────────── */}
        {sectionHead('Providers')}
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
          Export and import custom providers, ordering, and enabled state.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-primary" onClick={handleExportProviders}>Export Providers</button>
          {provStatus && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{provStatus}</span>}
        </div>
        <SectionImport backupsDir={backupsDir} onApply={handleImportProviders} />

        {divider()}

        {/* ── Workflows ───────────────────────────────────────── */}
        {sectionHead('Workflows')}
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
          Export and import custom workflows, hidden built-ins, and routing configuration.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-primary" onClick={handleExportWorkflows}>Export Workflows</button>
          {wfStatus && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{wfStatus}</span>}
        </div>
        <SectionImport backupsDir={backupsDir} onApply={handleImportWorkflows} />

      </div>
    </div>
  )
}
