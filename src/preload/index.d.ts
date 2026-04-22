import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      fetchImage: (url: string) => Promise<{ base64: string; mime: string } | { error: string }>
      saveFile: (defaultName: string, content: string) => Promise<{ path: string } | { error: string }>
      openFile: () => Promise<{ path: string; name: string; content: string } | { error: string }>
      writeFileDirect: (filePath: string, content: string) => Promise<{ ok: boolean } | { error: string }>
    }
  }
}
