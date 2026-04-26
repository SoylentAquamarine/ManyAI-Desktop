/**
 * SettingsScreen.tsx — Top-level settings shell with tab navigation.
 *
 * Tabs:
 *   General   — theme, working directory, data-reset buttons
 *   API       — provider cards with API key entry (ApiScreen)
 *   Workflows — workflow editor (WorkflowsScreen)
 *   Backup    — export / import config with optional API-key encryption
 */

import { useState } from 'react'
import ApiScreen from './ApiScreen'
import WorkflowsScreen from './WorkflowsScreen'
import { loadAllResponses } from '../../lib/savedResponses'
import { THEMES, loadTheme, saveTheme, type ThemeId } from '../../lib/theme'
import { getWorkingDir, setWorkingDir, getBackupsDir } from '../../lib/workingDir'
import { encryptText, decryptText } from '../../lib/crypto'
import { loadZoom, increaseZoom, decreaseZoom, ZOOM_MIN, ZOOM_MAX } from '../../lib/zoom'

type SettingsTab = 'general' | 'api' | 'workflows' | 'backup'

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
        {tabBtn('general',   'General')}
        {tabBtn('api',       'API')}
        {tabBtn('workflows', 'Workflows')}
        {tabBtn('backup',    'Backup / Import')}
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
        {tab === 'backup' && <BackupConfig />}
      </div>
    </div>
  )
}

// ── GeneralSettings ───────────────────────────────────────────────────────────

