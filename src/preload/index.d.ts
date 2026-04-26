import { ElectronAPI } from '@electron-toolkit/preload'

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
    }
  }
}
