import { ipcRenderer } from 'electron'

export const filesApi = {
  openFile: (): Promise<{ path: string; name: string; content: string } | { error: string }> =>
    ipcRenderer.invoke('open-file'),

  openFiles: (): Promise<{ files: { path: string; name: string }[] } | { error: string }> =>
    ipcRenderer.invoke('open-files'),

  readFileByPath: (filePath: string): Promise<{ content: string } | { error: string }> =>
    ipcRenderer.invoke('read-file-by-path', filePath),

  writeFileDirect: (filePath: string, content: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('write-file-direct', filePath, content),

  saveFile: (defaultName: string, content: string): Promise<{ path: string } | { error: string }> =>
    ipcRenderer.invoke('save-file', defaultName, content),
}