function GeneralSettings() {
  const [theme,   setTheme]   = useState<ThemeId>(() => loadTheme())
  const [zoom,    setZoom]    = useState(() => loadZoom())
  const [workDir, setWorkDir] = useState(() => getWorkingDir())
  const [dirStatus, setDirStatus] = useState('')

  const handleTheme = (id: ThemeId) => {
    setTheme(id)
    saveTheme(id)
  }

  const handlePickDir = async () => {
    const result = await window.api.selectDirectory(workDir || undefined)
    if ('error' in result) return
    setWorkingDir(result.path)
    setWorkDir(result.path)
    setDirStatus('Working directory updated.')
    setTimeout(() => setDirStatus(''), 3000)

    // Ensure sub-directories exist
    await window.api.ensureDir(`${result.path}/images`)
    await window.api.ensureDir(`${result.path}/backups`)
  }

  const handleClearDir = () => {
    setWorkingDir('')
    setWorkDir('')
    setDirStatus('Working directory cleared.')
    setTimeout(() => setDirStatus(''), 3000)
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="api-list">

        {/* ── Appearance ─────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '24px 0 8px' }}>Appearance</div>
        {(() => {
          const groups: { label: string; items: typeof THEMES }[] = []
          for (const t of THEMES) {
            if (t.group) groups.push({ label: t.group, items: [] })
            groups[groups.length - 1]?.items.push(t)
          }
          return groups.map(g => (
            <div key={g.label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {g.label}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {g.items.map(t => (
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
            </div>
          ))
        })()}

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

        {/* ── Working directory ───────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '12px 0 8px' }}>Working Directory</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.6 }}>
          Root folder for images, logs, and backups. Sub-folders are created automatically.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            readOnly
            value={workDir}
            placeholder="No working directory set"
            style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--text-dim)' }}
          />
          <button className="btn-primary" onClick={handlePickDir} style={{ whiteSpace: 'nowrap' }}>
            Browse…
          </button>
          {workDir && (
            <button className="btn-ghost" onClick={handleClearDir} style={{ whiteSpace: 'nowrap' }}>
              Clear
            </button>
          )}
        </div>
        {workDir && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
            Images → <code>{workDir}/images/</code><br />
            Logs → <code>{workDir}/manyai.log</code><br />
            Backups → <code>{workDir}/backups/</code>
          </div>
        )}
        {dirStatus && (
          <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 6 }}>{dirStatus}</div>
        )}

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

        {/* ── About ──────────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '24px 0 8px' }}>About</div>
        <div className="settings-row">
          <span>ManyAI Desktop</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>v0.1.0</span>
        </div>
        <div className="settings-row">
          <span>Mobile app</span>
          <a href="https://github.com/SoylentAquamarine/ManyAI" target="_blank"
            style={{ color: 'var(--accent)', fontSize: 13 }}>
            github.com/SoylentAquamarine/ManyAI
          </a>
        </div>
      </div>
    </div>
  )
}

// ── BackupConfig ──────────────────────────────────────────────────────────────

/**
 * Full backup/restore UI.
 *
 * Export:
 *   - Builds a JSON snapshot of the entire config.
 *   - API keys can be AES-GCM encrypted with a user password (PBKDF2).
 *   - Images are exported as separate files, staggered to avoid throttling.
 *   - All dialogs default to {workingDir}/backups/ when a working dir is set.
 *
 * Import:
 *   - User selects a .json backup file.
 *   - A section picker lets them choose which parts to restore.
 *   - Encrypted API keys are unlocked with the original password.
 */
function BackupConfig() {
  const [status,      setStatus]      = useState('')
  const [showImport,  setShowImport]  = useState(false)
  const [encryptKeys, setEncryptKeys] = useState(false)
  const [exportPwd,   setExportPwd]   = useState('')
  const [exportPwdConfirm, setExportPwdConfirm] = useState('')

  const backupsDir = getBackupsDir() || undefined

  /** Build a slug from a string (for image filenames). */
  const slugify = (title: string) =>
    title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 60) || 'image'

  /** Derive the file extension from a data URI. */
  const mimeToExt = (dataUri: string) => {
    const mime = dataUri.match(/^data:([^;]+)/)?.[1] ?? 'image/png'
    const map: Record<string, string> = {
      'image/png': 'png', 'image/jpeg': 'jpg',
      'image/webp': 'webp', 'image/gif': 'gif',
    }
    return map[mime] ?? 'png'
  }

  /** Trigger a browser-side download of a Blob. */
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  /** Parse and validate a key from localStorage, silently returns undefined on error. */
  const parse = (key: string) => {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    try { return JSON.parse(raw) } catch { return raw }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const handleBackup = async () => {
    if (encryptKeys) {
      if (!exportPwd) { setStatus('Enter a password to encrypt API keys.'); return }
      if (exportPwd !== exportPwdConfirm) { setStatus('Passwords do not match.'); return }
    }

    const ls = localStorage
    const date = new Date().toISOString().slice(0, 10)

    // Collect plain-text API keys first
    const rawKeys: Record<string, string> = {}
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)!
      if (k.startsWith('manyai_key_')) rawKeys[k.replace('manyai_key_', '')] = ls.getItem(k) ?? ''
    }

    // Optionally encrypt
    let apiKeysField: Record<string, string> | { encrypted: string }
    if (encryptKeys) {
      const cipher = await encryptText(JSON.stringify(rawKeys), exportPwd)
      apiKeysField = { encrypted: cipher }
    } else {
      apiKeysField = rawKeys
    }

    // Saved responses: strip imageUri — images saved as separate files below
    const allResponses = loadAllResponses()
    const textResponses = allResponses.map(({ imageUri: _, ...rest }) => rest)

    const backup = {
      exportedAt: new Date().toISOString(),
      version: 1,
      apiKeys: apiKeysField,
      providers: {
        custom:        parse('manyai_custom_providers'),
        removed:       parse('manyai_removed_providers'),
        order:         parse('manyai_provider_order'),
        enabled:       parse('manyai_provider_enabled'),
        modelsEnabled: parse('manyai_model_enabled'),
      },
      workflows: {
        custom:          parse('manyai_workflows'),
        removedBuiltins: parse('manyai_removed_builtins'),
      },
      routing:        parse('manyai_routing_prefs'),
      savedResponses: {
        categories: parse('manyai_categories'),
        responses:  textResponses,
      },
    }

    const json = JSON.stringify(backup, null, 2)
    const filename = `manyai-backup-${date}.json`

    // Use save dialog (defaults to backups dir if set)
    const result = await window.api.saveFile(filename, json, backupsDir)
    if ('error' in result && result.error !== 'Cancelled') {
      setStatus(`Save failed: ${result.error}`)
      return
    }

    // Save each image as a separate file, staggered
    const images = allResponses.filter(r => r.imageUri)
    images.forEach((r, i) => {
      setTimeout(() => {
        const uri = r.imageUri!
        const ext = mimeToExt(uri)
        const imgFilename = `${slugify(r.title)}.${ext}`
        const [header, b64] = uri.split(',')
        const mime = header.match(/^data:([^;]+)/)?.[1] ?? 'image/png'
        const bytes = atob(b64)
        const arr = new Uint8Array(bytes.length)
        for (let j = 0; j < bytes.length; j++) arr[j] = bytes.charCodeAt(j)
        triggerDownload(new Blob([arr], { type: mime }), imgFilename)
      }, (i + 1) * 400)
    })

    const msg = images.length > 0
      ? `Backup saved + ${images.length} image${images.length > 1 ? 's' : ''} downloading.`
      : 'Backup saved.'
    setStatus(msg)
    setExportPwd('')
    setExportPwdConfirm('')
    setTimeout(() => setStatus(''), 6000)
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="api-list">

        {/* ── Export ─────────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '24px 0 8px' }}>
          Export Configuration
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.6 }}>
          Downloads a JSON file containing API keys, providers, workflows, routing, and saved
          text responses. Images are downloaded as separate files.
        </div>

        {/* Encrypt toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 14, cursor: 'pointer', marginBottom: 10,
        }}>
          <input
            type="checkbox"
            checked={encryptKeys}
            onChange={e => { setEncryptKeys(e.target.checked); setExportPwd(''); setExportPwdConfirm('') }}
          />
          Encrypt API keys with a password (AES-256)
        </label>

        {encryptKeys && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <input
              type="password"
              placeholder="Encryption password"
              value={exportPwd}
              onChange={e => setExportPwd(e.target.value)}
              style={{ fontSize: 13 }}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={exportPwdConfirm}
              onChange={e => setExportPwdConfirm(e.target.value)}
              style={{ fontSize: 13 }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Keep this password safe — you will need it to restore API keys.
            </div>
          </div>
        )}

        {!encryptKeys && (
          <div style={{ fontSize: 12, color: 'var(--accent2)', marginBottom: 10 }}>
            Warning: API keys will be stored in plain text. Keep the backup file private.
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-primary" onClick={handleBackup}>
            Download Backup
          </button>
          {status && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{status}</span>}
        </div>

        {/* ── Import ─────────────────────────────────────────── */}
        <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: '28px 0 8px' }}>
          Import Configuration
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.6 }}>
          Restore settings from a previously exported backup. You can choose which
          sections to import without overwriting the rest.
        </div>
        <button className="btn-ghost" onClick={() => setShowImport(true)}>
          Open Backup File…
        </button>

        {showImport && <ImportModal onClose={() => setShowImport(false)} backupsDir={backupsDir} />}
      </div>
    </div>
  )
}

