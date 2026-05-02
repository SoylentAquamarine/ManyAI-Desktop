import type { Provider } from './providers'

const AGENT_TIMEOUT_MS = 60_000
const MAX_ITERATIONS = 20

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
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
      description: 'Read the full contents of a file at the given absolute path.',
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
      name: 'list_directory',
      description: 'List files and subdirectories in a directory.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path to the directory' } },
        required: ['path'],
      },
    },
  },
]

function formatDirEntries(entries: any[], depth = 0): string {
  return entries
    .map(e =>
      '  '.repeat(depth) +
      (e.type === 'dir' ? '📁 ' : '📄 ') +
      e.name +
      (e.children?.length ? '\n' + formatDirEntries(e.children, depth + 1) : '')
    )
    .join('\n')
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === 'read_file') {
    const r = await window.api.readFileByPath(args.path as string)
    return 'error' in r ? `Error: ${r.error}` : r.content
  }
  if (name === 'write_file') {
    const r = await window.api.writeFileDirect(args.path as string, args.content as string)
    return 'error' in r ? `Error: ${r.error}` : `Written: ${args.path}`
  }
  if (name === 'list_directory') {
    const r = await window.api.readDir(args.path as string)
    return 'error' in r ? `Error: ${r.error}` : formatDirEntries(r.entries)
  }
  return `Unknown tool: ${name}`
}

export async function runAgentLoop(opts: {
  provider: Provider
  apiKey: string
  systemPrompt: string
  userMessage: string
  history: { role: 'user' | 'assistant'; content: string }[]
  onEvent: (e: AgentEvent) => void
}): Promise<string> {
  const { provider, apiKey, systemPrompt, userMessage, history, onEvent } = opts

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
      tools: TOOLS,
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

      const result = await executeTool(name, args)
      const emoji = name === 'read_file' ? '📖' : name === 'write_file' ? '✍️' : '📁'
      onEvent({ toolName: name, args, result, emoji })

      messages.push({ role: 'tool', tool_call_id: tc.id, name, content: result })
    }
  }

  throw new Error(`Agent exceeded ${MAX_ITERATIONS} iterations without finishing`)
}
