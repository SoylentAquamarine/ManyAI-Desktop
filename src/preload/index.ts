import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  /** Fetch a URL via Node.js in the main process (no browser headers/cookies).
   *  Returns { base64: string, mime: string } on success or { error: string } on failure. */
  fetchImage: (url: string): Promise<{ base64: string; mime: string } | { error: string }> =>
    ipcRenderer.invoke('fetch-image', url),

  /** Show a native Save dialog and write text to the chosen path.
   *  Returns { path: string } on success or { error: string } on cancel/failure. */
  saveFile: (defaultName: string, content: string): Promise<{ path: string } | { error: string }> =>
    ipcRenderer.invoke('save-file', defaultName, content),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
