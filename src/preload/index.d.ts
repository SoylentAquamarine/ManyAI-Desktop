import { ElectronAPI } from '@electron-toolkit/preload'

interface FtpEntry {
  name: string
  type: 'file' | 'dir' | 'link'
  size: number
  date: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      /** Fetch an image URL through the main process (bypasses Chromium CORS restrictions). */
      fetchImage: (url: string) => Promise<{ base64: string; mime: string } | { error: string }>

      /** Open single-file picker, optionally starting in defaultDir. */
      openFile: (defaultDir?: string) => Promise<{ path: string; name: string; content: string } | { error: string }>

      /** Open multi-file picker, optionally starting in defaultDir. */
      openFiles: (defaultDir?: string) => Promise<{ files: { path: string; name: string }[] } | { error: string }>

      /** Read a file at a known absolute path. */
      readFileByPath: (filePath: string) => Promise<{ content: string } | { error: string }>

      /** Overwrite (or create) a file. Creates parent directories automatically. */
      writeFileDirect: (filePath: string, content: string) => Promise<{ ok: boolean } | { error: string }>

      /** Write a data-URI image as a binary file (decodes base64, writes raw bytes). */
      writeImageFile: (filePath: string, dataUri: string) => Promise<{ ok: boolean } | { error: string }>

      /** Append text to a file. Creates the file + parent dirs if they don't exist. */
      appendFile: (filePath: string, content: string) => Promise<{ ok: boolean } | { error: string }>

      /** Ensure a directory exists (mkdir -p). */
      ensureDir: (dirPath: string) => Promise<{ ok: boolean } | { error: string }>

      /**
       * Show a save-file dialog and write the content.
       * @param defaultName  Filename (e.g. "backup.json")
       * @param content      Text to write
       * @param defaultDir   Directory to open the dialog in (optional)
       */
      saveFile: (defaultName: string, content: string, defaultDir?: string) => Promise<{ path: string } | { error: string }>

      /** Show a directory-picker dialog. */
      selectDirectory: (defaultPath?: string) => Promise<{ path: string } | { error: string }>

      /** Fetch a URL through the main process, bypassing renderer CORS. Returns raw text. */
      fetchUrl: (url: string) => Promise<{ content: string } | { error: string }>

      /** Read all provider JSON files from {workingDir}/providers/. */
      readProviders: (workingDir: string) => Promise<{ providers: unknown[] } | { error: string }>

      /** Write a single provider JSON file to {workingDir}/providers/. */
      writeProvider: (workingDir: string, key: string, data: unknown) => Promise<{ ok: boolean } | { error: string }>

      /** Delete a provider JSON file from {workingDir}/providers/. */
      deleteProvider: (workingDir: string, key: string) => Promise<{ ok: boolean } | { error: string }>

      /** Read all custom workflow JSON files from {workingDir}/workflows/. */
      readWorkflows: (workingDir: string) => Promise<{ workflows: unknown[] } | { error: string }>

      /** Write a single workflow JSON file to {workingDir}/workflows/. */
      writeWorkflow: (workingDir: string, type: string, data: unknown) => Promise<{ ok: boolean } | { error: string }>

      /** Delete a workflow JSON file from {workingDir}/workflows/. */
      deleteWorkflow: (workingDir: string, type: string) => Promise<{ ok: boolean } | { error: string }>

      /** Read the persistent app config from {userData}/manyai-config.json. */
      getConfig: () => Promise<{ config: Record<string, unknown> }>

      /** Merge a patch into the persistent app config. */
      setConfig: (patch: Record<string, unknown>) => Promise<{ ok: boolean } | { error: string }>

      /** Open a file or directory in the OS default app. */
      openPath: (filePath: string) => Promise<{ ok: true } | { error: string }>

      /** Forward an HTTP request through the main process, bypassing renderer CORS. */
      proxyRequest: (opts: {
        url: string
        method: string
        headers: Record<string, string>
        body?: string
      }) => Promise<{ status: number; body: string } | { error: string }>

