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
  imageUrl?: string   // set for image generation responses
}

interface Props {
  tabId?: string
  onInjectReady?: (fn: (p: string) => void) => void
  onFirstMessage?: (text: string) => void
}

export default function ChatScreen({ tabId, onInjectReady, onFirstMessage }: Props) {
  const msgsKey  = tabId ? `manyai_msgs_${tabId}`    : null
  const histKey  = tabId ? `manyai_history_${tabId}` : null

  const [messages, setMessages] = useState<Message[]>(() => {
    if (!msgsKey) return []
    try { return JSON.parse(localStorage.getItem(msgsKey) ?? '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [detectedType, setDetectedType] = useState<TaskType>('general')
  const [manualType, setManualType] = useState<TaskType | 'auto'>('auto')
  // Command buffer — per tab, persisted
  const [cmdHistory, setCmdHistory] = useState<string[]>(() => {
    if (!histKey) return []
    try { return JSON.parse(localStorage.getItem(histKey) ?? '[]') } catch { return [] }
  })
  const historyIdx = useRef(-1)   // -1 = not navigating
  const draftInput = useRef('')   // saved draft while navigating history
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Persist messages whenever they change
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

  // Update detected type as user types
  useEffect(() => {
    if (input.length > 8) {
      const prefs = loadRoutingPrefs()
      if (prefs.autoDetect) setDetectedType(detectTaskType(input))
    }
  }, [input])

  const activeType: TaskType = manualType === 'auto' ? detectedType : manualType

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    historyIdx.current = -1
    draftInput.current = ''
    // Add to command history (most recent first, deduplicate)
    setCmdHistory(prev => {
      const next = [text, ...prev.filter(h => h !== text)].slice(0, 100)
      if (histKey) localStorage.setItem(histKey, JSON.stringify(next))
      return next
    })
    setMessages(prev => {
      if (prev.length === 0) onFirstMessage?.(text)
      return [...prev, { role: 'user', content: text }]
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

      // ── Image generation path ──────────────────────────────────────────────
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

      // ── Text generation path ───────────────────────────────────────────────
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
      const history: HistoryMessage[] = messages
        .slice(-10)
        .filter(m => !m.imageUrl)   // skip image messages from history
        .map(m => ({ role: m.role, content: m.content }))

      const result = await callProvider(provider, text, keys[route.provider], undefined, undefined, history)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.error ? `Error: ${result.error}` : result.content,
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
    saveResponse(userMsg?.content ?? '', msg.content, msg.provider ?? 'unknown')
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
        {savedMsg && <span style={{ color: 'var(--accent)', marginLeft: 'auto', fontSize: 12 }}>{savedMsg}</span>}
        {messages.length > 0 && !savedMsg && (
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
              {manualType === 'auto'
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
                  <a href={msg.imageUrl} download="manyai-image.png" className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}>
                    Download
                  </a>
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

      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask anything… detected as ${meta.label} · Enter to send`}
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
