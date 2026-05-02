/**
 * ircIpc.ts — Main-process IPC handlers for IRC client functionality.
 *
 * Uses Node's built-in 'net' module for TCP connections. No external IRC libs.
 * Manages a single IRC connection at a time via module-level state.
 *
 * Channels registered:
 *   irc-connect        — open TCP socket, send NICK/USER/PASS
 *   irc-disconnect     — send QUIT, destroy socket
 *   irc-send-message   — send PRIVMSG to a target
 *   irc-join           — send JOIN
 *   irc-part           — send PART
 *   irc-set-nick       — send NICK
 *
 * Pushes 'irc-event' to the renderer with typed payloads (see IrcEvent below).
 */

import { ipcMain, WebContents } from 'electron'
import * as net from 'net'

// ── Types ─────────────────────────────────────────────────────────────────────

interface IrcConnection {
  socket: net.Socket
  webContents: WebContents
  nick: string
}

/** All event shapes pushed to the renderer on channel 'irc-event'. */
type IrcEvent =
  | { type: 'message';      channel: string; nick: string; text: string }
  | { type: 'join';         channel: string; nick: string }
  | { type: 'part';         channel: string; nick: string; reason: string }
  | { type: 'nick';         oldNick: string; newNick: string }
  | { type: 'names';        channel: string; names: string[] }
  | { type: 'topic';        channel: string; topic: string }
  | { type: 'connected';    nick: string }
  | { type: 'error';        message: string }
  | { type: 'disconnected' }
  | { type: 'raw';          line: string }

/** Parsed representation of a single IRC protocol line. */
interface ParsedLine {
  prefix?:  string   // nick!user@host or server
  command:  string   // PRIVMSG, JOIN, 001, etc.
  params:   string[] // space-separated parameters
  trailing: string   // text after the final colon
}

// ── Module-level state ────────────────────────────────────────────────────────

let conn: IrcConnection | null = null
let lineBuffer = ''

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Send an IRC event to the renderer that initiated the connection. */
function sendEvent(event: IrcEvent): void {
  if (conn?.webContents && !conn.webContents.isDestroyed()) {
    conn.webContents.send('irc-event', event)
  }
}

/** Write a raw IRC line to the socket (adds \r\n). */
function sendRaw(line: string): void {
  if (conn?.socket && !conn.socket.destroyed) {
    conn.socket.write(line + '\r\n', 'utf8')
  }
}

/** Clean up after a disconnect or error. */
function cleanup(): void {
  lineBuffer = ''
  conn = null
}

/**
 * Parse a single IRC protocol line into its components.
 * Format: [:prefix] COMMAND [params...] [:trailing]
 */
function parseLine(line: string): ParsedLine {
  let rest = line
  let prefix: string | undefined

  if (rest.startsWith(':')) {
    const space = rest.indexOf(' ')
    prefix = rest.slice(1, space)
    rest = rest.slice(space + 1)
  }

  let trailing = ''
  const trailingIdx = rest.indexOf(' :')
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2)
    rest = rest.slice(0, trailingIdx)
  }

  const parts = rest.split(' ').filter(Boolean)
  const command = parts[0] ?? ''
  const params = parts.slice(1)

  return { prefix, command, params, trailing }
}

/** Extract the nick from a prefix like nick!user@host. */
function nickFromPrefix(prefix?: string): string {
  if (!prefix) return ''
  return prefix.split('!')[0]
}

/**
 * Process the line buffer: split on \r\n, dispatch complete lines,
 * keep any trailing partial line in the buffer.
 */
function processBuffer(): void {
  const lines = lineBuffer.split('\r\n')
  lineBuffer = lines.pop() ?? '' // last element may be incomplete
  for (const line of lines) {
    if (line.trim()) handleLine(line)
  }
}

/**
 * Dispatch a parsed IRC line to the appropriate event handler.
 * Emits 'raw' for anything not explicitly handled.
 */
