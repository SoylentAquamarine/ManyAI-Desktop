import { ipcRenderer } from 'electron'
import type { McpServerConfig, McpTool } from '../types/mcp'

export { type McpServerConfig, type McpTool }

export const mcpApi = {
  listServers: (): Promise<{
    servers: { name: string; status: string; error?: string; toolCount: number }[]
    configs: McpServerConfig[]
  } | { error: string }> =>
    ipcRenderer.invoke('mcp-list-servers'),

  addServer: (config: McpServerConfig): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mcp-add-server', config),

  removeServer: (name: string): Promise<{ ok: boolean } | { error: string }> =>
    ipcRenderer.invoke('mcp-remove-server', name),

  reconnect: (name: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mcp-reconnect', name),

  listTools: (): Promise<{ tools: McpTool[] } | { error: string }> =>
    ipcRenderer.invoke('mcp-list-tools'),

  callTool: (serverName: string, toolName: string, args: Record<string, unknown>): Promise<{ result: string } | { error: string }> =>
    ipcRenderer.invoke('mcp-call-tool', serverName, toolName, args),
}
