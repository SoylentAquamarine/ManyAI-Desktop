import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import https from 'https'
import http from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 600,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    title: 'ManyAI',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false   // disables CORS — fine for a desktop app calling user-owned APIs
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  /**
   * Fetch a URL from the main process (Node.js https — no browser headers,
   * no cookies, no User-Agent spoofing) and return { base64, mime } or { error }.
   * Used by the renderer to fetch Pollinations images without triggering the
   * "Authenticated users should use enter.pollinations.ai" HTTP 500.
   */
  ipcMain.handle('fetch-image', (_event, url: string) => {
    return new Promise<{ base64: string; mime: string } | { error: string }>((resolve) => {
      const mod = url.startsWith('https') ? https : http
      const req = mod.get(url, (res) => {
        // Follow redirects (up to 5)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const location = res.headers.location
          res.resume()
          ipcMain.emit('fetch-image-redirect', location) // unused, just drain
          // Recurse with redirect target
          const redir = (res.headers.location!.startsWith('http') ? res.headers.location! : url)
          const redirMod = redir.startsWith('https') ? https : http
          const redirReq = redirMod.get(redir, (res2) => {
            if (!res2.statusCode || res2.statusCode >= 400) {
              res2.resume()
              resolve({ error: `HTTP ${res2.statusCode}` })
              return
            }
            const mime = (res2.headers['content-type'] ?? 'image/jpeg').split(';')[0].trim()
            const chunks: Buffer[] = []
            res2.on('data', (c) => chunks.push(c))
            res2.on('end', () => resolve({ base64: Buffer.concat(chunks).toString('base64'), mime }))
            res2.on('error', (e) => resolve({ error: e.message }))
          })
          redirReq.on('error', (e) => resolve({ error: e.message }))
          redirReq.setTimeout(60000, () => { redirReq.destroy(); resolve({ error: 'Timeout' }) })
          return
        }
        if (!res.statusCode || res.statusCode >= 400) {
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve({ error: `HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}` }))
          return
        }
        const mime = (res.headers['content-type'] ?? 'image/jpeg').split(';')[0].trim()
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ base64: Buffer.concat(chunks).toString('base64'), mime }))
        res.on('error', (e) => resolve({ error: e.message }))
      })
      req.on('error', (e) => resolve({ error: e.message }))
      req.setTimeout(60000, () => { req.destroy(); resolve({ error: 'Timeout' }) })
    })
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
