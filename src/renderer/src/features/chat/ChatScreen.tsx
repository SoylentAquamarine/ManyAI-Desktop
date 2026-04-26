import { useState, useRef, useEffect, useCallback } from 'react'
import { getAllProviders } from '../../lib/providers'
import { callProvider, HistoryMessage } from '../../lib/callProvider'
import { loadAllKeys } from '../../lib/keyStore'
import { loadEnabledProviders } from '../../lib/providerPrefs'
import { saveResponse } from '../../lib/savedResponses'
import { resolveAllProviders, loadRoutingPrefs, TASK_META } from '../../lib/routing'
import { getWorkflow } from '../../lib/workflows'
import { callImageProvider, isImageGenModel } from '../../lib/callImageProvider'
import { logger } from '../../lib/logger'
import { getImagesDir } from '../../lib/workingDir'
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
  parallelId?: string
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
  const [activeParallelProvider, setActiveParallelProvider] = useState<string | null>(null)
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
  }, [messages, activeParallelProvider])

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

      // ── Image generation (parallel) ───────────────────────────────────────
      if (taskType === 'image') {
        const imageRoutes = resolveAllProviders(taskType, prefs, availableKeys, enabled)
        if (imageRoutes.length === 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'No providers available. Add an API key in the API tab.', error: true }])
          return
        }
        const imageParallelId = `p_${Date.now()}`
        const imageResults = await Promise.all(imageRoutes.map(async route => {
          try {
            if (isImageGenModel(route.provider, route.model)) {
              const result = await callImageProvider(text, route.provider, route.model, keys[route.provider])
              // Auto-save image to working directory if configured
              const imagesDir = getImagesDir()
              if (imagesDir) {
                const slug = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'image'
                const ext  = result.imageUrl.match(/^data:image\/(\w+)/)?.[1] ?? 'png'
                const filename = `${slug}_${route.provider}_${Date.now()}.${ext}`
                await window.api.ensureDir(imagesDir)
                await window.api.writeFileDirect(`${imagesDir}/${filename}`, result.imageUrl)
              }
              logger.providerCall(route.provider, route.model, text, { latencyMs: 0 })
              return {
                role: 'assistant' as const,
                content: '',
                imageUrl: result.imageUrl,
                provider: route.provider,
                model: route.model,
                error: false,
                parallelId: imageParallelId,
              }
            } else {
              const p = { ...allProviders[route.provider], model: route.model }
              const result = await callProvider(p, aiPrompt, keys[route.provider])
              logger.providerCall(route.provider, route.model, text, result)
              return {
                role: 'assistant' as const,
                content: result.error ? `Error: ${result.error}` : result.content,
                provider: route.provider,
                model: route.model,
                latencyMs: result.latencyMs,
                error: !!result.error,
                parallelId: imageParallelId,
              }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`Image generation failed: ${route.provider}/${route.model}`, { error: msg })
            return {
              role: 'assistant' as const,
              content: `Error: ${msg}`,
              provider: route.provider,
              model: route.model,
              error: true,
              parallelId: imageParallelId,
            }
          }
        }))
        setMessages(prev => [...prev, ...imageResults])
        return
      }

      // ── Text generation (parallel) ────────────────────────────────────────
      const routes = resolveAllProviders(taskType, prefs, availableKeys, enabled)
      if (routes.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'No providers available. Add an API key in the API tab.',
          error: true,
        }])
        return
      }

      const parallelId = `p_${Date.now()}`

      const buildHistory = (providerKey: string, modelKey: string): HistoryMessage[] => {
        if (!continuousState) return []
        return messages
          .filter(m => {
            if (m.imageUrl) return false
            if (m.role === 'user') return true
            // For parallel messages, each slot sees only its own prior responses
            if (m.parallelId) return m.provider === providerKey && m.model === modelKey
            return true
          })
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }))
      }

      const results = await Promise.all(routes.map(async route => {
        const p = { ...allProviders[route.provider], model: route.model }
        const result = await callProvider(p, aiPrompt, keys[route.provider], undefined, undefined, buildHistory(route.provider, route.model))
        // Pin provider/model to route values — APIs may echo back a different string
        // (e.g. OpenAI returns "gpt-4o-2024-11-20", OpenRouter returns "openai/gpt-4o")
        // which would break the tab key match in visibleMessages.
        logger.providerCall(route.provider, route.model, aiPrompt, result)
        return { ...result, provider: route.provider, model: route.model, parallelId }
      }))

      // Auto-save code when there's a single provider and a code block
      if (results.length === 1 && attachedFile && !results[0].error && hasCodeBlock(results[0].content)) {
        const code = extractCode(results[0].content)
        updateTmpFile(attachedFile, code).then(r => {
          if ('ok' in r) {
            setAttachedFile(r.updatedFile)
            setTmpStatus(`✓ Auto-saved to ${attachedFile.name}.tmp`)
            setTimeout(() => setTmpStatus(null), 3000)
          }
        })
      }

      setMessages(prev => [...prev, ...results.map(result => ({
        role: 'assistant' as const,
        content: result.error ? `Error: ${result.error}` : result.content,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        error: !!result.error,
        parallelId: result.parallelId,
      }))])
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

  const handleSave = (msg: Message) => {
    const pos = messages.indexOf(msg)
    const userMsg = messages.slice(0, pos >= 0 ? pos : messages.length).reverse().find(m => m.role === 'user')
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

  /** Convert raw error strings into readable messages shown in error bubbles. */
  const friendlyError = (raw: string): string => {
    if (/aborted|abort/i.test(raw))           return '⏱ Request timed out. The provider took too long to respond.'
    if (/401|unauthorized|api key/i.test(raw)) return '🔑 Authentication failed. Check your API key for this provider.'
    if (/403|forbidden/i.test(raw))           return '🚫 Access denied. Your API key may not have permission for this model.'
    if (/429|rate limit/i.test(raw))          return '🐢 Rate limit reached. Wait a moment and try again.'
    if (/5[0-9]{2}/i.test(raw))               return `🔧 Server error from the AI provider. (${raw})`
    if (/no providers/i.test(raw))            return '⚙️ No providers configured. Add an API key in the API tab.'
    return raw
  }

  // Compute enabled parallel providers fresh from prefs on every render
  const parallelProviders = (() => {
    const prefs = loadRoutingPrefs()
    const keys = loadAllKeys()
    const enabled = loadEnabledProviders()
    const availableKeys = new Set(Object.keys(keys))
    availableKeys.add('pollinations')
    return resolveAllProviders(workflowType, prefs, availableKeys, enabled)
  })()

  const tabKey = (provider: string, model: string) => `${provider}::${model}`

  const activeTab = (() => {
    if (parallelProviders.length <= 1) return null
    const key = activeParallelProvider
    if (key && parallelProviders.some(p => tabKey(p.provider, p.model) === key)) return key
    return tabKey(parallelProviders[0].provider, parallelProviders[0].model)
  })()

  // When same provider appears multiple times (different models), show the model name in the tab
  const providerCount = parallelProviders.reduce<Record<string, number>>((acc, e) => {
    acc[e.provider] = (acc[e.provider] ?? 0) + 1
    return acc
  }, {})

  const visibleMessages = messages.filter(msg => {
    if (msg.role === 'user') return true
    if (!msg.parallelId) return true
    if (parallelProviders.length <= 1) return true
    return tabKey(msg.provider ?? '', msg.model ?? '') === activeTab
  })

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

      {parallelProviders.length > 1 && (
        <div className="parallel-tab-bar">
          {parallelProviders.map(entry => {
            const name = getAllProviders()[entry.provider]?.name ?? entry.provider
            const key = tabKey(entry.provider, entry.model)
            const isActive = key === activeTab
            const label = providerCount[entry.provider] > 1 ? `${name} · ${entry.model}` : name
            return (
              <button
                key={key}
                className={`parallel-tab${isActive ? ' active' : ''}`}
                onClick={() => setActiveParallelProvider(key)}
              >
                {label}
                {loading && isActive && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 12 }}>{meta.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 16 }}>ManyAI Desktop</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {attachedFile
                ? `📎 ${attachedFile.name} attached — describe what you want to do with it.`
                : parallelProviders.length > 1
                  ? `Sending to ${parallelProviders.length} providers in parallel.`
                  : `Sending to the best available ${meta.label.toLowerCase()} provider.`}
            </div>
          </div>
        )}
        {visibleMessages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}${msg.error ? ' message-error' : ''}`}>
            {msg.imageUrl ? (
              <div className="image-bubble">
                <img src={msg.imageUrl} alt="Generated image" className="generated-image" />
              </div>
            ) : (
              <div className="message-bubble">
                {msg.fileRef && (
                  <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 6, opacity: 0.8 }}>
                    📎 {msg.fileRef} injected
                  </div>
                )}
                {/* Translate opaque error names into user-friendly messages */}
                {msg.error
                  ? friendlyError(msg.content)
                  : msg.content}
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
                <button className="btn-ghost" onClick={() => handleSave(msg)}>Save</button>
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
