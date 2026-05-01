/**
 * fileIpc.ts — Main-process IPC handlers for all filesystem and dialog operations.
 *
 * Channels exposed:
 *   read-providers     — read all JSON files from <appPath>/providers/, returns Provider[]
 *   open-file          — single-file picker, returns {path, name, content}
 *   open-files         — multi-file picker, returns {files: [{path, name}]}
 *   read-file-by-path  — read arbitrary path, returns {content}
 *   write-file-direct  — overwrite file at path
 *   append-file        — append text to file (creates if missing)
 *   ensure-dir         — mkdir -p equivalent
 *   save-file          — save-dialog, writes file, returns {path}
 *   select-directory   — directory picker, returns {path}
 */

import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import fs from 'fs'
import path from 'path'

export function registerFileIpc(): void {

  // ── read-providers ─────────────────────────────────────────────────────────
  ipcMain.handle('read-providers', () => {
    const dir = path.join(app.getAppPath(), 'providers')
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
  ipcMain.handle('write-provider', (_event, key: string, data: unknown) => {
    const dir = path.join(app.getAppPath(), 'providers')
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data, null, 2), 'utf-8')
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── delete-provider ────────────────────────────────────────────────────────
  ipcMain.handle('delete-provider', (_event, key: string) => {
    const filePath = path.join(app.getAppPath(), 'providers', `${key}.json`)
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

  // ── fetch-url ──────────────────────────────────────────────────────────────
  // Fetches a URL through the main process to bypass renderer CORS restrictions.
  // Used by the RSS reader and any future workflow that needs to pull remote data.
  ipcMain.handle('fetch-url', async (_event, url: string) => {
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
