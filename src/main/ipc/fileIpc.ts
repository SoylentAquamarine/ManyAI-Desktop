/**
 * fileIpc.ts — Main-process IPC handlers for all filesystem and dialog operations.
 *
 * Channels exposed:
 *   read-providers     — read all JSON files from {workingDir}/providers/, returns Provider[]
 *   write-provider     — write one provider JSON file to {workingDir}/providers/
 *   delete-provider    — delete one provider JSON file from {workingDir}/providers/
 *   read-workflows     — read all JSON files from {workingDir}/workflows/, returns WorkflowDef[]
 *   write-workflow     — write one workflow JSON file to {workingDir}/workflows/
 *   delete-workflow    — delete one workflow JSON file from {workingDir}/workflows/
 *   open-file          — single-file picker, returns {path, name, content}
 *   open-files         — multi-file picker, returns {files: [{path, name}]}
 *   read-file-by-path  — read arbitrary path, returns {content}
 *   write-file-direct  — overwrite file at path
 *   append-file        — append text to file (creates if missing)
 *   ensure-dir         — mkdir -p equivalent
 *   save-file          — save-dialog, writes file, returns {path}
 *   select-directory   — directory picker, returns {path}
 */

import { ipcMain, dialog, BrowserWindow, app, shell, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

/** Allow only safe filename characters — no path separators, dots, or control chars. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_')
}

/** Block requests to localhost and RFC-1918 private ranges (SSRF guard). */
function isPrivateUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl)
    return /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1|0\.0\.0\.0)/i.test(hostname)
  } catch {
    return true // unparseable URL → treat as unsafe
  }
}

