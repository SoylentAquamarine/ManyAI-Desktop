import { ipcRenderer } from 'electron'

export const imagesApi = {
  fetchImage: (url: string): Promise<{ base64: string; mime: string } | { error: string }> =>
    ipcRenderer.invoke('fetch-image', url),
}
