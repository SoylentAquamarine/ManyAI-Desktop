import { ipcMain } from 'electron'
import { mcpManager, type McpServerConfig } from '../mcp'

export function registerMcpIpc(): void {

  ipcMain.handle('mcp-list-servers', () => {
    try {
      return { servers: mcpManager.getServerStatus(), configs: mcpManager.getConfigs() }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('mcp-add-server', async (_e, config: McpServerConfig) => {
    try {
      return await mcpManager.addServer(config)
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('mcp-remove-server', async (_e, name: string) => {
    try {
      await mcpManager.removeServer(name)
      return { ok: true }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('mcp-reconnect', async (_e, name: string) => {
    try {
      const configs = mcpManager.getConfigs()
      const cfg = configs.find(c => c.name === name)
      if (!cfg) return { error: `Server "${name}" not found in config` }
      return await mcpManager.connect(cfg)
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('mcp-list-tools', () => {
    try {
      return { tools: mcpManager.listAllTools() }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('mcp-call-tool', async (_e, serverName: string, toolName: string, args: Record<string, unknown>) => {
    try {
      const result = await mcpManager.callTool(serverName, toolName, args)
      return { result }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
}