export function registerFileIpc(): void {

  // ── read-providers ─────────────────────────────────────────────────────────
  ipcMain.handle('read-providers', (_event, workingDir: string) => {
    const dir = path.join(workingDir, 'providers')
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
      const providers = files.map(f => {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
        return JSON.parse(raw)
      })
      providers.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
      return { providers }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── write-provider ─────────────────────────────────────────────────────────
  ipcMain.handle('write-provider', (_event, workingDir: string, key: string, data: unknown) => {
    const dir = path.join(workingDir, 'providers')
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${sanitizeFilename(key)}.json`), JSON.stringify(data, null, 2), 'utf-8')
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── delete-provider ────────────────────────────────────────────────────────
  ipcMain.handle('delete-provider', (_event, workingDir: string, key: string) => {
    const filePath = path.join(workingDir, 'providers', `${sanitizeFilename(key)}.json`)
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── read-workflows ─────────────────────────────────────────────────────────
  ipcMain.handle('read-workflows', (_event, workingDir: string) => {
    const dir = path.join(workingDir, 'workflows')
    try {
      fs.mkdirSync(dir, { recursive: true })
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
      const workflows = files.map(f => {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
        return JSON.parse(raw)
      })
      return { workflows }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── write-workflow ─────────────────────────────────────────────────────────
  ipcMain.handle('write-workflow', (_event, workingDir: string, type: string, data: unknown) => {
    const dir = path.join(workingDir, 'workflows')
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${sanitizeFilename(type)}.json`), JSON.stringify(data, null, 2), 'utf-8')
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── delete-workflow ────────────────────────────────────────────────────────
  ipcMain.handle('delete-workflow', (_event, workingDir: string, type: string) => {
    const filePath = path.join(workingDir, 'workflows', `${sanitizeFilename(type)}.json`)
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── open-file ──────────────────────────────────────────────────────────────
  ipcMain.handle('open-file', async (_event, defaultDir?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      defaultPath: defaultDir,
      properties: ['openFile'],
      filters: [
        { name: 'All Files',          extensions: ['*'] },
        { name: 'Scripts',            extensions: ['py', 'js', 'ts', 'sh', 'bat', 'ps1', 'rb', 'go', 'rs'] },
        { name: 'Text / Markdown',    extensions: ['txt', 'md'] },
        { name: 'JSON / Config',      extensions: ['json', 'yaml', 'yml', 'toml'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return { error: 'Cancelled' }
    const filePath = result.filePaths[0]
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      return { path: filePath, name, content }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── open-files ─────────────────────────────────────────────────────────────
  ipcMain.handle('open-files', async (_event, defaultDir?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      defaultPath: defaultDir,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files',          extensions: ['*'] },
        { name: 'Text / Markdown',    extensions: ['txt', 'md'] },
        { name: 'Scripts',            extensions: ['py', 'js', 'ts', 'sh', 'bat', 'ps1', 'rb', 'go', 'rs'] },
      ],
    })
    if (result.canceled || !result.filePaths.length) return { error: 'Cancelled' }
    const files: { path: string; name: string }[] = []
    for (const filePath of result.filePaths) {
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      files.push({ path: filePath, name })
    }
    return { files }
  })

  // ── read-file-by-path ──────────────────────────────────────────────────────
  ipcMain.handle('read-file-by-path', (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { content }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── write-file-direct ──────────────────────────────────────────────────────
  ipcMain.handle('write-file-direct', (_event, filePath: string, content: string) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── write-image-file ──────────────────────────────────────────────────────
  // Accepts a data URI (data:image/png;base64,...), strips the header, decodes
  // the base64 payload, and writes raw binary bytes so the file is a valid image.
  ipcMain.handle('write-image-file', (_event, filePath: string, dataUri: string) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── append-file ────────────────────────────────────────────────────────────
  ipcMain.handle('append-file', (_event, filePath: string, content: string) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.appendFileSync(filePath, content, 'utf-8')
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── ensure-dir ─────────────────────────────────────────────────────────────
  ipcMain.handle('ensure-dir', (_event, dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true })
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── save-file ──────────────────────────────────────────────────────────────
  ipcMain.handle('save-file', async (_event, defaultName: string, content: string, defaultDir?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const defaultPath = defaultDir ? path.join(defaultDir, defaultName) : defaultName
    const result = await dialog.showSaveDialog(win!, {
      defaultPath,
      filters: [
        { name: 'All Files',  extensions: ['*'] },
        { name: 'JSON',       extensions: ['json'] },
        { name: 'Text',       extensions: ['txt', 'md'] },
        { name: 'Python',     extensions: ['py'] },
        { name: 'JavaScript', extensions: ['js', 'mjs'] },
        { name: 'TypeScript', extensions: ['ts'] },
        { name: 'Shell',      extensions: ['sh', 'bat', 'ps1'] },
      ],
    })
    if (result.canceled || !result.filePath) return { error: 'Cancelled' }
    try {
      fs.mkdirSync(path.dirname(result.filePath), { recursive: true })
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return { path: result.filePath }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── select-directory ───────────────────────────────────────────────────────
  ipcMain.handle('select-directory', async (_event, defaultPath?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { error: 'Cancelled' }
    return { path: result.filePaths[0] }
  })

  // ── get-config / set-config ───────────────────────────────────────────────
  // Persists app config (e.g. workingDir) to {userData}/manyai-config.json.
  // More durable than renderer localStorage — survives origin changes and
  // will be pre-populated by the Windows installer.
  const CONFIG_PATH = path.join(app.getPath('userData'), 'manyai-config.json')

  ipcMain.handle('get-config', () => {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return { config: JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) }
      }
      return { config: {} }
    } catch (e: unknown) {
      return { config: {} }
    }
  })

  ipcMain.handle('set-config', (_event, patch: Record<string, unknown>) => {
    try {
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(CONFIG_PATH)) {
        try { existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) } catch {}
      }
      const merged = { ...existing, ...patch }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── proxy-request ─────────────────────────────────────────────────────────
  // Forwards an HTTP request from the renderer through the main process.
  // Used by providers with proxyMode: 'proxied' to bypass renderer CORS restrictions.
  ipcMain.handle('proxy-request', async (_event, opts: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }) => {
    // No SSRF guard here — proxy-request is used for user-configured provider
    // endpoints (including local Ollama on localhost). Trust the provider URL.
    try {
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
      })
      const body = await res.text()
      return { status: res.status, body }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── rename-file ────────────────────────────────────────────────────────────
  ipcMain.handle('rename-file', (_event, oldPath: string, newPath: string) => {
    try {
      fs.mkdirSync(path.dirname(newPath), { recursive: true })
      fs.renameSync(oldPath, newPath)
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── delete-file ────────────────────────────────────────────────────────────
  ipcMain.handle('delete-file', (_event, filePath: string) => {
    try {
      fs.unlinkSync(filePath)
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── read-image-file ────────────────────────────────────────────────────────
  // Reads a local image as a base64 data URI for vision-capable models.
  ipcMain.handle('read-image-file', (_event, filePath: string) => {
    try {
      const buf = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase().replace('.', '')
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                 : ext === 'png' ? 'image/png'
                 : ext === 'gif' ? 'image/gif'
                 : ext === 'webp' ? 'image/webp'
                 : 'image/jpeg'
      return { dataUri: `data:${mime};base64,${buf.toString('base64')}` }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── read-dir ───────────────────────────────────────────────────────────────
  // Returns a recursive file tree. Skips hidden files, node_modules, .git, dist.
  // Files over 100 KB are flagged oversized: true so the UI can grey them out.
  ipcMain.handle('read-dir', (_event, dirPath: string) => {
    const MAX_BYTES = 100 * 1024
    const SKIP = new Set(['node_modules', '__pycache__', '.git', 'dist', 'out', '.next', 'build'])
    interface Entry { name: string; path: string; type: 'file' | 'dir'; size?: number; oversized?: boolean; children?: Entry[] }
    const walk = (dir: string, depth = 0): Entry[] => {
      if (depth > 8) return []
      let names: string[]
      try { names = fs.readdirSync(dir) } catch { return [] }
      const result: Entry[] = []
      for (const name of names.sort()) {
        if (name.startsWith('.')) continue
        const full = path.join(dir, name)
        let stat: import('fs').Stats
        try { stat = fs.statSync(full) } catch { continue }
        if (stat.isDirectory()) {
          if (SKIP.has(name)) continue
          result.push({ name, path: full, type: 'dir', children: walk(full, depth + 1) })
        } else {
          result.push({ name, path: full, type: 'file', size: stat.size, oversized: stat.size > MAX_BYTES })
        }
      }
      return result
    }
    try {
      if (!fs.statSync(dirPath).isDirectory()) return { error: 'Not a directory' }
      return { entries: walk(dirPath) }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── safe-storage ──────────────────────────────────────────────────────────
  // Encrypts/decrypts strings using the OS credential store (Keychain, DPAPI,
  // libsecret). Falls back to base64 obfuscation if safeStorage is unavailable.
  ipcMain.handle('safe-encrypt', (_event, plaintext: string) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return { ciphertext: safeStorage.encryptString(plaintext).toString('base64') }
      }
      // Fallback: base64 obfuscation (better than plaintext, not cryptographically secure)
      return { ciphertext: Buffer.from(plaintext, 'utf-8').toString('base64'), fallback: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('safe-decrypt', (_event, ciphertext: string) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return { plaintext: safeStorage.decryptString(Buffer.from(ciphertext, 'base64')) }
      }
      return { plaintext: Buffer.from(ciphertext, 'base64').toString('utf-8') }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── open-path ──────────────────────────────────────────────────────────────
  // Opens a file or directory in the OS default application.
  ipcMain.handle('open-path', async (_event, filePath: string) => {
    const err = await shell.openPath(filePath)
    return err ? { error: err } : { ok: true }
  })

  // ── fetch-url ──────────────────────────────────────────────────────────────
  // Fetches a URL through the main process to bypass renderer CORS restrictions.
  // Used by the RSS reader and any future workflow that needs to pull remote data.
  ipcMain.handle('fetch-url', async (_event, url: string) => {
    if (isPrivateUrl(url)) return { error: 'Requests to private/local addresses are not allowed' }
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ManyAI-Desktop/1.0 (RSS reader)' },
      })
      if (!response.ok) return { error: `HTTP ${response.status}: ${response.statusText}` }
      const content = await response.text()
      return { content }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
}
