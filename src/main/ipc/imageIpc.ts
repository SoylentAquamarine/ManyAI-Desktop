import { ipcMain } from 'electron'
import https from 'https'
import http from 'http'

export function registerImageIpc(): void {
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
}
