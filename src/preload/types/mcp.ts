export interface McpServerConfig {
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface McpTool {
  name: string
  fullName: string
  serverName: string
  description?: string
  inputSchema: Record<string, unknown>
}
