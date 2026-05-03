import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { McpServerConfig, McpTool } from '../preload/types/mcp'

export type { McpServerConfig, McpTool }

interface ConnectedServer {
  config: McpServerConfig
  client: Client
  tools: McpTool[]
  status: 'connected' | 'error'
  error?: string
}

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'mcp-servers.json')

function loadConfigs(): McpServerConfig[] {
  try {
    const p = CONFIG_FILE()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {}
  return []
}

function saveConfigs(configs: McpServerConfig[]): void {
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(configs, null, 2), 'utf-8')
}

class McpClientManager {
  private servers = new Map<string, ConnectedServer>()

  async connect(config: McpServerConfig): Promise<{ ok: boolean; error?: string }> {
    // Disconnect existing connection for this name if any
    await this.disconnect(config.name)

    const client = new Client({ name: 'manyai-desktop', version: '1.0.0' })

    try {
      let transport
      if (config.transport === 'stdio') {
        if (!config.command) return { ok: false, error: 'stdio transport requires command' }
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
        })
      } else {
        if (!config.url) return { ok: false, error: 'http transport requires url' }
        transport = new StreamableHTTPClientTransport(new URL(config.url))
      }

      await client.connect(transport)

      const listResult = await client.listTools()
      const tools: McpTool[] = (listResult.tools ?? []).map(t => ({
        name: t.name,
        fullName: `mcp__${config.name}__${t.name}`,
        serverName: config.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }))

      this.servers.set(config.name, { config, client, tools, status: 'connected' })
      return { ok: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.servers.set(config.name, { config, client, tools: [], status: 'error', error: msg })
      return { ok: false, error: msg }
    }
  }

  async disconnect(name: string): Promise<void> {
    const s = this.servers.get(name)
    if (s) {
      try { await s.client.close() } catch {}
      this.servers.delete(name)
    }
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const s = this.servers.get(serverName)
    if (!s || s.status !== 'connected') throw new Error(`MCP server "${serverName}" not connected`)
    const result = await s.client.callTool({ name: toolName, arguments: args })
    const parts = result.content ?? []
    return parts
      .map((p: any) => p.type === 'text' ? p.text : p.type === 'image' ? '[image]' : JSON.stringify(p))
      .join('\n')
  }

  listAllTools(): McpTool[] {
    const out: McpTool[] = []
    for (const s of this.servers.values()) {
      if (s.status === 'connected') out.push(...s.tools)
    }
    return out
  }

  getServerStatus(): { name: string; status: string; error?: string; toolCount: number }[] {
    return [...this.servers.values()].map(s => ({
      name: s.config.name,
      status: s.status,
      error: s.error,
      toolCount: s.tools.length,
    }))
  }

  getConfigs(): McpServerConfig[] {
    return loadConfigs()
  }

  async addServer(config: McpServerConfig): Promise<{ ok: boolean; error?: string }> {
    const configs = loadConfigs().filter(c => c.name !== config.name)
    configs.push(config)
    saveConfigs(configs)
    return this.connect(config)
  }

  async removeServer(name: string): Promise<void> {
    await this.disconnect(name)
    const configs = loadConfigs().filter(c => c.name !== name)
    saveConfigs(configs)
  }

  async connectAll(): Promise<void> {
    const configs = loadConfigs()
    await Promise.allSettled(configs.map(c => this.connect(c)))
  }
}

export const mcpManager = new McpClientManager()