// ── ImportModal ───────────────────────────────────────────────────────────────

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
  }
  routing?: unknown
  savedResponses?: {
    categories?: unknown
    responses?: unknown
  }
}

interface ImportModalProps {
  onClose: () => void
  backupsDir?: string
}

/**
 * ImportModal — lets the user choose a backup file, optionally decrypt API keys,
 * pick which sections to restore, then apply the import.
 */
function ImportModal({ onClose, backupsDir }: ImportModalProps) {
  const [doc,      setDoc]      = useState<BackupDoc | null>(null)
  const [filename, setFilename] = useState('')
  const [pwd,      setPwd]      = useState('')
  const [loadErr,  setLoadErr]  = useState('')
  const [status,   setStatus]   = useState('')

  // Section toggles
  const [importKeys,      setImportKeys]      = useState(true)
  const [importProviders, setImportProviders] = useState(true)
  const [importWorkflows, setImportWorkflows] = useState(true)
  const [importRouting,   setImportRouting]   = useState(true)
  const [importSaved,     setImportSaved]     = useState(false) // off by default

  const isEncrypted = doc && typeof doc.apiKeys === 'object' &&
    'encrypted' in (doc.apiKeys as object)

  const handlePickFile = async () => {
    const result = await window.api.openFile(backupsDir)
    if ('error' in result) return
    try {
      const parsed: BackupDoc = JSON.parse(result.content)
      setDoc(parsed)
      setFilename(result.name)
      setLoadErr('')
    } catch {
      setLoadErr('Could not parse file — is it a valid ManyAI backup?')
    }
  }

  const handleImport = async () => {
    if (!doc) return
    setStatus('')

    // ── API keys ──────────────────────────────────────────────────────────
    if (importKeys && doc.apiKeys) {
      let keys: Record<string, string>

      if (isEncrypted) {
        if (!pwd) { setStatus('Enter the decryption password for API keys.'); return }
        try {
          keys = JSON.parse(await decryptText((doc.apiKeys as { encrypted: string }).encrypted, pwd))
        } catch {
          setStatus('Wrong password or corrupted API key data.')
          return
        }
      } else {
        keys = doc.apiKeys as Record<string, string>
      }

      Object.entries(keys).forEach(([k, v]) => {
        if (v) localStorage.setItem(`manyai_key_${k}`, v)
      })
    }

    // ── Providers ─────────────────────────────────────────────────────────
    if (importProviders && doc.providers) {
      const p = doc.providers
      if (p.custom        != null) localStorage.setItem('manyai_custom_providers',  JSON.stringify(p.custom))
      if (p.removed       != null) localStorage.setItem('manyai_removed_providers', JSON.stringify(p.removed))
      if (p.order         != null) localStorage.setItem('manyai_provider_order',    JSON.stringify(p.order))
      if (p.enabled       != null) localStorage.setItem('manyai_provider_enabled',  JSON.stringify(p.enabled))
      if (p.modelsEnabled != null) localStorage.setItem('manyai_model_enabled',     JSON.stringify(p.modelsEnabled))
    }

    // ── Workflows ─────────────────────────────────────────────────────────
    if (importWorkflows && doc.workflows) {
      const w = doc.workflows
      if (w.custom          != null) localStorage.setItem('manyai_workflows',         JSON.stringify(w.custom))
      if (w.removedBuiltins != null) localStorage.setItem('manyai_removed_builtins',  JSON.stringify(w.removedBuiltins))
    }

    // ── Routing ───────────────────────────────────────────────────────────
    if (importRouting && doc.routing != null) {
      localStorage.setItem('manyai_routing_prefs', JSON.stringify(doc.routing))
    }

    // ── Saved responses ───────────────────────────────────────────────────
    if (importSaved && doc.savedResponses) {
      const s = doc.savedResponses
      if (s.categories != null) localStorage.setItem('manyai_categories',       JSON.stringify(s.categories))
      if (s.responses  != null) localStorage.setItem('manyai_saved_responses',  JSON.stringify(s.responses))
    }

    setStatus('Import complete. Reload the app to apply all changes.')
  }

  const sectionCheck = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    detail?: string,
  ) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, cursor: 'pointer', padding: '6px 0' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {detail && <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block' }}>{detail}</span>}
      </span>
    </label>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 24, maxWidth: 520, width: '95%',
        maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Import Backup</div>

        {/* File picker */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn-ghost" onClick={handlePickFile}>
            {doc ? 'Change file…' : 'Choose file…'}
          </button>
          {filename && (
            <span style={{ fontSize: 13, color: 'var(--text-dim)', alignSelf: 'center' }}>
              {filename}
            </span>
          )}
        </div>
        {loadErr && <div style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 10 }}>{loadErr}</div>}

        {doc && (
          <>
            {/* Backup metadata */}
            {doc.exportedAt && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
                Exported: {new Date(doc.exportedAt).toLocaleString()}
                {isEncrypted && ' · API keys encrypted'}
              </div>
            )}

            {/* Password for encrypted keys */}
            {isEncrypted && importKeys && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>Decryption password for API keys:</div>
                <input
                  type="password"
                  placeholder="Password"
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
            )}

            {/* Section selector */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
              Sections to import:
            </div>
            <div style={{ borderRadius: 6, border: '1px solid var(--border)', padding: '4px 12px', marginBottom: 14 }}>
              {sectionCheck('API Keys',  importKeys,      setImportKeys,      isEncrypted ? 'Encrypted — password required' : 'Plain text')}
              {sectionCheck('Providers', importProviders, setImportProviders, 'Custom providers, ordering, enabled state')}
              {sectionCheck('Workflows', importWorkflows, setImportWorkflows, 'Custom workflows and hidden built-ins')}
              {sectionCheck('Routing / Parallel config', importRouting, setImportRouting)}
              {sectionCheck('Saved Responses', importSaved, setImportSaved, 'Merges over existing saved responses')}
            </div>

            {/* Status */}
            {status && (
              <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12 }}>{status}</div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleImport} style={{ flex: 1 }}>
                Import Selected
              </button>
              <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {!doc && (
          <button className="btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: 8 }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
