import { useState, useRef, useEffect, useCallback } from 'react'
import { getAllProviders, getKeylessProviderKeys } from '../../lib/providers'
import { callProvider, HistoryMessage } from '../../lib/callProvider'
import { loadAllKeys } from '../../lib/keyStore'
import { loadEnabledProviders } from '../../lib/providerPrefs'
import { resolveAllProviders, loadRoutingPrefs, TASK_META } from '../../lib/routing'
import { getWorkflow } from '../../lib/workflows'
import { callImageProvider, isImageGenModel } from '../../lib/callImageProvider'
import { logger } from '../../lib/logger'
import { getImagesDir, getWorkingDir } from '../../lib/workingDir'
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
  instanceId?: string   // GUID of the provider slot that produced this response
  recipients?: string[] // instanceIds that received this user message
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef<Map<string | null, number>>(new Map())
  const prevActiveTab = useRef<string | null>(null)
  // true (or absent) = pinned to bottom; false = user has scrolled up
  const pinnedToBottom = useRef<Map<string | null, boolean>>(new Map())
  // always-current activeTab for use in the scroll handler without stale closure
  const activeTabRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const persistedCount = useRef(0)

  useEffect(() => {
    if (msgsKey) localStorage.setItem(msgsKey, JSON.stringify(messages))
  }, [messages, msgsKey])

  // Load history from SQLite on mount (overrides localStorage with full history)
  useEffect(() => {
    if (!tabId) return
    window.api.getMessages(tabId, 200).then(r => {
      if ('messages' in r && r.messages.length > 0) {
        const loaded = r.messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          provider: m.provider,
          model: m.model,
        }))
        setMessages(loaded)
        persistedCount.current = loaded.length
      }
    })
  }, [tabId])

  // Persist new messages to SQLite (delta only — skips already-persisted and image messages)
  useEffect(() => {
    if (!tabId) return
    const newMsgs = messages.slice(persistedCount.current)
    if (!newMsgs.length) return
    for (const msg of newMsgs) {
      if (!msg.imageUrl) {
        window.api.addMessage(tabId, msg.role, msg.content, msg.provider, msg.model)
      }
    }
    persistedCount.current = messages.length
  }, [messages, tabId])

  useEffect(() => {
    if (inputKey) localStorage.setItem(inputKey, input)
  }, [input, inputKey])

  // When new messages arrive: scroll active tab if pinned; clear saved position for
  // inactive pinned tabs so they jump to bottom when the user switches back.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const isPinned = (tab: string | null) => pinnedToBottom.current.get(tab) !== false
    if (isPinned(activeTabRef.current)) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    // Inactive pinned tabs: forget their saved position → they'll default to scrollHeight on switch
    for (const [tab, pinned] of pinnedToBottom.current) {
      if (tab !== activeTabRef.current && pinned) scrollPositions.current.delete(tab)
    }
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

    // Resolve routes before adding the user message so we can tag who hears it.
    // This drives the "hands over ears" model: unchecked providers don't receive
    // the user message and won't see it in their history on future turns.
    const keys = loadAllKeys()
    const enabled = loadEnabledProviders()
    const prefs = loadRoutingPrefs()
    const allProviders = getAllProviders()
    const availableKeys = new Set(Object.keys(keys))
    getKeylessProviderKeys().forEach(k => availableKeys.add(k))
    const taskType = workflowType
    const activeRoutes = resolveAllProviders(taskType, prefs, availableKeys, enabled)
    const recipients = activeRoutes.map(r => r.instanceId ?? r.provider)

    setMessages(prev => {
      if (prev.length === 0) onFirstMessage?.(text)
      return [...prev, { role: 'user', content: text, fileRef, recipients }]
    })
    setLoading(true)

    try {
      // ── Image generation (parallel) ───────────────────────────────────────
      if (taskType === 'image') {
        const imageRoutes = activeRoutes
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
                const cleaned = text.trim()
                  .replace(/^(generate|create|make|draw|show|give me|render)\s+(me\s+)?(a\s+|an\s+)?(picture|image|photo|illustration|drawing)\s+(of\s+)?/i, '')
                  .trim()
                const slug = (cleaned || text.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50) || 'image'
                const providerSlug = `${route.provider}-${route.model}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
                const ext  = result.imageUrl.match(/^data:image\/(\w+)/)?.[1] ?? 'png'
                const filename = `${slug}_${providerSlug}_${Date.now()}.${ext}`
                await window.api.ensureDir(imagesDir)
                await window.api.writeImageFile(`${imagesDir}/${filename}`, result.imageUrl)
              }
              logger.providerCall(route.provider, route.model, text, { latencyMs: 0 })
              return {
                role: 'assistant' as const,
                content: '',
                imageUrl: result.imageUrl,
                provider: route.provider,
                model: route.model,
                instanceId: route.instanceId,
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
                instanceId: route.instanceId,
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
              instanceId: route.instanceId,
              error: true,
              parallelId: imageParallelId,
            }
          }
        }))
        setMessages(prev => [...prev, ...imageResults])
        return
      }

      // ── Text generation (parallel) ────────────────────────────────────────
      const routes = activeRoutes
      if (routes.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'No providers available. Add an API key in the API tab.',
          error: true,
        }])
        return
      }

      const parallelId = `p_${Date.now()}`

      const buildHistory = (route: typeof routes[number]): HistoryMessage[] => {
        if (!continuousState) return []
        const id = route.instanceId ?? `${route.provider}::${route.model}`
        return messages
          .filter(m => {
            if (m.imageUrl) return false
            if (m.role === 'user') {
              // No recipients = pre-GUID message, include for all providers
              return !m.recipients || m.recipients.includes(id)
            }
            if (m.parallelId) {
              // Match by instanceId when present; fall back to provider::model for pre-GUID messages
              return m.instanceId ? m.instanceId === id : m.provider === route.provider && m.model === route.model
            }
            return true
          })
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }))
      }

      await Promise.all(routes.map(async route => {
        const instanceId = route.instanceId ?? `${route.provider}::${route.model}`
        const p = { ...allProviders[route.provider], model: route.model }
        let result: Awaited<ReturnType<typeof callProvider>>
        try {
          result = await callProvider(p, aiPrompt, keys[route.provider], undefined, undefined, buildHistory(route))
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: `Error: ${msg}`,
            provider: route.provider,
            model: route.model,
            instanceId,
            error: true,
            parallelId,
          }])
          return
        }
        // Pin provider/model to route values — APIs may echo back a different string
        // (e.g. OpenAI returns "gpt-4o-2024-11-20", OpenRouter returns "openai/gpt-4o")
        // which would break the tab key match in visibleMessages.
        logger.providerCall(route.provider, route.model, aiPrompt, result)

        const msg = {
          role: 'assistant' as const,
          content: result.error ? `Error: ${result.error}` : result.content,
          provider: route.provider,
          model: route.model,
          instanceId,
          latencyMs: result.latencyMs,
          error: !!result.error,
          parallelId,
        }
        setMessages(prev => [...prev, msg])

        // Auto-save code when there's a single provider and a code block
        if (routes.length === 1 && attachedFile && !result.error && hasCodeBlock(result.content)) {
          const code = extractCode(result.content)
          updateTmpFile(attachedFile, code).then(r => {
            if ('ok' in r) {
              setAttachedFile(r.updatedFile)
              setTmpStatus(`✓ Auto-saved to ${attachedFile.name}.tmp`)
              setTimeout(() => setTmpStatus(null), 3000)
            }
          })
        }
      }))
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

  const handleSave = async (msg: Message) => {
    const slug = msg.content.trim().slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'response'
    const filename = `${slug}_${Date.now()}.md`
    const workingDir = getWorkingDir() || undefined
    const result = await window.api.saveFile(filename, msg.content, workingDir)
    if ('error' in result) {
      if (result.error !== 'Cancelled') {
        setSavedMsg(`Save failed: ${result.error}`)
        setTimeout(() => setSavedMsg(null), 3000)
      }
    } else {
      setSavedMsg('Saved!')
      setTimeout(() => setSavedMsg(null), 2000)
    }
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

  // Compute enabled parallel providers and full chain together to share one loadRoutingPrefs call
  const { parallelProviders, fullChain } = (() => {
    const prefs = loadRoutingPrefs()
    const keys = loadAllKeys()
    const enabled = loadEnabledProviders()
    const availableKeys = new Set(Object.keys(keys))
    getKeylessProviderKeys().forEach(k => availableKeys.add(k))
    return {
      parallelProviders: resolveAllProviders(workflowType, prefs, availableKeys, enabled),
      fullChain: prefs.routes[workflowType] ?? [],
    }
  })()

  // instanceId is the stable GUID per provider slot; fall back to provider::model for legacy messages
  const msgInstanceId = (msg: { instanceId?: string; provider?: string; model?: string }) =>
    msg.instanceId ?? `${msg.provider}::${msg.model}`

  const routeInstanceId = (route: { instanceId?: string; provider: string; model: string }) =>
    route.instanceId ?? `${route.provider}::${route.model}`

  // Tab bar uses history + enabled providers so unchecking a provider doesn't remove its tab.
  // Tabs only disappear when a provider is deleted from the workflow entirely.
  const tabProviders = (() => {
    // Map provider::model → instanceId so legacy messages (no instanceId) deduplicate correctly
    const legacyIdMap = new Map<string, string>()
    for (const route of fullChain) {
      if (route.instanceId) legacyIdMap.set(`${route.provider}::${route.model}`, route.instanceId)
    }

    const seen = new Map<string, { provider: string; model: string; instanceId: string }>()
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.parallelId && msg.provider && msg.model) {
        const id = msg.instanceId
          ?? legacyIdMap.get(`${msg.provider}::${msg.model}`)
          ?? `${msg.provider}::${msg.model}`
        if (!seen.has(id)) seen.set(id, { provider: msg.provider, model: msg.model, instanceId: id })
      }
    }
    for (const route of parallelProviders) {
      const id = routeInstanceId(route)
      if (!seen.has(id)) seen.set(id, { provider: route.provider, model: route.model, instanceId: id })
    }
    return [...seen.values()]
  })()

  const enabledTabKeys = new Set(parallelProviders.map(routeInstanceId))

  const activeTab = (() => {
    if (tabProviders.length <= 1) return null
    const key = activeParallelProvider
    if (key && tabProviders.some(p => p.instanceId === key)) return key
    return tabProviders[0].instanceId
  })()

  activeTabRef.current = activeTab

  // When same provider appears multiple times (different models), show the model name in the tab
  const providerCount = tabProviders.reduce<Record<string, number>>((acc, e) => {
    acc[e.provider] = (acc[e.provider] ?? 0) + 1
    return acc
  }, {})

  const visibleMessages = messages.filter(msg => {
    if (msg.role === 'user') return true
    if (!msg.parallelId) return true
    if (tabProviders.length <= 1) return true
    return msgInstanceId(msg) === activeTab
  })

  const allProvidersMap = getAllProviders()

  // Restore scroll position when switching tabs.
  // Saving is done in the tab click handler (before DOM changes) so we capture the real position.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || prevActiveTab.current === activeTab) return
    const saved = scrollPositions.current.get(activeTab)
    container.scrollTop = saved ?? container.scrollHeight
    prevActiveTab.current = activeTab
  }, [activeTab])

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
          <button className="btn-ghost" onClick={() => {
            setMessages([])
            persistedCount.current = 0
            if (tabId) window.api.clearMessages(tabId)
          }} style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 8px' }}>
            Clear
          </button>
        )}
      </div>

      {tabProviders.length > 1 && (
        <div className="parallel-tab-bar">
          {tabProviders.map(entry => {
            const name = allProvidersMap[entry.provider]?.name ?? entry.provider
            const isActive = entry.instanceId === activeTab
            const isEnabled = enabledTabKeys.has(entry.instanceId)
            const label = providerCount[entry.provider] > 1 ? `${name} · ${entry.model}` : name
            return (
              <button
                key={entry.instanceId}
                className={`parallel-tab${isActive ? ' active' : ''}`}
                onClick={() => {
                  if (scrollContainerRef.current)
                    scrollPositions.current.set(activeTab, scrollContainerRef.current.scrollTop)
                  setActiveParallelProvider(entry.instanceId)
                }}
                title={isEnabled ? undefined : 'Paused — unchecked in workflow'}
                style={isEnabled ? undefined : { opacity: 0.45 }}
              >
                {label}
                {!isEnabled && <span style={{ marginLeft: 4, fontSize: 10 }}>⏸</span>}
                {loading && isActive && isEnabled && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="chat-messages" ref={scrollContainerRef} onScroll={() => {
        const c = scrollContainerRef.current
        if (!c) return
        pinnedToBottom.current.set(activeTabRef.current, c.scrollTop + c.clientHeight >= c.scrollHeight - 50)
      }}>
        {messages.length === 0 && attachedFile && (
          <div className="empty-state">
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              📎 {attachedFile.name} attached — describe what you want to do with it.
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
                {msg.provider && `${allProvidersMap[msg.provider]?.name ?? msg.provider}${msg.model ? ' · ' + msg.model : ''}`}
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
