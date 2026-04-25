import { useState, useRef, useEffect, useCallback } from 'react'
import { getAllProviders } from '../../lib/providers'
import { callProvider, HistoryMessage } from '../../lib/callProvider'
import { loadAllKeys } from '../../lib/keyStore'
import { loadEnabledProviders } from '../../lib/providerPrefs'
import { saveResponse } from '../../lib/savedResponses'
import { resolveProvider, loadRoutingPrefs, TASK_META } from '../../lib/routing'
import { getWorkflow } from '../../lib/workflows'
import { callImageProvider, isImageGenModel } from '../../lib/callImageProvider'
import type { TaskType } from '../../lib/providers'
import {
  type AttachedFile,
  extractCode,
  hasCodeBlock,
  buildFilePrompt,
  openFile,
  updateTmpFile,
} from './fileHandler'

interface Message {
  role: 'user' | 'assistant'
  content: string
  provider?: string
  model?: string
  latencyMs?: number
  error?: boolean
  imageUrl?: string
  fileRef?: string
}

interface Props {
  tabId?: string
  workflowType?: TaskType
  continuousState?: boolean
  onInjectReady?: (fn: (p: string) => void) => void
  onFirstMessage?: (text: string) => void
}

export default function ChatScreen({ tabId, workflowType = 'general', continuousState = true, onInjectReady, onFirstMessage }: Props) {
  const msgsKey  = tabId ? `manyai_msgs_${tabId}`    : null
  const histKey  = tabId ? `manyai_history_${tabId}` : null
  const inputKey = tabId ? `manyai_input_${tabId}`   : null

  const [messages, setMessages] = useState<Message[]>(() => {
    if (!msgsKey) return []
    try { return JSON.parse(localStorage.getItem(msgsKey) ?? '[]') } catch { return [] }
  })
  const [input, setInput] = useState(() => {
    if (!inputKey) return ''
    return localStorage.getItem(inputKey) ?? ''
  })
  const [loading, setLoading] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const [tmpStatus, setTmpStatus] = useState<string | null>(null)
  const [inputHeight, setInputHeight] = useState(() =>
    parseInt(localStorage.getItem(`manyai_input_h_${tabId ?? 'default'}`) ?? '80', 10)
  )
  const inputDragging = useRef(false)
  const inputDragStartY = useRef(0)
  const inputDragStartH = useRef(0)

  const onInputResizeMouseDown = useCallback((e: React.MouseEvent) => {
    inputDragging.current = true
    inputDragStartY.current = e.clientY
    inputDragStartH.current = inputHeight
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [inputHeight])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!inputDragging.current) return
      const delta = inputDragStartY.current - e.clientY
      const next = Math.max(40, Math.min(400, inputDragStartH.current + delta))
      setInputHeight(next)
    }
    const onUp = () => {
      if (!inputDragging.current) return
      inputDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setInputHeight(h => {
        localStorage.setItem(`manyai_input_h_${tabId ?? 'default'}`, String(h))
        return h
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

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
    if (inputKey) localStorage.setItem(inputKey, input)
  }, [input, inputKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    onInjectReady?.((p: string) => {
      setInput(p)
      textareaRef.current?.focus()
    })
  }, [onInjectReady])

  const activeType: TaskType = workflowType

  const handleOpenFile = async () => {
    const result = await openFile()
    if (result === null) return
    if ('error' in result) { setSavedMsg(`Open failed: ${result.error}`); return }
    setAttachedFile(result)
    fileInjected.current = false
    textareaRef.current?.focus()
  }

  const handleDetachFile = () => {
    setAttachedFile(null)
    fileInjected.current = false
  }

  const handleReInject = () => {
    fileInjected.current = false
    setSavedMsg('File will be re-injected on next send')
    setTimeout(() => setSavedMsg(null), 2000)
    textareaRef.current?.focus()
  }

  const handleUpdateTmp = async (code: string) => {
    if (!attachedFile) return
    const result = await updateTmpFile(attachedFile, code)
    if ('ok' in result) {
      setAttachedFile(result.updatedFile)
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

    let aiPrompt = text
    let fileRef: string | undefined
    if (attachedFile && !fileInjected.current) {
      aiPrompt = buildFilePrompt(text, attachedFile)
      fileRef = attachedFile.name
      fileInjected.current = true
    }

    // Silently prepend workflow context (system prompt + context files)
    const wfDef = workflowType ? getWorkflow(workflowType) : undefined
    if (wfDef) {
      const parts: string[] = []
      if (wfDef.systemPrompt?.trim()) parts.push(wfDef.systemPrompt.trim())
      for (const cf of wfDef.contextFiles ?? []) {
        try {
          const result = await window.api.readFileByPath(cf.path)
          if (!('error' in result)) {
            parts.push(`[${cf.name}]\n${result.content}`)
          }
        } catch { /* skip unreadable files silently */ }
      }
      if (parts.length) aiPrompt = parts.join('\n\n---\n\n') + '\n\n---\n\n' + aiPrompt
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
      const allProviders = getAllProviders()
      const availableKeys = new Set(Object.keys(keys))
      availableKeys.add('pollinations')

      const taskType = workflowType

      // ── Image generation ──────────────────────────────────────────────────
      if (taskType === 'image') {
        const route = resolveProvider(taskType, prefs, availableKeys, enabled)
        if (!route) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'No providers available. Add an API key in the API tab.', error: true }])
          return
        }
        if (isImageGenModel(route.provider, route.model)) {
          const apiKey = keys[route.provider]
          const result = await callImageProvider(text, route.provider, route.model, apiKey)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: result.error ? `Image error: ${result.error}` : '',
            imageUrl: result.error ? undefined : result.imageUrl,
            provider: result.provider,
            model: result.model,
            error: !!result.error,
          }])
        } else {
          // Text provider selected for image workflow — respond with text
          const provider = { ...allProviders[route.provider], model: route.model }
          const result = await callProvider(provider, aiPrompt, keys[route.provider])
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: result.error ? `Error: ${result.error}` : result.content,
            provider: result.provider,
            model: result.model,
            latencyMs: result.latencyMs,
            error: !!result.error,
          }])
        }
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

      const provider = { ...allProviders[route.provider], model: route.model }
      // History for context — callProvider appends aiPrompt as the new user turn
      const history: HistoryMessage[] = continuousState
        ? messages.slice(-10).filter(m => !m.imageUrl).map(m => ({ role: m.role, content: m.content }))
        : []

      const result = await callProvider(provider, aiPrompt, keys[route.provider], undefined, undefined, history)

      const responseContent = result.error ? `Error: ${result.error}` : result.content
      if (attachedFile && !result.error && hasCodeBlock(responseContent)) {
        const code = extractCode(responseContent)
        updateTmpFile(attachedFile, code).then(r => {
          if ('ok' in r) {
            setAttachedFile(r.updatedFile)
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

  const meta = TASK_META[activeType] ?? getWorkflow(activeType) ?? { label: activeType, icon: '🔧', description: '' }

  return (
    <div className="screen">
      {/* Workflow bar */}
      <div className="type-bar">
        <span style={{ fontSize: 15 }}>{meta.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{meta.description}</span>
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
                : `Routing to the best available ${meta.label.toLowerCase()} provider.`}
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
                {msg.provider && `${getAllProviders()[msg.provider]?.name ?? msg.provider}${msg.model ? ' · ' + msg.model : ''}`}
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

      <div
        onMouseDown={onInputResizeMouseDown}
        style={{
          height: 5, cursor: 'row-resize', flexShrink: 0,
          background: 'transparent', borderTop: '1px solid var(--border)',
        }}
        title="Drag to resize input"
      />
      <div className="chat-input-row" style={{ height: inputHeight }}>
        <button
          className="btn-ghost"
          onClick={handleOpenFile}
          title="Attach a script file to this conversation"
          style={{ padding: '0 10px', fontSize: 16, flexShrink: 0, alignSelf: 'flex-end' }}
        >
          📎
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder=""
          style={{ lineHeight: '1.5', height: '100%', resize: 'none' }}
        />
        <button className="btn-primary" onClick={send} disabled={loading || !input.trim()}
          style={{ alignSelf: 'flex-end' }}>
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
