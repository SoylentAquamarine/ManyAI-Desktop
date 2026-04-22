import { useState, useRef, useEffect } from 'react'
import { PROVIDERS, ProviderKey } from '../lib/providers'
import { callProvider, HistoryMessage } from '../lib/callProvider'
import { loadAllKeys } from '../lib/keyStore'
import { loadEnabledProviders } from '../lib/providerPrefs'
import { saveResponse } from '../lib/savedResponses'
import {
  detectTaskType, resolveProvider, loadRoutingPrefs,
  TASK_META, TASK_TYPES,
} from '../lib/routing'
import { callImageProvider } from '../lib/callImageProvider'
import type { TaskType } from '../lib/providers'

interface Message {
  role: 'user' | 'assistant'
  content: string
  provider?: string
  model?: string
  latencyMs?: number
  error?: boolean
  imageUrl?: string
  fileRef?: string   // label shown when a file was injected with this message
}

interface AttachedFile {
  path: string      // original file path
  tmpPath: string   // path + '.tmp'
  name: string      // basename
  content: string   // current working content (updated when AI gives new version)
}

/** Extract the first fenced code block's content, or the full text if none. */
function extractCode(text: string): string {
  const match = text.match(/```(?:\w+)?\n?([\s\S]*?)```/)
  return match ? match[1].trimEnd() : text
}

/** True if the response contains at least one fenced code block. */
function hasCodeBlock(text: string): boolean {
  return /```[\s\S]*?```/.test(text)
}

interface Props {
  tabId?: string
  onInjectReady?: (fn: (p: string) => void) => void
  onFirstMessage?: (text: string) => void
}

