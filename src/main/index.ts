import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAllIpc } from './ipc'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const STATE_FILE = join(app.getPath('userData'), 'window-state.json')
const DEFAULT_STATE: WindowState = { width: 1000, height: 720, isMaximized: false }

function loadWindowState(): WindowState {
  try {
    if (existsSync(STATE_FILE)) {
      const stored = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as Partial<WindowState>
      const state: WindowState = { ...DEFAULT_STATE, ...stored }

      // Clamp dimensions to sane minimums
      state.width  = Math.max(state.width,  DEFAULT_STATE.width)
      state.height = Math.max(state.height, DEFAULT_STATE.height)

      // If stored position would land entirely off-screen, drop it so the OS
      // places the window on the primary display instead.
      if (state.x !== undefined && state.y !== undefined) {
        const { screen } = require('electron')
        const display = screen.getDisplayNearestPoint({ x: state.x, y: state.y })
        const { bounds } = display
        if (
          state.x < bounds.x - state.width  ||
          state.x > bounds.x + bounds.width  ||
          state.y < bounds.y - state.height ||
          state.y > bounds.y + bounds.height
        ) {
          state.x = undefined
          state.y = undefined
        }
      }

      return state
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_STATE }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const isMaximized = win.isMaximized()
    const bounds = win.getNormalBounds() // always gets the restored (non-maximized) bounds
    writeFileSync(STATE_FILE, JSON.stringify({ ...bounds, isMaximized }), 'utf-8')
  } catch { /* non-fatal */ }
}

function createWindow(): void {
  const state = loadWindowState()

  const mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 600,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    title: 'ManyAI',
    backgroundColor: '#1a1a2e', // matches midnight (default) theme — prevents white flash
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false   // disables CORS — fine for a desktop app calling user-owned APIs
    }
  })

  // Maximize before the page loads so the window is already full-size when shown.
  if (state.isMaximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Save state whenever the window is about to close
  mainWindow.on('close', () => saveWindowState(mainWindow))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  registerAllIpc()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
