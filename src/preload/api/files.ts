/**
 * files.ts — Preload bridge for all filesystem / dialog IPC channels.
 * Each function maps 1:1 to a channel in main/ipc/fileIpc.ts.
 */

import { ipcRenderer } from 'electron'

export const filesApi = {
  /** Read all provider JSON files from {workingDir}/providers/. */
  readProviders: (workingDir: string): Promise<{ providers: unknown[] } | { error: string }> =>
    ipcRenderer.invoke('read-providers', workingDir),

  /** Write a single provider JSON file to {workingDir}/providers/. */
  writeProvider: (workingDir: string, key: string, data: unknown): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('write-provider', workingDir, key, data),

  /** Delete a provider JSON file from {workingDir}/providers/. */
  deleteProvider: (workingDir: string, key: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('delete-provider', workingDir, key),

  /** Read all custom workflow JSON files from {workingDir}/workflows/. */
  readWorkflows: (workingDir: string): Promise<{ workflows: unknown[] } | { error: string }> =>
    ipcRenderer.invoke('read-workflows', workingDir),

  /** Write a single workflow JSON file to {workingDir}/workflows/. */
  writeWorkflow: (workingDir: string, type: string, data: unknown): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('write-workflow', workingDir, type, data),

  /** Delete a workflow JSON file from {workingDir}/workflows/. */
  deleteWorkflow: (workingDir: string, type: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('delete-workflow', workingDir, type),

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

  /** Read the persistent app config from {userData}/manyai-config.json. */
  getConfig: (): Promise<{ config: Record<string, unknown> }> =>
    ipcRenderer.invoke('get-config'),

  /** Merge a patch into the persistent app config. */
  setConfig: (patch: Record<string, unknown>): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('set-config', patch),

  /** Forward an HTTP request through the main process, bypassing renderer CORS. */
  proxyRequest: (opts: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }): Promise<{ status: number; body: string } | { error: string }> =>
    ipcRenderer.invoke('proxy-request', opts),

  /** Return a recursive file tree for a directory. Flags files over 100 KB as oversized. */
  readDir: (dirPath: string): Promise<{ entries: unknown[] } | { error: string }> =>
    ipcRenderer.invoke('read-dir', dirPath),

  /** Encrypt a string using the OS credential store (Keychain / DPAPI / libsecret). */
  safeEncrypt: (plaintext: string): Promise<{ ciphertext: string; fallback?: boolean } | { error: string }> =>
    ipcRenderer.invoke('safe-encrypt', plaintext),

  /** Decrypt a string produced by safeEncrypt. */
  safeDecrypt: (ciphertext: string): Promise<{ plaintext: string } | { error: string }> =>
    ipcRenderer.invoke('safe-decrypt', ciphertext),
}
