import { useState, useRef, useEffect, useCallback } from 'react'
import { loadRoutingPrefs, resolveProvider } from '../../lib/routing'
import { getAllProviders, getKeylessProviderKeys } from '../../lib/providers'
import { loadAllKeys } from '../../lib/keyStore'
import { loadEnabledProviders } from '../../lib/providerPrefs'
import { runAgentLoop } from '../../lib/agentLoop'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  oversized?: boolean
  children?: FileEntry[]
}

interface SelectedFile {
  path: string
  name: string
  content: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  type?: 'activity'
}

const LS_ROOT = (tabId: string) => `manyai_prog_root_${tabId}`
const LS_MSGS = (tabId: string) => `manyai_prog_msgs_${tabId}`

interface Props { tabId: string }

export default function ProgrammingScreen({ tabId }: Props) {
  const [root, setRoot] = useState<string>(() => localStorage.getItem(LS_ROOT(tabId)) ?? '')
  const [treeRevision, setTreeRevision] = useState(0)
  const [tree, setTree] = useState<FileEntry[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_MSGS(tabId)) ?? '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    localStorage.setItem(LS_MSGS(tabId), JSON.stringify(messages))
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!root) { setTree([]); return }
    setTreeLoading(true)
    setTreeError('')
    window.api.readDir(root).then(result => {
      setTreeLoading(false)
      if ('error' in result) { setTreeError(result.error); return }
      setTree(result.entries as FileEntry[])
    })
  }, [root, treeRevision])

  const browseFolder = async () => {
    const result = await window.api.selectDirectory(root || undefined)
    if ('error' in result) return
    setRoot(result.path)
    localStorage.setItem(LS_ROOT(tabId), result.path)
    setSelected(new Set())
    setSelectedFiles([])
    setCollapsed(new Set())
  }

  const toggleCollapse = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const toggleSelect = useCallback(async (entry: FileEntry) => {
    if (entry.type === 'dir' || entry.oversized) return
    const isSelected = selected.has(entry.path)
    if (isSelected) {
      setSelected(prev => { const n = new Set(prev); n.delete(entry.path); return n })
      setSelectedFiles(prev => prev.filter(f => f.path !== entry.path))
    } else {
      const result = await window.api.readFileByPath(entry.path)
      if ('error' in result) return
      setSelected(prev => new Set(prev).add(entry.path))
      setSelectedFiles(prev => [...prev, { path: entry.path, name: entry.name, content: result.content }])
    }
  }, [selected])

  const buildSystemPrompt = (): string => {
    const rootNote = root ? `The working directory is: ${root}\n\n` : ''
    return (
      `You are an autonomous programming agent running on a local model with no token limits or costs.\n` +
      `${rootNote}` +
      `You have full read/write access to the filesystem via tools: read_file, write_file, list_directory.\n` +
      `Work autonomously — read files, make changes, write files, iterate. Do not ask the user to copy or paste anything.\n` +
      `Do NOT output raw file content in text — use write_file to write changes directly.\n` +
      `When all tasks are complete, respond with a brief summary of what you did.`
    )
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const keys = loadAllKeys()
    const prefs = loadRoutingPrefs()
    const availableKeys = new Set(Object.keys(keys))
    getKeylessProviderKeys().forEach(k => availableKeys.add(k))
    const enabledMap = loadEnabledProviders()
    const entry = resolveProvider('programming', prefs, availableKeys, enabledMap)

    if (!entry) {
      setMessages(m => [...m,
        { role: 'user', content: text },
        { role: 'assistant', content: '⚠️ No provider configured. Set a route for the Programming workflow in Settings → Workflows.' },
      ])
      setSending(false)
      return
    }

    const allProviders = getAllProviders()
    const provider = allProviders[entry.provider]
    if (!provider) {
      setMessages(m => [...m,
        { role: 'user', content: text },
        { role: 'assistant', content: `⚠️ Provider "${entry.provider}" not found.` },
      ])
      setSending(false)
      return
    }

    setMessages(m => [...m, { role: 'user', content: text }])

    const history = messages
      .filter(m => !m.type)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    try {
      const finalContent = await runAgentLoop({
        provider,
        apiKey: keys[entry.provider] ?? '',
        systemPrompt: buildSystemPrompt(),
        userMessage: text,
        history,
        onEvent: ({ toolName, args, emoji }) => {
          const label = String(args.path ?? args.content ?? '')
          setMessages(m => [...m, { role: 'assistant', type: 'activity', content: `${emoji} ${toolName} · ${label}` }])
        },
      })
      // Refresh any selected files the agent wrote
      if (selectedFiles.length > 0) {
        const refreshed = await Promise.all(
          selectedFiles.map(async f => {
            const r = await window.api.readFileByPath(f.path)
            return 'error' in r ? f : { ...f, content: r.content }
          })
        )
        setSelectedFiles(refreshed)
      }
      setMessages(m => [...m, { role: 'assistant', content: finalContent || '(Done — no text response.)' }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ Agent error: ${e}` }])
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const renderTree = (entries: FileEntry[], depth = 0): React.ReactNode =>
    entries.map(entry => (
      <div key={entry.path}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 0', paddingLeft: depth * 14 + 4,
            cursor: entry.oversized ? 'not-allowed' : 'pointer',
            borderRadius: 3,
            opacity: entry.oversized ? 0.4 : 1,
          }}
          onClick={() => entry.type === 'dir' ? toggleCollapse(entry.path) : toggleSelect(entry)}
        >
          {entry.type === 'dir' ? (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 10 }}>
              {collapsed.has(entry.path) ? '▶' : '▼'}
            </span>
          ) : (
            <input
              type="checkbox"
              checked={selected.has(entry.path)}
              disabled={entry.oversized}
              onChange={() => toggleSelect(entry)}
              onClick={e => e.stopPropagation()}
              style={{ width: 12, height: 12, margin: 0, flexShrink: 0 }}
            />
          )}
          <span style={{ fontSize: 11, userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.type === 'dir' ? '📁 ' : '📄 '}{entry.name}
          </span>
          {entry.oversized && <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 2 }}>too large</span>}
        </div>
        {entry.type === 'dir' && !collapsed.has(entry.path) && entry.children && renderTree(entry.children, depth + 1)}
      </div>
    ))

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>

      {/* File tree */}
      <div style={{
        width: 260, minWidth: 180, maxWidth: 400, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
      }}>
        <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={root}
            onChange={e => { setRoot(e.target.value); localStorage.setItem(LS_ROOT(tabId), e.target.value) }}
            placeholder="Folder path…"
            style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
          />
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }} onClick={browseFolder}>
            Browse
          </button>
          <button
            className="btn-ghost"
            style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
            onClick={() => setTreeRevision(r => r + 1)}
            disabled={!root || treeLoading}
            title="Refresh file tree"
          >
            ↺
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {treeLoading && <div style={{ padding: 12, fontSize: 11, color: 'var(--text-dim)' }}>Loading…</div>}
          {treeError && <div style={{ padding: 12, fontSize: 11, color: 'var(--danger, #e55)' }}>{treeError}</div>}
          {!root && <div style={{ padding: 12, fontSize: 11, color: 'var(--text-dim)' }}>Browse to a folder to begin.</div>}
          {renderTree(tree)}
        </div>

        {selectedFiles.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)' }}>
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} in context
              </span>
              <button className="btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }}
                onClick={() => { setSelected(new Set()); setSelectedFiles([]) }}>Clear</button>
            </div>
            {selectedFiles.map(f => (
              <div key={f.path} style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📄 {f.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 40, textAlign: 'center', lineHeight: 1.8 }}>
              <div>⚙️ Programming agent — always autonomous</div>
              <div style={{ fontSize: 11, marginTop: 6 }}>
                Browse a folder, check files, then describe what to build or change.<br />
                The agent reads and writes files directly — no button pushing needed.
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.type === 'activity' ? (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace', paddingLeft: 4 }}>
                  {msg.content}
                </div>
              ) : msg.role === 'user' ? (
                <div style={{
                  background: 'var(--accent, #4a90d9)', color: '#fff',
                  borderRadius: 10, padding: '8px 12px', maxWidth: '75%',
                  fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{msg.content}</div>
              ) : (
                <div style={{ maxWidth: '90%', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)' }}>
                  {msg.content}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, fontStyle: 'italic' }}>⚙️ Agent running…</div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to build or change… Enter to run."
            rows={3}
            style={{ flex: 1, resize: 'none', fontFamily: 'inherit', fontSize: 13, padding: '6px 10px' }}
          />
          <button
            className="btn-primary"
            style={{ padding: '8px 16px' }}
            onClick={send}
            disabled={sending || !input.trim()}
          >{sending ? '⚙️…' : 'Run'}</button>
        </div>

        {messages.length > 0 && (
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-ghost" style={{ fontSize: 10 }} onClick={() => setMessages([])}>Clear chat</button>
          </div>
        )}
      </div>
    </div>
  )
}
