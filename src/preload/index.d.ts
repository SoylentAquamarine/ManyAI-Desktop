import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      fetchImage: (url: string) => Promise<{ base64: string; mime: string } | { error: string }>
      saveFile: (defaultName: string, content: string) => Promise<{ path: string } | { error: string }>
    }
  }
}
