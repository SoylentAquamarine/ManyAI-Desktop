/**
 * irc.ts — Preload bridge for IRC IPC channels.
 * Each function maps 1:1 to a channel in main/ipc/ircIpc.ts.
 */

import { ipcRenderer } from 'electron'

export const ircApi = {
  /** Open a TCP connection to an IRC server. Returns {ok} once the attempt starts; listen for 'irc-event' connected to confirm. */
  ircConnect: (args: {
    server: string
    port: number
    nick: string
    username: string
    realname: string
    password?: string
  }): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('irc-connect', args),

  /** Send QUIT and close the socket. */
  ircDisconnect: (): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('irc-disconnect'),

  /** Send PRIVMSG to a channel or nick. */
  ircSendMessage: (args: { target: string; text: string }): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('irc-send-message', args),

  /** Send JOIN for a channel. */
  ircJoin: (args: { channel: string }): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('irc-join', args),

  /** Send PART for a channel. */
  ircPart: (args: { channel: string }): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('irc-part', args),

  /** Send NICK to change the current nick. */
  ircSetNick: (args: { nick: string }): Promise<{ ok: true } | { error: string }> =>
    ipcRenderer.invoke('irc-set-nick', args),
}
