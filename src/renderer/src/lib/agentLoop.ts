import type { Provider } from './providers'

const AGENT_TIMEOUT_MS = 600_000   // 10 min — local Ollama models can be slow
const MAX_ITERATIONS = 20

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null | ContentPart[]
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface AgentEvent {
  toolName: string
  args: Record<string, unknown>
  result: string
  emoji: string
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full contents of a text file at the given absolute path.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path to the file' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write (overwrite or create) a file. Always provide complete file content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          content: { type: 'string', description: 'Complete file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename or move a file from old_path to new_path. Creates destination parent directories automatically.',
      parameters: {
        type: 'object',
        properties: {
          old_path: { type: 'string', description: 'Current absolute path of the file' },
          new_path: { type: 'string', description: 'New absolute path for the file' },
        },
        required: ['old_path', 'new_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Permanently delete a file at the given absolute path.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path to the file to delete' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and subdirectories in a directory.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path to the directory' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a directory and any missing parent directories (mkdir -p).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path of the directory to create' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the internet for information. Returns a markdown summary of the top results.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The search query' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch the text content of a URL. Returns the page as clean readable text.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The full URL to fetch' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_image',
      description: 'Load a local image file so you can analyze its visual contents. Supports jpeg, png, gif, webp.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path to the image file' } },
        required: ['path'],
      },
    },
  },
]

const TOOL_EMOJI: Record<string, string> = {
  read_file: '📖',
  write_file: '✍️',
  rename_file: '✏️',
  delete_file: '🗑️',
  list_directory: '📁',
  create_directory: '📂',
  search_web: '🔍',
  fetch_url: '🌐',
  read_image: '🖼️',
}

function formatDirEntries(entries: unknown[], depth = 0): string {
  return (entries as { type: string; name: string; children?: unknown[] }[])
    .map(e =>
      '  '.repeat(depth) +
      (e.type === 'dir' ? '📁 ' : '📄 ') +
      e.name +
      (e.children?.length ? '\n' + formatDirEntries(e.children, depth + 1) : '')
    )
    .join('\n')
}

// Returns either a plain string result or an image data URI prefixed with __IMG__:
async function executeTool(name: string, args: Record<string, unknown>, mcpToolIndex?: Map<string, { serverName: string; toolName: string }>): Promise<string> {
  // Route MCP tools (prefixed mcp__<server>__<tool>)
  if (name.startsWith('mcp__') && mcpToolIndex) {
    const entry = mcpToolIndex.get(name)
    if (!entry) return `Unknown MCP tool: ${name}`
    const r = await window.api.callTool(entry.serverName, entry.toolName, args)
    return 'error' in r ? `MCP error: ${r.error}` : r.result
  }

  if (name === 'read_file') {
    const r = await window.api.readFileByPath(args.path as string)
    return 'error' in r ? `Error: ${r.error}` : r.content
  }
  if (name === 'write_file') {
    const r = await window.api.writeFileDirect(args.path as string, args.content as string)
    return 'error' in r ? `Error: ${r.error}` : `Written: ${args.path}`
  }
  if (name === 'rename_file') {
    const r = await window.api.renameFile(args.old_path as string, args.new_path as string)
    return 'error' in r ? `Error: ${r.error}` : `Renamed: ${args.old_path} → ${args.new_path}`
  }
  if (name === 'delete_file') {
    const r = await window.api.deleteFile(args.path as string)
    return 'error' in r ? `Error: ${r.error}` : `Deleted: ${args.path}`
  }
  if (name === 'list_directory') {
    const r = await window.api.readDir(args.path as string)
    return 'error' in r ? `Error: ${r.error}` : formatDirEntries(r.entries)
  }
  if (name === 'create_directory') {
    const r = await window.api.ensureDir(args.path as string)
    return 'error' in r ? `Error: ${r.error}` : `Created: ${args.path}`
  }
  if (name === 'search_web') {
    const query = encodeURIComponent(args.query as string)
    const r = await window.api.fetchUrl(`https://s.jina.ai/?q=${query}`)
    return 'error' in r ? `Search error: ${r.error}` : r.content
  }
  if (name === 'fetch_url') {
    const rawUrl = args.url as string
    const r = await window.api.fetchUrl(`https://r.jina.ai/${rawUrl}`)
    return 'error' in r ? `Fetch error: ${r.error}` : r.content
  }
  if (name === 'read_image') {
    const r = await window.api.readImageFile(args.path as string)
    if ('error' in r) return `Error: ${r.error}`
    // Special prefix — the loop will inject this as a vision content block
    return `__IMG__:${r.dataUri}`
  }
  return `Unknown tool: ${name}`
}

