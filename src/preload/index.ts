import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { filesApi } from './api/files'
import { imagesApi } from './api/images'
import { ircApi } from './api/irc'
import { terminalApi } from './api/terminal'

const api = {
  ...filesApi,
  ...imagesApi,
  ...ircApi,
  terminal: terminalApi,
}

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
