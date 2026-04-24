import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'

export function registerFileIpc(): void {
  ipcMain.handle('open-file', async (_event) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'All Files',   extensions: ['*'] },
        { name: 'Scripts',     extensions: ['py', 'js', 'ts', 'sh', 'bat', 'ps1', 'rb', 'go', 'rs'] },
        { name: 'Text / Markdown', extensions: ['txt', 'md'] },
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

  ipcMain.handle('open-files', async (_event) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
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

  ipcMain.handle('read-file-by-path', (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { content }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('write-file-direct', (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('save-file', async (_event, defaultName: string, content: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: defaultName,
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Python',     extensions: ['py'] },
        { name: 'JavaScript', extensions: ['js', 'mjs'] },
        { name: 'TypeScript', extensions: ['ts'] },
        { name: 'Shell',      extensions: ['sh', 'bat', 'ps1'] },
        { name: 'Text',       extensions: ['txt', 'md'] },
      ],
    })
    if (result.canceled || !result.filePath) return { error: 'Cancelled' }
    try {
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return { path: result.filePath }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
}
