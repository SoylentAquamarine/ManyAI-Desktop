import { useState, useRef, useEffect, useCallback } from 'react'
import { loadRoutingPrefs, resolveProvider } from '../../lib/routing'
import { getAllProviders, getKeylessProviderKeys } from '../../lib/providers'
import { loadAllKeys } from '../../lib/keyStore'
import { loadEnabledProviders } from '../../lib/providerPrefs'
import { callProvider, type HistoryMessage } from '../../lib/callProvider'

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
}

interface SaveBlock {
  filename: string
  content: string
  saved: boolean
  originalPath: string | null
}

interface FileSystemScreenProps {
  tabId: string
}

const LS_ROOT = (tabId: string) => `manyai_fs_root_${tabId}`
const LS_MSGS = (tabId: string) => `manyai_fs_msgs_${tabId}`
const MAX_FILE_BYTES = 100 * 1024

export default function FileSystemScreen({ tabId }: FileSystemScreenProps) {
  const [root, setRoot] = useState<string>(() => localStorage.getItem(LS_ROOT(tabId)) ?? '')
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
  const [saveConfirm, setSaveConfirm] = useState<{ block: SaveBlock; idx: number; blockIdx: number } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    localStorage.setItem(LS_MSGS(tabId), JSON.stringify(messages))
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load tree when root changes
  useEffect(() => {
    if (!root) { setTree([]); return }
    setTreeLoading(true)
    setTreeError('')
    window.api.readDir(root).then(result => {
      setTreeLoading(false)
      if ('error' in result) { setTreeError(result.error); return }
      setTree(result.entries as FileEntry[])
    })
  }, [root])

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

  const clearSelection = () => {
    setSelected(new Set())
    setSelectedFiles([])
  }

  const buildFileContext = (): string => {
    const fileBlocks = selectedFiles.length > 0
      ? '\n\nThe user has the following files open:\n\n' +
        selectedFiles.map(f => `### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')
      : ''

    return (
      `You are a file editor assistant with direct read/write access to the user's filesystem.\n` +
      `IMPORTANT RULES — follow these exactly, no exceptions:\n` +
      `1. Whenever you produce file content (new files OR edits), you MUST wrap it in a fenced block with a filename header like this:\n` +
      `\`\`\`filename: path/to/file.html\n...complete file content here...\n\`\`\`\n` +
      `2. Always return the COMPLETE file content — never partial snippets or diffs.\n` +
      `3. NEVER tell the user to copy, paste, or save manually. The UI has a Save button that writes the file directly. Just produce the block.\n` +
      `4. If the user asks you to create a new file, use a sensible filename and produce the block. The user will click Save to write it.\n` +
      `5. If the user asks you to save, that means produce the filename block — the UI handles the actual write.` +
      fileBlocks
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
    const entry = resolveProvider('filesystem', prefs, availableKeys, enabledMap)

    if (!entry) {
      setMessages(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: '⚠️ No provider available. Configure a provider for this workflow in Settings → Workflows.' }])
      setSending(false)
      return
    }

    const allProviders = getAllProviders()
    const provider = allProviders[entry.provider]
    if (!provider) {
      setMessages(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: `⚠️ Provider "${entry.provider}" not found.` }])
      setSending(false)
      return
    }

    // Prepend file context to the user message (only on first turn or when files change)
    const fileContext = buildFileContext()
    const fullPrompt = fileContext ? `${fileContext}\n\n---\n\nUser request: ${text}` : text

    // Build history from previous messages (exclude the current one)
    const history: HistoryMessage[] = messages.map(m => ({ role: m.role, content: m.content }))

    const userMsg: Message = { role: 'user', content: text }
    setMessages(m => [...m, userMsg])

    try {
      const result = await callProvider(provider, fullPrompt, keys[entry.provider], undefined, undefined, history)
      setMessages(m => [...m, { role: 'assistant', content: result.content || result.error || 'No response.' }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ Error: ${e}` }])
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // Parse fenced code blocks from assistant messages
  const parseBlocks = (content: string): (string | SaveBlock)[] => {
    const parts: (string | SaveBlock)[] = []
    const regex = /```filename:\s*(.+?)\n([\s\S]*?)```/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      if (match.index > last) parts.push(content.slice(last, match.index))
      const filePath = match[1].trim()
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath
      // Find original path from selected files
      const originalFile = selectedFiles.find(f => f.path === filePath || f.name === fileName)
      parts.push({ filename: fileName, content: match[2], saved: false, originalPath: originalFile?.path ?? null })
      last = match.index + match[0].length
    }
    if (last < content.length) parts.push(content.slice(last))
    return parts
  }

  const confirmSave = async (block: SaveBlock, msgIdx: number, blockIdx: number) => {
    if (!block.originalPath) {
      setSaveConfirm({ block, idx: msgIdx, blockIdx })
      return
    }
    await doSave(block.originalPath, block.content, msgIdx, blockIdx)
  }

  const doSave = async (savePath: string, content: string, msgIdx: number, blockIdx: number) => {
    const result = await window.api.writeFileDirect(savePath, content)
    if ('error' in result) { alert(`Save failed: ${result.error}`); return }
    setSavedBlocks(prev => new Set(prev).add(`${msgIdx}:${blockIdx}`))
    setSaveConfirm(null)
    const refreshed = await window.api.readFileByPath(savePath)
    if (!('error' in refreshed)) {
      setSelectedFiles(prev => prev.map(f => f.path === savePath ? { ...f, content: refreshed.content } : f))
    }
  }

  const saveAll = async (msgIdx: number) => {
    const msg = messages[msgIdx]
    if (!msg) return
    const blocks = parseBlocks(msg.content).filter((p): p is SaveBlock => typeof p !== 'string')
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      // Count block index within the full parsed list
      const allParts = parseBlocks(msg.content)
      const blockIdx = allParts.filter((p): p is SaveBlock => typeof p !== 'string').indexOf(block)
      if (savedBlocks.has(`${msgIdx}:${blockIdx}`)) continue
      if (block.originalPath) {
        await doSave(block.originalPath, block.content, msgIdx, blockIdx)
      } else {
        // Derive save path from root + filename if we have a root folder
        if (root) {
          const savePath = `${root}\\${block.filename}`
          await doSave(savePath, block.content, msgIdx, blockIdx)
        } else {
          setSaveConfirm({ block, idx: msgIdx, blockIdx })
          return // Stop and let user resolve this one; they can Save All again after
        }
      }
    }
  }

  const [savedBlocks, setSavedBlocks] = useState<Set<string>>(new Set())

  const renderTree = (entries: FileEntry[], depth = 0): React.ReactNode => {
    return entries.map(entry => (
      <div key={entry.path}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 0 2px', paddingLeft: depth * 14 + 4,
            cursor: entry.oversized ? 'not-allowed' : entry.type === 'dir' ? 'pointer' : 'pointer',
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
        {entry.type === 'dir' && !collapsed.has(entry.path) && entry.children &&
          renderTree(entry.children, depth + 1)}
      </div>
    ))
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>

      {/* ── Left: file tree ── */}
      <div style={{
        width: 260, minWidth: 180, maxWidth: 400, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
      }}>
        {/* Folder bar */}
        <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={root}
            onChange={e => { setRoot(e.target.value); localStorage.setItem(LS_ROOT(tabId), e.target.value) }}
            onBlur={() => { if (root) setTree([]) }}
            onKeyDown={e => { if (e.key === 'Enter') { setTree([]); setTree(tree) } }}
            placeholder="Folder path…"
            style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
          />
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }} onClick={browseFolder}>
            Browse
          </button>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {treeLoading && <div style={{ padding: 12, fontSize: 11, color: 'var(--text-dim)' }}>Loading…</div>}
          {treeError && <div style={{ padding: 12, fontSize: 11, color: 'var(--danger, #e55)' }}>{treeError}</div>}
          {!root && <div style={{ padding: 12, fontSize: 11, color: 'var(--text-dim)' }}>Browse to a folder to begin.</div>}
          {renderTree(tree)}
        </div>

        {/* Selected files summary */}
        {selectedFiles.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)' }}>
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} in context
              </span>
              <button className="btn-ghost" style={{ fontSize: 10, padding: '1px 6px' }} onClick={clearSelection}>Clear</button>
            </div>
            {selectedFiles.map(f => (
              <div key={f.path} style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📄 {f.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right: chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 40, textAlign: 'center', lineHeight: 1.8 }}>
              {selectedFiles.length === 0 ? (
                <>
                  <div>No files selected.</div>
                  <div style={{ fontSize: 11, marginTop: 6 }}>
                    Browse a folder and check files to edit them,<br />
                    or just ask to <em>create</em> a new file — no selection needed.
                  </div>
                </>
              ) : (
                <div>{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} in context — type a command.</div>
              )}
            </div>
          )}
          {messages.map((msg, msgIdx) => (
            <div key={msgIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'user' ? (
                <div style={{
                  background: 'var(--accent, #4a90d9)', color: '#fff',
                  borderRadius: 10, padding: '8px 12px', maxWidth: '75%',
                  fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{msg.content}</div>
              ) : (
                <div style={{ maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(() => {
                    const fileBlocks = parseBlocks(msg.content).filter((p): p is SaveBlock => typeof p !== 'string')
                    const unsaved = fileBlocks.filter((_, i) => {
                      const allParts = parseBlocks(msg.content)
                      const blockIdx = allParts.filter((p): p is SaveBlock => typeof p !== 'string').indexOf(fileBlocks[i])
                      return !savedBlocks.has(`${msgIdx}:${blockIdx}`)
                    })
                    return fileBlocks.length >= 2 && unsaved.length > 0 ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          className="btn-primary"
                          style={{ fontSize: 11, padding: '4px 14px' }}
                          onClick={() => saveAll(msgIdx)}
                        >
                          💾 Save All {unsaved.length} files
                        </button>
                      </div>
                    ) : null
                  })()}
                  {parseBlocks(msg.content).map((part, blockIdx) =>
                    typeof part === 'string' ? (
                      part.trim() && (
                        <div key={blockIdx} style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)' }}>
                          {part}
                        </div>
                      )
                    ) : (
                      <div key={blockIdx} style={{
                        border: '1px solid var(--border)', borderRadius: 8,
                        overflow: 'hidden', background: 'var(--bg2)',
                      }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '5px 10px', borderBottom: '1px solid var(--border)',
                          background: 'var(--surface)',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>📄 {part.filename}</span>
                          {savedBlocks.has(`${msgIdx}:${blockIdx}`) ? (
                            <span style={{ fontSize: 11, color: '#4caf50' }}>✓ Saved</span>
                          ) : (
                            <button
                              className="btn-primary"
                              style={{ fontSize: 11, padding: '2px 10px' }}
                              onClick={() => confirmSave(part, msgIdx, blockIdx)}
                            >Save</button>
                          )}
                        </div>
                        <pre style={{
                          margin: 0, padding: '8px 12px', fontSize: 11,
                          overflowX: 'auto', maxHeight: 400, overflowY: 'auto',
                          fontFamily: 'monospace', whiteSpace: 'pre',
                        }}>{part.content}</pre>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, fontStyle: 'italic' }}>Thinking…</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command… e.g. 'Create index.html with a nav bar' or select files to edit them. Enter to send."
            rows={3}
            style={{ flex: 1, resize: 'none', fontFamily: 'inherit', fontSize: 13, padding: '6px 10px' }}
          />
          <button
            className="btn-primary"
            style={{ padding: '8px 16px', flexShrink: 0 }}
            onClick={send}
            disabled={sending || !input.trim()}
          >{sending ? '…' : 'Send'}</button>
        </div>

        {/* Clear chat */}
        {messages.length > 0 && (
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-ghost" style={{ fontSize: 10 }} onClick={() => setMessages([])}>Clear chat</button>
          </div>
        )}
      </div>

      {/* ── Save confirmation modal ── */}
      {saveConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setSaveConfirm(null)}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 24, width: 420,
            display: 'flex', flexDirection: 'column', gap: 12,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Save file</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              No matching open file found for <strong>{saveConfirm.block.filename}</strong>. Choose where to save:
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setSaveConfirm(null)}>Cancel</button>
              <button className="btn-primary" onClick={async () => {
                const result = await window.api.saveFile(saveConfirm.block.filename, saveConfirm.block.content, root || undefined)
                if ('error' in result) return
                setSavedBlocks(prev => new Set(prev).add(`${saveConfirm.idx}:${saveConfirm.blockIdx}`))
                setSaveConfirm(null)
              }}>Save As…</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
