/**
 * files.ts — Preload bridge for all filesystem / dialog IPC channels.
 * Each function maps 1:1 to a channel in main/ipc/fileIpc.ts.
 */

import { ipcRenderer } from 'electron'

export const filesApi = {
  /** Open a single file via OS picker. Returns file path, name and content. */
  openFile: (defaultDir?: string): Promise<{ path: string; name: string; content: string } | { error: string }> =>
    ipcRenderer.invoke('open-file', defaultDir),

  /** Open multiple files via OS picker. Returns array of {path, name}. */
  openFiles: (defaultDir?: string): Promise<{ files: { path: string; name: string }[] } | { error: string }> =>
    ipcRenderer.invoke('open-files', defaultDir),

  /** Read a file at an already-known absolute path. */
  readFileByPath: (filePath: string): Promise<{ content: string } | { error: string }> =>
    ipcRenderer.invoke('read-file-by-path', filePath),

  /** Overwrite (or create) a file at an absolute path. Creates parent dirs. */
  writeFileDirect: (filePath: string, content: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('write-file-direct', filePath, content),

  /** Write a data-URI image as a binary file (strips base64 header, writes raw bytes). */
  writeImageFile: (filePath: string, dataUri: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('write-image-file', filePath, dataUri),

  /** Append text to a file. Creates the file and parent dirs if missing. */
  appendFile: (filePath: string, content: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('append-file', filePath, content),

  /** Ensure a directory exists (mkdir -p). */
  ensureDir: (dirPath: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('ensure-dir', dirPath),

  /**
   * Show a save-file dialog and write the content.
   * @param defaultName  Filename portion (e.g. "backup.json")
   * @param content      UTF-8 string to write
   * @param defaultDir   Optional directory to open the dialog in
   */
  saveFile: (defaultName: string, content: string, defaultDir?: string): Promise<{ path: string } | { error: string }> =>
    ipcRenderer.invoke('save-file', defaultName, content, defaultDir),

  /** Show a directory picker. Returns the chosen absolute path. */
  selectDirectory: (defaultPath?: string): Promise<{ path: string } | { error: string }> =>
    ipcRenderer.invoke('select-directory', defaultPath),

  /**
   * Fetch a remote URL through the main process (bypasses renderer CORS restrictions).
   * Returns the raw text body on success. Used by RSS and future workflow data sources.
   */
  fetchUrl: (url: string): Promise<{ content: string } | { error: string }> =>
    ipcRenderer.invoke('fetch-url', url),

  /** Open a file or directory in the OS default application (e.g. log file in Notepad). */
  openPath: (filePath: string): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('open-path', filePath),
}
