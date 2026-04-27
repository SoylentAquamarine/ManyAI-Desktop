/**
 * IrcScreen.tsx — Full IRC client UI rendered inside a ManyAI tab.
 *
 * Layout (top to bottom):
 *   1. Connection form  — shown when disconnected
 *   2. Channel bar      — shown when connected (server info, join/part, channel tabs)
 *   3. Message area     — scrollable, auto-pins to bottom
 *   4. Input row        — text input with /command support
 *
 * All IRC operations go through window.api.irc* IPC bridges.
 * Incoming events arrive via window.electron.ipcRenderer.on('irc-event', …).
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface IrcMessage {
  id:    number
  ts:    Date
  type:  'message' | 'system' | 'error'
  nick?: string
  text:  string
}

interface ChannelState {
  messages: IrcMessage[]
  names:    string[]
  topic:    string
}

interface ConnectionConfig {
  server:    string
  port:      number
  nick:      string
  username:  string
  realname:  string
  password?: string
}

const DEFAULT_CONFIG: ConnectionConfig = {
  server:   'irc.libera.chat',
  port:     6667,
  nick:     '',
  username: '',
  realname: '',
  password: '',
}

const LS_KEY = 'manyai_irc_connection'

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadConfig(): ConnectionConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 5) // HH:MM
}

let msgIdSeq = 0
function nextId(): number { return ++msgIdSeq }

// ── Component ─────────────────────────────────────────────────────────────────

export default function IrcScreen() {
  const [config, setConfig] = useState<ConnectionConfig>(loadConfig)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [currentNick, setCurrentNick] = useState('')
  const [connectedServer, setConnectedServer] = useState('')

  // channels: key is channel name (lowercase), value is its state
  const [channels, setChannels] = useState<Map<string, ChannelState>>(new Map())
  const [activeChannel, setActiveChannel] = useState<string | null>(null)
  const [channelInput, setChannelInput] = useState('')
  const [input, setInput] = useState('')

  const messagesEndRef   = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom   = useRef(true)
  const inputRef         = useRef<HTMLTextAreaElement>(null)

  // Persist config on every change (password excluded from persistence)
  useEffect(() => {
    const { password: _, ...rest } = config
    localStorage.setItem(LS_KEY, JSON.stringify(rest))
  }, [config])

  // ── Channel state mutators ──────────────────────────────────────────────────

  const ensureChannel = useCallback((ch: string): void => {
    setChannels(prev => {
      if (prev.has(ch)) return prev
      const next = new Map(prev)
      next.set(ch, { messages: [], names: [], topic: '' })
      return next
    })
    setActiveChannel(prev => prev ?? ch)
  }, [])

  const addMessage = useCallback((ch: string, msg: IrcMessage): void => {
    ensureChannel(ch)
    setChannels(prev => {
      const next = new Map(prev)
      const existing = next.get(ch) ?? { messages: [], names: [], topic: '' }
      next.set(ch, { ...existing, messages: [...existing.messages, msg] })
      return next
    })
  }, [ensureChannel])

  const addSystem = useCallback((ch: string, text: string): void => {
    addMessage(ch, { id: nextId(), ts: new Date(), type: 'system', text })
  }, [addMessage])

  const addError = useCallback((ch: string, text: string): void => {
    addMessage(ch, { id: nextId(), ts: new Date(), type: 'error', text })
  }, [addMessage])

  // ── IRC event listener ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (_e: unknown, event: Record<string, unknown>) => {
      switch (event.type) {

        case 'connected':
          setConnected(true)
          setConnecting(false)
          setCurrentNick(event.nick as string)
          break

        case 'disconnected':
          setConnected(false)
          setConnecting(false)
          setCurrentNick('')
          setChannels(new Map())
          setActiveChannel(null)
          break

        case 'message': {
          const ch = event.channel as string
          addMessage(ch, {
            id:   nextId(),
            ts:   new Date(),
            type: 'message',
            nick: event.nick as string,
            text: event.text as string,
          })
          break
        }

        case 'join': {
          const ch = event.channel as string
          const nick = event.nick as string
          ensureChannel(ch)
          setChannels(prev => {
            const next = new Map(prev)
            const existing = next.get(ch) ?? { messages: [], names: [], topic: '' }
            if (!existing.names.includes(nick)) {
              next.set(ch, { ...existing, names: [...existing.names, nick] })
            }
            return next
          })
          addSystem(ch, `→ ${nick} joined ${ch}`)
          break
        }

        case 'part': {
          const ch = event.channel as string
          const nick = event.nick as string
          const reason = event.reason as string
          if (ch === '*') {
            // QUIT — remove from all channels
            setChannels(prev => {
              const next = new Map(prev)
              prev.forEach((state, key) => {
                next.set(key, { ...state, names: state.names.filter(n => n !== nick) })
              })
              return next
            })
          } else {
            setChannels(prev => {
              const next = new Map(prev)
              const existing = next.get(ch)
              if (existing) next.set(ch, { ...existing, names: existing.names.filter(n => n !== nick) })
              return next
            })
            addSystem(ch, `← ${nick} left ${ch}${reason ? ` (${reason})` : ''}`)
          }
          break
        }

        case 'nick': {
          const oldNick = event.oldNick as string
          const newNick = event.newNick as string
          if (oldNick === currentNick) setCurrentNick(newNick)
          setChannels(prev => {
            const next = new Map(prev)
            prev.forEach((state, ch) => {
              next.set(ch, {
                ...state,
                names: state.names.map(n => n === oldNick ? newNick : n),
              })
            })
            return next
          })
          break
        }

        case 'names': {
          const ch = event.channel as string
          const names = event.names as string[]
          setChannels(prev => {
            const next = new Map(prev)
            const existing = next.get(ch) ?? { messages: [], names: [], topic: '' }
            // Merge with existing to avoid blanking mid-session
            const merged = Array.from(new Set([...existing.names, ...names]))
            next.set(ch, { ...existing, names: merged })
            return next
          })
          break
        }

        case 'topic': {
          const ch = event.channel as string
          const topic = event.topic as string
          setChannels(prev => {
            const next = new Map(prev)
            const existing = next.get(ch) ?? { messages: [], names: [], topic: '' }
            next.set(ch, { ...existing, topic })
            return next
          })
          if (topic) addSystem(ch, `Topic: ${topic}`)
          break
        }

        case 'error':
          addError(activeChannel ?? '*', event.message as string)
          break
      }
    }

    window.electron.ipcRenderer.on('irc-event', handler)
    return () => { window.electron.ipcRenderer.removeListener('irc-event', handler) }
  }, [activeChannel, currentNick, addMessage, addSystem, addError, ensureChannel])

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (pinnedToBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [channels, activeChannel])

  // ── Connect / disconnect ────────────────────────────────────────────────────

  const handleConnect = async () => {
    if (!config.nick.trim() || !config.server.trim()) return
    setConnecting(true)
    setConnectedServer(`${config.server}:${config.port}`)
    const result = await window.api.ircConnect({
      server:   config.server.trim(),
      port:     config.port,
      nick:     config.nick.trim(),
      username: (config.username.trim() || config.nick.trim()),
      realname: (config.realname.trim() || config.nick.trim()),
      password: config.password?.trim() || undefined,
    })
    if ('error' in result) {
      setConnecting(false)
      setConnectedServer('')
    }
  }

  const handleDisconnect = async () => {
    await window.api.ircDisconnect()
  }

  const handleJoin = async () => {
    const ch = channelInput.trim()
    if (!ch) return
    const target = ch.startsWith('#') ? ch : `#${ch}`
    setChannelInput('')
    ensureChannel(target)
    await window.api.ircJoin({ channel: target })
  }

  const handlePart = async () => {
    if (!activeChannel) return
    await window.api.ircPart({ channel: activeChannel })
    setChannels(prev => {
      const next = new Map(prev)
      next.delete(activeChannel)
      return next
    })
    setActiveChannel(prev => {
      const remaining = [...channels.keys()].filter(k => k !== prev)
      return remaining[0] ?? null
    })
  }

  // ── Input handling with /commands ───────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || !connected) return
    setInput('')
    inputRef.current?.focus()

    // /commands
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(' ')
      const arg = rest.join(' ')

      switch (cmd.toLowerCase()) {
        case 'join': {
          const target = rest[0] ?? ''
          if (target) {
            const ch = target.startsWith('#') ? target : `#${target}`
            ensureChannel(ch)
            await window.api.ircJoin({ channel: ch })
          }
          return
        }
        case 'part':
          if (activeChannel) await window.api.ircPart({ channel: activeChannel })
          return
        case 'nick':
          if (rest[0]) await window.api.ircSetNick({ nick: rest[0] })
          return
        case 'msg': {
          const [target, ...msgParts] = rest
          if (target && msgParts.length) {
            await window.api.ircSendMessage({ target, text: msgParts.join(' ') })
          }
          return
        }
        case 'me': {
          if (activeChannel && arg) {
            await window.api.ircSendMessage({ target: activeChannel, text: `\x01ACTION ${arg}\x01` })
            addMessage(activeChannel, {
              id: nextId(), ts: new Date(), type: 'message',
              nick: currentNick, text: `* ${arg}`,
            })
          }
          return
        }
        default:
          addError(activeChannel ?? '*', `Unknown command: /${cmd}`)
          return
      }
    }

    // Regular message
    if (!activeChannel) return
    await window.api.ircSendMessage({ target: activeChannel, text })
    // Echo own message into the channel
    addMessage(activeChannel, {
      id: nextId(), ts: new Date(), type: 'message',
      nick: currentNick, text,
    })
  }, [input, connected, activeChannel, currentNick, addMessage, addError, ensureChannel])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const activeState = activeChannel ? channels.get(activeChannel) : undefined
  const visibleMessages = activeState?.messages ?? []

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'monospace' }}>

      {/* ── Connection form (disconnected) ─────────────────────────────────── */}
      {!connected && (
        <div style={{
          padding: '20px 24px', background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
            🌐 Connect to IRC
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Server</span>
              <input
                value={config.server}
                onChange={e => setConfig(c => ({ ...c, server: e.target.value }))}
                placeholder="irc.libera.chat"
                style={{ ...inputStyle, width: 180 }}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Port</span>
              <input
                type="number"
                value={config.port}
                onChange={e => setConfig(c => ({ ...c, port: parseInt(e.target.value) || 6667 }))}
                style={{ ...inputStyle, width: 70 }}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Nick</span>
              <input
                value={config.nick}
                onChange={e => setConfig(c => ({ ...c, nick: e.target.value }))}
                placeholder="YourNick"
                style={{ ...inputStyle, width: 120 }}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Username</span>
              <input
                value={config.username}
                onChange={e => setConfig(c => ({ ...c, username: e.target.value }))}
                placeholder="username"
                style={{ ...inputStyle, width: 120 }}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Real name</span>
              <input
                value={config.realname}
                onChange={e => setConfig(c => ({ ...c, realname: e.target.value }))}
                placeholder="Real Name"
                style={{ ...inputStyle, width: 140 }}
              />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Password</span>
              <input
                type="password"
                value={config.password ?? ''}
                onChange={e => setConfig(c => ({ ...c, password: e.target.value }))}
                placeholder="optional"
                style={{ ...inputStyle, width: 120 }}
              />
            </label>
          </div>
          <div>
            <button
              className="btn-primary"
              onClick={handleConnect}
              disabled={connecting || !config.nick.trim() || !config.server.trim()}
              style={{ fontSize: 13, padding: '6px 20px' }}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {/* ── Channel bar (connected) ────────────────────────────────────────── */}
      {connected && (
        <div style={{
          padding: '6px 12px', background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {connectedServer}
          </span>
          <span style={{ color: 'var(--text-dim)' }}>Nick: <strong>{currentNick}</strong></span>
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            <input
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="#channel"
              style={{ ...inputStyle, width: 110, fontSize: 11 }}
            />
            <button className="btn-ghost" onClick={handleJoin} style={{ fontSize: 11, padding: '2px 8px' }}>
              Join
            </button>
          </div>
          {activeChannel && (
            <button className="btn-ghost" onClick={handlePart} style={{ fontSize: 11, padding: '2px 8px' }}>
              Part
            </button>
          )}
          <button
            className="btn-ghost"
            onClick={handleDisconnect}
            style={{ fontSize: 11, padding: '2px 8px', color: '#e55', borderColor: '#e55', marginLeft: 'auto' }}
          >
            Disconnect
          </button>
        </div>
      )}

      {/* ── Channel tabs ──────────────────────────────────────────────────── */}
      {connected && channels.size > 0 && (
        <div style={{
          display: 'flex', gap: 2, padding: '4px 8px',
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
          overflowX: 'auto', flexShrink: 0,
        }}>
          {[...channels.keys()].map(ch => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              style={{
                padding: '3px 10px', fontSize: 12, borderRadius: 4, border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: activeChannel === ch ? 'var(--accent)' : 'var(--bg2)',
                color: activeChannel === ch ? 'var(--accent-text, #fff)' : 'var(--text)',
              }}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {/* ── Topic bar ───────────────────────────────────────────────────────── */}
      {activeState?.topic && (
        <div style={{
          padding: '4px 12px', fontSize: 11,
          color: 'var(--text-dim)', background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          📌 {activeState.topic}
        </div>
      )}

      {/* ── Message area ───────────────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={() => {
          const c = scrollContainerRef.current
          if (!c) return
          pinnedToBottom.current = c.scrollTop + c.clientHeight >= c.scrollHeight - 40
        }}
        style={{
          flex: 1, overflowY: 'auto', padding: '8px 12px',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}
      >
        {!connected && !connecting && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
            Fill in the connection form above to connect to an IRC server.
          </div>
        )}
        {connected && !activeChannel && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
            Connected. Join a channel to start chatting.
          </div>
        )}
        {visibleMessages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: 6, lineHeight: 1.4, fontSize: 13 }}>
            <span style={{ color: 'var(--text-dim)', flexShrink: 0, fontSize: 11, paddingTop: 1 }}>
              {formatTime(msg.ts)}
            </span>
            {msg.type === 'message' ? (
              <>
                <span style={{ color: 'var(--accent)', flexShrink: 0, fontWeight: 600 }}>
                  {msg.nick === currentNick ? `[${msg.nick}]` : `<${msg.nick}>`}
                </span>
                <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{msg.text}</span>
              </>
            ) : (
              <span style={{
                color: msg.type === 'error' ? '#e55' : 'var(--text-dim)',
                fontStyle: 'italic', wordBreak: 'break-word',
              }}>
                {msg.text}
              </span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input row ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 6, padding: '6px 10px',
        borderTop: '1px solid var(--border)', background: 'var(--bg2)',
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            !connected ? 'Not connected' :
            !activeChannel ? 'Join a channel first' :
            `Message ${activeChannel} — /join /part /nick /msg /me`
          }
          disabled={!connected || !activeChannel}
          style={{
            flex: 1, resize: 'none', fontFamily: 'monospace',
            fontSize: 13, lineHeight: '1.4', padding: '5px 8px',
          }}
        />
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={!connected || !activeChannel || !input.trim()}
          style={{ alignSelf: 'flex-end', fontSize: 12, padding: '5px 14px' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
}
const labelTextStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase',
}
const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: '4px 7px',
}
