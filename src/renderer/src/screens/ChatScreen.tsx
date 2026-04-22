import { useState, useRef, useEffect, MutableRefObject } from 'react'
import { PROVIDERS, ROUTING_ORDER, ProviderKey, pickProvider } from '../lib/providers'
import { callProvider, HistoryMessage } from '../lib/callProvider'
import { loadAllKeys } from '../lib/keyStore'
import { loadEnabledProviders, loadSelectedModels } from '../lib/providerPrefs'
import { saveResponse } from '../lib/savedResponses'

interface Message {
  role: 'user' | 'assistant'
  content: string
  provider?: string
  model?: string
  latencyMs?: number
  error?: boolean
}

interface Props {
  injectPromptRef?: MutableRefObject<((p: string) => void) | null>
}

export default function ChatScreen({ injectPromptRef }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [manualProvider, setManualProvider] = useState<ProviderKey | 'auto'>('auto')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (injectPromptRef) {
      injectPromptRef.current = (p: string) => {
        setInput(p)
        textareaRef.current?.focus()
      }
    }
  }, [injectPromptRef])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const keys = loadAllKeys()
      const enabled = loadEnabledProviders()
      const models = loadSelectedModels()
      const availableKeys = new Set(Object.keys(keys) as ProviderKey[])
      // always include pollinations as fallback
      availableKeys.add('pollinations')

      let providerKey: ProviderKey | null
      if (manualProvider === 'auto') {
        providerKey = pickProvider(availableKeys, 'general', new Set(), ROUTING_ORDER, enabled)
      } else {
        providerKey = manualProvider
      }

      if (!providerKey) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'No providers available. Add an API key in Settings.',
          error: true,
        }])
        return
      }

      const provider = { ...PROVIDERS[providerKey], model: models[providerKey] }
      const history: HistoryMessage[] = messages
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const result = await callProvider(provider, text, keys[providerKey], undefined, undefined, history)

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
    }
  }

  const handleSave = (msg: Message, idx: number) => {
    const userMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user')
    saveResponse(userMsg?.content ?? '', msg.content, msg.provider ?? 'unknown')
    setSavedMsg('Saved!')
    setTimeout(() => setSavedMsg(null), 2000)
  }

  const clearChat = () => setMessages([])

  const enabledProviders = ROUTING_ORDER.filter(k => {
    const enabled = loadEnabledProviders()
    if (enabled[k] === false) return false
    const keys = loadAllKeys()
    return k === 'pollinations' || !!keys[k]
  })

  return (
    <div className="screen">
      <div className="provider-bar">
        <span>Provider:</span>
        <select value={manualProvider} onChange={e => setManualProvider(e.target.value as ProviderKey | 'auto')}>
          <option value="auto">Auto</option>
          {enabledProviders.map(k => (
            <option key={k} value={k}>{PROVIDERS[k].name}</option>
          ))}
        </select>
        {savedMsg && <span style={{ color: 'var(--accent)', marginLeft: 'auto' }}>{savedMsg}</span>}
        {messages.length > 0 && !savedMsg && (
          <button className="btn-ghost" onClick={clearChat} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 8px' }}>
            Clear
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>ManyAI Desktop</div>
            <div style={{ fontSize: 12 }}>Ask anything. Auto-routes to the best available provider.</div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-bubble" style={msg.error ? { borderColor: 'var(--accent2)', color: 'var(--accent2)' } : {}}>
              {msg.content}
            </div>
            {msg.role === 'assistant' && (
              <div className="message-meta">
                {msg.provider && `${PROVIDERS[msg.provider as ProviderKey]?.name ?? msg.provider} · ${msg.model}`}
                {msg.latencyMs && ` · ${msg.latencyMs}ms`}
              </div>
            )}
            {msg.role === 'assistant' && !msg.error && (
              <div className="message-actions">
                <button className="btn-ghost" onClick={() => handleSave(msg, idx)}>Save</button>
                <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(msg.content)}>Copy</button>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-bubble" style={{ color: 'var(--text-dim)' }}>Thinking…</div>
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
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
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
