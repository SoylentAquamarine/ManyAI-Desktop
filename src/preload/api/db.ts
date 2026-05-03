import { ipcRenderer } from 'electron'

export const dbApi = {
  addMessage: (tabId: string, role: string, content: string, provider?: string, model?: string) =>
    ipcRenderer.invoke('db-add-message', tabId, role, content, provider, model) as Promise<{ id: number } | { error: string }>,

  getMessages: (tabId: string, limit?: number) =>
    ipcRenderer.invoke('db-get-messages', tabId, limit) as Promise<{ messages: DbMessage[] } | { error: string }>,

  clearMessages: (tabId: string) =>
    ipcRenderer.invoke('db-clear-messages', tabId) as Promise<{ ok: boolean } | { error: string }>,

  logRouting: (provider: string, model: string, workflowType: string | null, success: boolean, latencyMs: number, errorMsg?: string) =>
    ipcRenderer.invoke('db-log-routing', provider, model, workflowType, success, latencyMs, errorMsg) as Promise<{ ok: boolean } | { error: string }>,

  getRoutingStats: (provider: string, model: string, limit?: number) =>
    ipcRenderer.invoke('db-get-routing-stats', provider, model, limit) as Promise<{ rows: DbRoutingRow[] } | { error: string }>,

  logAgent: (tabId: string, toolName: string, args: string, resultPreview: string, success: boolean) =>
    ipcRenderer.invoke('db-log-agent', tabId, toolName, args, resultPreview, success) as Promise<{ ok: boolean } | { error: string }>,

  getAgentLog: (tabId: string, limit?: number) =>
    ipcRenderer.invoke('db-get-agent-log', tabId, limit) as Promise<{ rows: DbAgentRow[] } | { error: string }>,
}

export interface DbMessage {
  id: number
  role: string
  content: string
  provider?: string
  model?: string
  created_at: number
}

export interface DbRoutingRow {
  success: number
  latency_ms: number
  created_at: number
}

export interface DbAgentRow {
  tool_name: string
  args: string
  result_preview: string
  success: number
  created_at: number
}