function handleLine(line: string): void {
  const { prefix, command, params, trailing } = parseLine(line)
  const nick = nickFromPrefix(prefix)

  switch (command) {
    // ── Keep-alive ─────────────────────────────────────────────────────���────
    case 'PING':
      sendRaw(`PONG :${trailing || params[0]}`)
      break

    // ── Welcome (connection confirmed) ──────────────────────────────────────
    case '001':
      if (conn) {
        // Server may have modified our nick — params[0] is the confirmed nick
        conn.nick = params[0] ?? conn.nick
        sendEvent({ type: 'connected', nick: conn.nick })
      }
      break

    // ── Nick already in use ─────────────────────────────────────────────────
    case '433':
      sendEvent({ type: 'error', message: `Nick "${params[1]}" is already in use` })
      break

    // ── NAMES reply ─────────────────────────────────────────────────────────
    case '353': {
      // params: [myNick, = | * | @, #channel]  trailing: space-separated nicks
      const channel = params[2] ?? ''
      const names = trailing.split(' ').filter(Boolean).map(n => n.replace(/^[@+]/, ''))
      sendEvent({ type: 'names', channel, names })
      break
    }

    // ── Topic ───────────────────────────────────────────────────────────────
    case '332': {
      const channel = params[1] ?? ''
      sendEvent({ type: 'topic', channel, topic: trailing })
      break
    }

    case 'TOPIC': {
      const channel = params[0] ?? ''
      sendEvent({ type: 'topic', channel, topic: trailing })
      break
    }

    // ── Messages ─────────────────────────────────────────────────────────────
    case 'PRIVMSG': {
      const target = params[0] ?? ''
      // CTCP ACTION (\x01ACTION text\x01) — display as /me
      const text = trailing.startsWith('\x01ACTION ')
        ? `* ${trailing.slice(8).replace(/\x01$/, '')}`
        : trailing
      sendEvent({ type: 'message', channel: target, nick, text })
      break
    }

    case 'NOTICE':
      // Treat notices as messages to the target or a '*' pseudo-channel
      sendEvent({ type: 'message', channel: params[0] ?? '*', nick, text: `[Notice] ${trailing}` })
      break

    // ── Channel membership ───────────────────────────────────────────────────
    case 'JOIN': {
      const channel = trailing || params[0] || ''
      sendEvent({ type: 'join', channel, nick })
      break
    }

    case 'PART': {
      const channel = params[0] ?? ''
      sendEvent({ type: 'part', channel, nick, reason: trailing })
      break
    }

    case 'QUIT':
      // No channel — renderer handles removing from all user lists
      sendEvent({ type: 'part', channel: '*', nick, reason: trailing })
      break

    // ── Nick change ──────────────────────────────────────────────────────────
    case 'NICK': {
      const newNick = trailing || params[0] || ''
      if (conn && nick === conn.nick) conn.nick = newNick
      sendEvent({ type: 'nick', oldNick: nick, newNick })
      break
    }

    // ── Server error ────────────────────────────────────────────────────────
    case 'ERROR':
      sendEvent({ type: 'error', message: trailing })
      break

    // ── Everything else ──────────────────────────────────────────────────────
    default:
      sendEvent({ type: 'raw', line })
  }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

/**
 * Open a TCP connection to an IRC server and register the connection state.
 * Returns immediately with {ok:true} once the socket connect attempt is started.
 * The renderer learns the connection is live when it receives {type:'connected'}.
 */
async function handleConnect(
  event: Electron.IpcMainInvokeEvent,
  args: { server: string; port: number; nick: string; username: string; realname: string; password?: string }
): Promise<{ ok: true } | { error: string }> {
  if (conn) return { error: 'Already connected. Disconnect first.' }

  const { server, port, nick, username, realname, password } = args
  const socket = new net.Socket()
  conn = { socket, webContents: event.sender, nick }

  socket.on('data', (data) => {
    lineBuffer += data.toString('utf8')
    processBuffer()
  })

  socket.on('error', (err) => {
    sendEvent({ type: 'error', message: err.message })
    cleanup()
  })

  socket.on('close', () => {
    sendEvent({ type: 'disconnected' })
    cleanup()
  })

  socket.connect(port, server, () => {
    if (password) sendRaw(`PASS ${password}`)
    sendRaw(`NICK ${nick}`)
    sendRaw(`USER ${username} 0 * :${realname}`)
  })

  return { ok: true }
}

/** Send QUIT and destroy the socket. */
async function handleDisconnect(): Promise<{ ok: true } | { error: string }> {
  if (!conn) return { error: 'Not connected' }
  sendRaw('QUIT :Goodbye')
  conn.socket.destroy()
  cleanup()  // clear conn immediately so reconnect isn't rejected while 'close' is pending
  return { ok: true }
}

/** Send PRIVMSG to a channel or user. */
async function handleSendMessage(
  _e: Electron.IpcMainInvokeEvent,
  { target, text }: { target: string; text: string }
): Promise<{ ok: true } | { error: string }> {
  if (!conn) return { error: 'Not connected' }
  sendRaw(`PRIVMSG ${target} :${text}`)
  return { ok: true }
}

/** Send JOIN for a channel. */
async function handleJoin(
  _e: Electron.IpcMainInvokeEvent,
  { channel }: { channel: string }
): Promise<{ ok: true } | { error: string }> {
  if (!conn) return { error: 'Not connected' }
  sendRaw(`JOIN ${channel}`)
  return { ok: true }
}

/** Send PART for a channel. */
async function handlePart(
  _e: Electron.IpcMainInvokeEvent,
  { channel }: { channel: string }
): Promise<{ ok: true } | { error: string }> {
  if (!conn) return { error: 'Not connected' }
  sendRaw(`PART ${channel}`)
  return { ok: true }
}

/** Send NICK to change the current nick. */
async function handleSetNick(
  _e: Electron.IpcMainInvokeEvent,
  { nick }: { nick: string }
): Promise<{ ok: true } | { error: string }> {
  if (!conn) return { error: 'Not connected' }
  sendRaw(`NICK ${nick}`)
  return { ok: true }
}

// ── Registration ──────────────────────────────────────────────────────────────

/** Register all IRC IPC handlers. Call once from main/ipc/index.ts. */
export function registerIrcIpc(): void {
  ipcMain.handle('irc-connect',      handleConnect)
  ipcMain.handle('irc-disconnect',   handleDisconnect)
  ipcMain.handle('irc-send-message', handleSendMessage)
  ipcMain.handle('irc-join',         handleJoin)
  ipcMain.handle('irc-part',         handlePart)
  ipcMain.handle('irc-set-nick',     handleSetNick)
}