function buildMcpToolDef(tool: { fullName: string; description?: string; inputSchema: Record<string, unknown> }) {
  return {
    type: 'function',
    function: {
      name: tool.fullName,
      description: tool.description ?? tool.fullName,
      parameters: tool.inputSchema.type ? tool.inputSchema : { type: 'object', properties: {}, required: [] },
    },
  }
}

export async function runAgentLoop(opts: {
  provider: Provider
  apiKey: string
  systemPrompt: string
  userMessage: string
  history: { role: 'user' | 'assistant'; content: string }[]
  onEvent: (e: AgentEvent) => void
  tabId?: string
  workingDir?: string
}): Promise<string> {
  const { provider, apiKey, systemPrompt, userMessage, history, onEvent } = opts

  // Discover MCP tools from connected servers
  const mcpToolDefs: typeof TOOLS = []
  const mcpToolIndex = new Map<string, { serverName: string; toolName: string }>()
  try {
    const r = await window.api.listTools()
    if ('tools' in r) {
      for (const t of r.tools) {
        mcpToolDefs.push(buildMcpToolDef(t))
        mcpToolIndex.set(t.fullName, { serverName: t.serverName, toolName: t.name })
      }
    }
  } catch {}

  const allTools = [...TOOLS, ...mcpToolDefs]

  const messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: userMessage },
  ]

  const maxTokens = provider.models?.find(m => m.id === provider.model)?.maxTokens ?? 4096

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const reqBody = JSON.stringify({
      model: provider.model,
      messages,
      tools: allTools,
      tool_choice: 'auto',
      max_tokens: maxTokens,
    })

    let rawBody: string

    if (provider.proxyMode === 'proxied') {
      const r = await window.api.proxyRequest({
        url: `${provider.baseUrl}/chat/completions`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: reqBody,
      })
      if ('error' in r) throw new Error(r.error)
      rawBody = (r as { status: number; body: string }).body
    } else {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT_MS)
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: reqBody,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer))
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try { const e = await res.json(); msg = (e as any)?.error?.message ?? msg } catch {}
        throw new Error(msg)
      }
      rawBody = await res.text()
    }

    const json = JSON.parse(rawBody)
    const choice = json?.choices?.[0]
    const msg = choice?.message
    const finish = choice?.finish_reason

    messages.push({ role: 'assistant', content: msg?.content ?? null, tool_calls: msg?.tool_calls })

    if (finish === 'stop' || !msg?.tool_calls?.length) {
      return msg?.content ?? ''
    }

    for (const tc of msg.tool_calls as OpenAIToolCall[]) {
      const name = tc.function.name
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch {}

      const result = await executeTool(name, args, mcpToolIndex)
      const emoji = name.startsWith('mcp__') ? '🔌' : (TOOL_EMOJI[name] ?? '🔧')
      const displayResult = result.startsWith('__IMG__:') ? '[image loaded]' : result
      onEvent({ toolName: name, args, result: displayResult, emoji })

      if (opts.workingDir) {
        window.api.logMessage(opts.workingDir, 'programming', 'tool', displayResult.slice(0, 1000), {
          toolName: name, args: JSON.stringify(args),
        })
      }

      if (result.startsWith('__IMG__:')) {
        const dataUri = result.slice('__IMG__:'.length)
        // Tool result as text (required by API), then inject vision as a user message
        messages.push({ role: 'tool', tool_call_id: tc.id, name, content: 'Image loaded.' })
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: `Image at path: ${args.path}` },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        })
      } else {
        messages.push({ role: 'tool', tool_call_id: tc.id, name, content: result })
      }
    }
  }

  throw new Error(`Agent exceeded ${MAX_ITERATIONS} iterations without finishing`)
}