      /** Rename (or move) a file. Creates destination parent dirs automatically. */
      renameFile: (oldPath: string, newPath: string) => Promise<{ ok: boolean } | { error: string }>

      /** Delete a file at the given absolute path. */
      deleteFile: (filePath: string) => Promise<{ ok: boolean } | { error: string }>

      /** Read a local image file and return it as a base64 data URI. */
      readImageFile: (filePath: string) => Promise<{ dataUri: string } | { error: string }>

      /** Return a recursive file tree for a directory. Flags files over 100 KB as oversized. */
      readDir: (dirPath: string) => Promise<{ entries: unknown[] } | { error: string }>

      /** Encrypt a string using the OS credential store (Keychain / DPAPI / libsecret). */
      safeEncrypt: (plaintext: string) => Promise<{ ciphertext: string; fallback?: boolean } | { error: string }>

      /** Decrypt a string produced by safeEncrypt. */
      safeDecrypt: (ciphertext: string) => Promise<{ plaintext: string } | { error: string }>

      /** Open a TCP connection to an IRC server. Listen for 'irc-event' connected to confirm. */
      ircConnect: (args: { server: string; port: number; nick: string; username: string; realname: string; password?: string }) => Promise<{ ok: true } | { error: string }>

      /** Send QUIT and close the socket. */
      ircDisconnect: () => Promise<{ ok: true } | { error: string }>

      /** Send PRIVMSG to a channel or nick. */
      ircSendMessage: (args: { target: string; text: string }) => Promise<{ ok: true } | { error: string }>

      /** Send JOIN for a channel. */
      ircJoin: (args: { channel: string }) => Promise<{ ok: true } | { error: string }>

      /** Send PART for a channel. */
      ircPart: (args: { channel: string }) => Promise<{ ok: true } | { error: string }>

      /** Send NICK to change the current nick. */
      ircSetNick: (args: { nick: string }) => Promise<{ ok: true } | { error: string }>

      terminal: {
        // SSH shell
        connect(opts: { sessionId: string; host: string; port: number; username: string; password?: string; privateKey?: string }): Promise<{ ok: true } | { error: string }>
        send(sessionId: string, data: string): Promise<{ ok: true } | { error: string }>
        resize(sessionId: string, cols: number, rows: number): Promise<void>
        disconnect(sessionId: string): Promise<{ ok: true }>
        onData(sessionId: string, cb: (data: string) => void): () => void
        onClose(sessionId: string, cb: () => void): () => void
        onError(sessionId: string, cb: (msg: string) => void): () => void
        // SFTP
        sftpConnect(opts: { sessionId: string; host: string; port: number; username: string; password?: string; privateKey?: string }): Promise<{ ok: true } | { error: string }>
        sftpList(sessionId: string, remotePath: string): Promise<{ entries: FtpEntry[] } | { error: string }>
        sftpDownload(sessionId: string, remotePath: string): Promise<{ ok: true; path: string } | { canceled: true } | { error: string }>
        sftpUpload(sessionId: string, remotePath: string): Promise<{ ok: true } | { canceled: true } | { error: string }>
        sftpMkdir(sessionId: string, remotePath: string): Promise<{ ok: true } | { error: string }>
        sftpDelete(sessionId: string, remotePath: string, isDir: boolean): Promise<{ ok: true } | { error: string }>
        // FTP / FTPS
        ftpConnect(opts: { sessionId: string; host: string; port: number; username: string; password?: string; secure: boolean }): Promise<{ ok: true } | { error: string }>
        ftpList(sessionId: string, remotePath: string): Promise<{ entries: FtpEntry[] } | { error: string }>
        ftpDownload(sessionId: string, remotePath: string): Promise<{ ok: true; path: string } | { canceled: true } | { error: string }>
        ftpUpload(sessionId: string, remotePath: string): Promise<{ ok: true } | { canceled: true } | { error: string }>
        ftpMkdir(sessionId: string, remotePath: string): Promise<{ ok: true } | { error: string }>
        ftpDelete(sessionId: string, remotePath: string, isDir: boolean): Promise<{ ok: true } | { error: string }>
      }
    }
  }
}