export default function ChatScreen({ tabId, onInjectReady, onFirstMessage }: Props) {
  const msgsKey = tabId ? `manyai_msgs_${tabId}`    : null
  const histKey = tabId ? `manyai_history_${tabId}` : null

  const [messages, setMessages] = useState<Message[]>(() => {
    if (!msgsKey) return []
    try { return JSON.parse(localStorage.getItem(msgsKey) ?? '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [detectedType, setDetectedType] = useState<TaskType>('general')
  const [manualType, setManualType] = useState<TaskType | 'auto'>('auto')
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const [tmpStatus, setTmpStatus] = useState<string | null>(null)

  // fileInjected: true after the first send with this attachment (so we don't
  // re-send the full file on every message — history already has it)
  const fileInjected = useRef(false)

  // Command buffer — per tab, persisted
  const [cmdHistory, setCmdHistory] = useState<string[]>(() => {
    if (!histKey) return []
    try { return JSON.parse(localStorage.getItem(histKey) ?? '[]') } catch { return [] }
  })
  const historyIdx = useRef(-1)
  const draftInput = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (msgsKey) localStorage.setItem(msgsKey, JSON.stringify(messages))
  }, [messages, msgsKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    onInjectReady?.((p: string) => {
      setInput(p)
      textareaRef.current?.focus()
    })
  }, [onInjectReady])

  useEffect(() => {
    if (input.length > 8) {
      const prefs = loadRoutingPrefs()
      if (prefs.autoDetect) setDetectedType(detectTaskType(input))
    }
  }, [input])

  const activeType: TaskType = manualType === 'auto' ? detectedType : manualType

  // ── Open a file and attach it to this chat ─────────────────────────────────
  const handleOpenFile = async () => {
    const result = await window.api.openFile()
    if ('error' in result) {
      if (result.error !== 'Cancelled') setSavedMsg(`Open failed: ${result.error}`)
      return
    }
    const tmpPath = result.path + '.tmp'
    setAttachedFile({ path: result.path, tmpPath, name: result.name, content: result.content })
    fileInjected.current = false   // fresh attach — inject on next send
    textareaRef.current?.focus()
  }

  // ── Detach file without clearing conversation ──────────────────────────────
  const handleDetachFile = () => {
    setAttachedFile(null)
    fileInjected.current = false
  }

  // ── Re-inject: next message will include the current working content again ─
  const handleReInject = () => {
    fileInjected.current = false
    setSavedMsg('File will be re-injected on next send')
    setTimeout(() => setSavedMsg(null), 2000)
    textareaRef.current?.focus()
  }

  // ── Update the working copy (.tmp) with extracted code from a response ─────
  const handleUpdateTmp = async (code: string) => {
    if (!attachedFile) return
    const result = await window.api.writeFileDirect(attachedFile.tmpPath, code)
    if ('ok' in result) {
      setAttachedFile(prev => prev ? { ...prev, content: code } : null)
      setTmpStatus(`✓ Saved to ${attachedFile.name}.tmp`)
    } else {
      setTmpStatus(`Error: ${result.error}`)
    }
    setTimeout(() => setTmpStatus(null), 3000)
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    historyIdx.current = -1
    draftInput.current = ''

    setCmdHistory(prev => {
      const next = [text, ...prev.filter(h => h !== text)].slice(0, 100)
      if (histKey) localStorage.setItem(histKey, JSON.stringify(next))
      return next
    })

    // Build the actual prompt sent to the AI
    let aiPrompt = text
    let fileRef: string | undefined
    if (attachedFile && !fileInjected.current) {
      aiPrompt = `Here is my current script (\`${attachedFile.name}\`):\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${text}`
      fileRef = attachedFile.name
      fileInjected.current = true
    }

    setMessages(prev => {
      if (prev.length === 0) onFirstMessage?.(text)
      return [...prev, { role: 'user', content: text, fileRef }]
    })
    setLoading(true)

    try {
      const keys = loadAllKeys()
      const enabled = loadEnabledProviders()
      const prefs = loadRoutingPrefs()
      const availableKeys = new Set(Object.keys(keys) as ProviderKey[])
      availableKeys.add('pollinations')

      const taskType = manualType === 'auto'
        ? (prefs.autoDetect ? detectTaskType(text) : 'general')
        : manualType

      // ── Image generation ──────────────────────────────────────────────────
      if (taskType === 'image') {
        const imgProvider = prefs.imageProvider ?? 'pollinations'
        const apiKey = imgProvider === 'openai-dalle' ? keys['openai'] : undefined
        const result = await callImageProvider(text, imgProvider, apiKey)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.error ? `Image error: ${result.error}` : '',
          imageUrl: result.error ? undefined : result.imageUrl,
          provider: imgProvider,
          model: result.model,
          error: !!result.error,
        }])
        return
      }

      // ── Text generation ───────────────────────────────────────────────────
      const route = resolveProvider(taskType, prefs, availableKeys, enabled)
      if (!route) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'No providers available. Add an API key in the API tab.',
          error: true,
        }])
        return
      }

      const provider = { ...PROVIDERS[route.provider], model: route.model }
      // History for context — callProvider appends aiPrompt as the new user turn
      const history: HistoryMessage[] = messages
        .slice(-10)
        .filter(m => !m.imageUrl)
        .map(m => ({ role: m.role, content: m.content }))

      const result = await callProvider(provider, aiPrompt, keys[route.provider], undefined, undefined, history)

      // If file is attached and response has code, auto-save to .tmp
      const responseContent = result.error ? `Error: ${result.error}` : result.content
      if (attachedFile && !result.error && hasCodeBlock(responseContent)) {
        const code = extractCode(responseContent)
        window.api.writeFileDirect(attachedFile.tmpPath, code).then(r => {
          if ('ok' in r) {
            setAttachedFile(prev => prev ? { ...prev, content: code } : null)
            setTmpStatus(`✓ Auto-saved to ${attachedFile.name}.tmp`)
            setTimeout(() => setTmpStatus(null), 3000)
          }
        })
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: responseContent,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        error: !!result.error,
      }])
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
      return
    }
    if (e.key === 'ArrowUp' && cmdHistory.length > 0) {
      e.preventDefault()
      if (historyIdx.current === -1) draftInput.current = input
      const next = Math.min(historyIdx.current + 1, cmdHistory.length - 1)
      historyIdx.current = next
      setInput(cmdHistory[next])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx.current <= 0) {
        historyIdx.current = -1
        setInput(draftInput.current)
      } else {
        historyIdx.current -= 1
        setInput(cmdHistory[historyIdx.current])
      }
    }
  }

  const handleSave = (msg: Message, idx: number) => {
    const userMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user')
    saveResponse(
      userMsg?.content ?? '',
      msg.imageUrl ? '' : msg.content,
      msg.provider ?? 'unknown',
      'General',
      undefined,
      msg.imageUrl,
    )
    setSavedMsg('Saved!')
    setTimeout(() => setSavedMsg(null), 2000)
  }

  const meta = TASK_META[activeType]

  return (
    <div className="screen">
      {/* Type bar */}
      <div className="type-bar">
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Task:</span>
        {TASK_TYPES.map(t => (
          <button
            key={t}
            className={`type-pill ${activeType === t ? 'active' : ''}`}
            onClick={() => setManualType(t === activeType && manualType !== 'auto' ? 'auto' : t)}
            title={TASK_META[t].description}
          >
            {TASK_META[t].icon} {TASK_META[t].label}
          </button>
        ))}
        {manualType !== 'auto' && (
          <button className="type-pill" onClick={() => setManualType('auto')} title="Switch back to auto-detect">
            ↺ Auto
          </button>
        )}
        {(savedMsg || tmpStatus) && (
          <span style={{ color: 'var(--accent)', marginLeft: 'auto', fontSize: 12 }}>
            {tmpStatus ?? savedMsg}
          </span>
        )}
        {messages.length > 0 && !savedMsg && !tmpStatus && (
          <button className="btn-ghost" onClick={() => setMessages([])} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 8px' }}>
            Clear
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 12 }}>{meta.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>ManyAI Desktop</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {attachedFile
                ? `📎 ${attachedFile.name} attached — describe what you want to do with it.`
                : manualType === 'auto'
                  ? 'Auto-routing active — task type detected from your prompt.'
                  : `Routing to ${meta.label} provider.`}
            </div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.imageUrl ? (
              <div className="image-bubble">
                <img src={msg.imageUrl} alt="Generated image" className="generated-image" />
              </div>
            ) : (
              <div className="message-bubble" style={msg.error ? { borderColor: 'var(--accent2)', color: 'var(--accent2)' } : {}}>
                {msg.fileRef && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 6, opacity: 0.8 }}>
                    📎 {msg.fileRef} injected
                  </div>
                )}
                {msg.content}
              </div>
            )}
            {msg.role === 'assistant' && (msg.provider || msg.latencyMs) && (
              <div className="message-meta">
                {msg.provider && `${PROVIDERS[msg.provider as ProviderKey]?.name ?? msg.provider}${msg.model ? ' · ' + msg.model : ''}`}
                {msg.latencyMs && ` · ${msg.latencyMs}ms`}
              </div>
            )}
            {msg.role === 'assistant' && !msg.error && (
              <div className="message-actions">
                <button className="btn-ghost" onClick={() => handleSave(msg, idx)}>Save</button>
                {!msg.imageUrl && (
                  <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(msg.content)}>Copy</button>
                )}
                {msg.imageUrl && (
                  <button className="btn-ghost" onClick={() => {
                    const a = document.createElement('a')
                    a.href = msg.imageUrl!
                    a.download = 'manyai-image.png'
                    a.click()
                  }}>Download</button>
                )}
                {!msg.imageUrl && attachedFile && hasCodeBlock(msg.content) && (
                  <button className="btn-ghost" style={{ color: 'var(--accent)' }}
                    onClick={() => handleUpdateTmp(extractCode(msg.content))}
                    title={`Save this code to ${attachedFile.name}.tmp`}>
                    💾 Update Working Copy
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-bubble" style={{ color: 'var(--text-dim)' }}>
              {meta.icon} Thinking ({meta.label})…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Attached file banner */}
      {attachedFile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 12px', background: 'var(--bg2)',
          borderTop: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-dim)',
        }}>
          <span style={{ color: 'var(--accent)' }}>📎</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachedFile.name}
            <span style={{ opacity: 0.5, marginLeft: 6 }}>→ {attachedFile.name}.tmp</span>
          </span>
          <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={handleReInject} title="Re-send current file content on next message">
            ↺ Re-inject
          </button>
          <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={handleDetachFile} title="Detach file">
            ✕
          </button>
        </div>
      )}

      <div className="chat-input-row">
        <button
          className="btn-ghost"
          onClick={handleOpenFile}
          title="Attach a script file to this conversation"
          style={{ padding: '0 10px', fontSize: 16, flexShrink: 0 }}
        >
          📎
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            attachedFile
              ? `What do you want to do with ${attachedFile.name}?`
              : `Ask anything… detected as ${meta.label} · Enter to send`
          }
          rows={1}
          style={{ lineHeight: '1.5' }}
        />
        <button className="btn-primary" onClick={send} disabled={loading || !input.trim()}>
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
