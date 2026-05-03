import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerDbIpc(): void {
  const db = getDb()

  // ── messages ───────────────────────────────────────────────────────────────

  const stmtAddMsg = db.prepare(
    `INSERT INTO messages (tab_id, role, content, provider, model, created_at)
     VALUES (@tabId, @role, @content, @provider, @model, @createdAt)`
  )

  ipcMain.handle('db-add-message', (_e, tabId: string, role: string, content: string, provider?: string, model?: string) => {
    try {
      const info = stmtAddMsg.run({ tabId, role, content, provider: provider ?? null, model: model ?? null, createdAt: Date.now() })
      return { id: info.lastInsertRowid }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('db-get-messages', (_e, tabId: string, limit = 200) => {
    try {
      const rows = db.prepare(
        `SELECT id, role, content, provider, model, created_at
         FROM messages WHERE tab_id = ?
         ORDER BY created_at ASC LIMIT ?`
      ).all(tabId, limit)
      return { messages: rows }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('db-clear-messages', (_e, tabId: string) => {
    try {
      db.prepare('DELETE FROM messages WHERE tab_id = ?').run(tabId)
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── routing log ────────────────────────────────────────────────────────────

  const stmtLogRoute = db.prepare(
    `INSERT INTO routing_log (provider, model, workflow_type, success, latency_ms, error_msg, created_at)
     VALUES (@provider, @model, @workflowType, @success, @latencyMs, @errorMsg, @createdAt)`
  )

  ipcMain.handle('db-log-routing', (_e, provider: string, model: string, workflowType: string | null,
    success: boolean, latencyMs: number, errorMsg?: string) => {
    try {
      stmtLogRoute.run({ provider, model, workflowType: workflowType ?? null, success: success ? 1 : 0, latencyMs, errorMsg: errorMsg ?? null, createdAt: Date.now() })
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('db-get-routing-stats', (_e, provider: string, model: string, limit = 100) => {
    try {
      const rows = db.prepare(
        `SELECT success, latency_ms, created_at FROM routing_log
         WHERE provider = ? AND model = ?
         ORDER BY created_at DESC LIMIT ?`
      ).all(provider, model, limit)
      return { rows }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── agent audit ────────────────────────────────────────────────────────────

  const stmtLogAgent = db.prepare(
    `INSERT INTO agent_audit (tab_id, tool_name, args, result_preview, success, created_at)
     VALUES (@tabId, @toolName, @args, @resultPreview, @success, @createdAt)`
  )

  ipcMain.handle('db-log-agent', (_e, tabId: string, toolName: string, args: string, resultPreview: string, success: boolean) => {
    try {
      stmtLogAgent.run({ tabId, toolName, args, resultPreview, success: success ? 1 : 0, createdAt: Date.now() })
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('db-get-agent-log', (_e, tabId: string, limit = 100) => {
    try {
      const rows = db.prepare(
        `SELECT tool_name, args, result_preview, success, created_at
         FROM agent_audit WHERE tab_id = ?
         ORDER BY created_at DESC LIMIT ?`
      ).all(tabId, limit)
      return { rows }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
}
